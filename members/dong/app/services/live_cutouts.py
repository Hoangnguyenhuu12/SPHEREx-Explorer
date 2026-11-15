"""Find and download IRSA exposures for API 0.1 requests."""

import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic
from urllib.parse import urlsplit

import requests
from diskcache import Cache

from shared.pipeline import irsa
from . import database_provider

from .catalog import position_at
from .observed_frames import Cutout

logger = logging.getLogger("uvicorn.error")


def collections_for_live():
    return (
        os.getenv("SPHEREX_COLLECTION", "spherex_dr1"),
        os.getenv("SPHEREX_COLLECTION_FALLBACK", "spherex_qr3"),
    )


def harvest_mode():
    return os.getenv("DATA_MODE", "fixture") == "harvest"


def database_mode():
    return os.getenv("DATA_MODE", "fixture") == "database"


def hybrid_mode():
    return os.getenv("DATA_MODE") == "hybrid"


def uses_database_cutouts(query):
    return database_mode() or (hybrid_mode() and query.target_key is not None)


def cached_result(operation, query, build):
    root = Path(os.getenv("DATA_DIR", "data")) / "cache" / "api-0.1-live"
    # Cache visit-grouped results separately from the previous exposure-level renderer.
    key = ("v4-visits", os.getenv("DATA_MODE", "fixture"), operation, collections_for_live(), query.model_dump_json())
    if hybrid_mode() and operation == "frames":
        key += ("catalog-or-coordinate-v1",)
    with Cache(str(root), size_limit=256 * 1024 * 1024, timeout=2) as cache:
        value = cache.get(key, retry=True)
        if value is not None:
            return value, "HIT"
        value = build()
        # Shorter TTL for incomplete/empty results so newly available data
        # or a recovered archive can be picked up on a later request.
        if operation == "frames":
            partial = "FEW_FRAMES" in value[0]["warnings"]
        else:
            partial = not value["points"]
        cache.set(key, value, expire=60 if partial else 900, retry=True)
        return value, "MISS"


def load_cutouts(query, directory):
    if harvest_mode():
        return load_harvest_cutouts(query)
    if uses_database_cutouts(query):
        database_cutouts = load_database_cutouts(query)
        if database_cutouts or database_mode():
            return database_cutouts
    size = getattr(query, "size", 0.1)
    predicted = position_at(query.target_key, 61100)
    ra, dec = (predicted.ra.deg, predicted.dec.deg) if predicted is not None else (query.ra, query.dec)
    deadline = monotonic() + 65
    collections = collections_for_live()
    discovery_errors = []
    successful_search = False
    for collection in dict.fromkeys(filter(None, collections)):
        started = monotonic()
        try:
            # Cutouts are centered on the requested position. Searching the
            # entire display FOV finds edge-only exposures that cannot serve it.
            rows = irsa.find_images(
                ra, dec, collection, query.detector,
                search_radius_deg=0.02 if predicted is not None else 1 / 3600,
                timeout_s=12, retries=1, deadline=deadline, tap_fallback=False,
            )
        except irsa.UpstreamError as exc:
            discovery_errors.append(exc)
            logger.warning("IRSA discovery collection=%s result=%s duration_ms=%.0f",
                           collection, type(exc).__name__, (monotonic() - started) * 1000)
            continue
        successful_search = True
        logger.info("IRSA discovery collection=%s rows=%d duration_ms=%.0f",
                    collection, len(rows), (monotonic() - started) * 1000)
        if rows:
            break
    else:
        if not successful_search and discovery_errors:
            raise discovery_errors[-1]
        return ()

    # Sample each visit across detectors before spending the download budget.
    selected = []
    for visit in irsa.group_images_into_visits(rows)[:6]:
        by_detector = {}
        for row in visit:
            by_detector.setdefault(row["energy_bandpassname"], []).append(row)
        selected.extend(by_detector.values())

    def download(index, row):
        url = urlsplit(row["access_url"])
        if url.scheme != "https" or url.netloc != "irsa.ipac.caltech.edu":
            raise irsa.UpstreamError("Unexpected IRSA product URL")
        mjd = float(row["t_min"])
        position = position_at(query.target_key, mjd)
        x, y = (position.ra.deg, position.dec.deg) if position is not None else (ra, dec)
        path = Path(directory) / f"{index}.fits"
        irsa.download_cutout(
            row["access_url"], x, y, size, path, expected_obs_id=row["obs_id"],
            timeout_s=irsa._remaining_timeout(12, deadline), retries=1,
        )
        stat = path.stat()
        return Cutout(
            path, row["obs_id"], int(row["energy_bandpassname"].rsplit("D", 1)[1]),
            mjd, collection.removeprefix("spherex_").removesuffix("_deep"),
            "", stat.st_size, stat.st_mtime_ns,
        )

    def download_visit(item):
        index, candidates = item
        failure = None
        for row in candidates[:2]:
            try:
                return download(index, row), None
            except irsa.UpstreamTimeout as exc:
                return None, exc
            except (requests.RequestException, ValueError) as exc:
                if not (isinstance(exc, ValueError) and str(exc).startswith("HTTP 422")):
                    failure = exc
        return None, failure

    started = monotonic()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(download_visit, enumerate(selected)))
    cutouts = [cutout for cutout, _ in results if cutout is not None]
    failed = [error for _, error in results if error is not None]
    logger.info("IRSA downloads collection=%s completed=%d failed=%d duration_ms=%.0f",
                collection, len(cutouts), len(failed), (monotonic() - started) * 1000)
    if not cutouts and failed:
        if any(isinstance(error, (requests.Timeout, irsa.UpstreamTimeout)) for error in failed):
            raise irsa.UpstreamTimeout("IRSA cutout requests timed out")
        raise irsa.UpstreamError("IRSA cutout requests failed")
    return tuple(cutouts)


def load_harvest_cutouts(query):
    """Read Khôi's downloaded QR3 FITS from data/harvest without network access."""
    root = Path(os.getenv("DATA_DIR", "data")) / "harvest" / str(query.target_key) / "spherex"
    if not root.is_dir():
        return ()
    result = []
    for path in root.glob("*.fits"):
        match = re.search(r"_D([1-6])_", path.name)
        if match is None or int(match.group(1)) != query.detector:
            continue
        try:
            from astropy.io import fits
            with fits.open(path, memmap=False) as hdus:
                header = hdus["IMAGE"].header
                obs_id = str(header["OBSID"])
                mjd = float(header["MJD-AVG"])
        except (OSError, KeyError, TypeError, ValueError):
            continue
        result.append(Cutout(path.resolve(), obs_id, query.detector, mjd, "qr3", "", path.stat().st_size, path.stat().st_mtime_ns))
    result.sort(key=lambda item: item.mjd)
    max_frames = getattr(query, "max_frames", 60)
    if len(result) > max_frames:
        indices = [round(i * (len(result) - 1) / (max_frames - 1)) for i in range(max_frames)] if max_frames > 1 else [0]
        result = [result[index] for index in indices]
    return tuple(result)


def _storage_public_url(rel_path: str) -> str:
    clean = str(rel_path or "").strip()
    if clean.startswith(("http://", "https://", "/api/")):
        return clean
    base = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "spherex-dr1-demo").strip() or "spherex-dr1-demo"
    if base:
        return f"{base}/storage/v1/object/public/{bucket}/{clean.lstrip('/')}"
    return f"/api/frames/sequences/{clean.lstrip('/')}"


def _normalize_iso_utc(raw: str | None) -> str:
    text = str(raw or "").strip()
    if not text:
        return "2025-01-01T00:00:00Z"
    if text.endswith("+00:00"):
        return text[:-6] + "Z"
    if not text.endswith("Z") and "+" not in text[10:]:
        return text + "Z"
    return text


def load_database_spherex_frames(query, target):
    """Build SPHEREx-only Frames from sky_archive.dr1_frames + dr1_sequences (Storage PNGs)."""
    from ..api_models import Frame, Frames, Grid, Norm
    from .observed_frames import position_at

    target_key = target.target_key or query.target_key
    if not target_key:
        return None
    detector = int(query.detector)

    try:
        db_frames = database_provider.dr1_frames(target_key=target_key, detector=detector)
    except Exception:
        db_frames = []
    try:
        seqs = database_provider.dr1_sequences(target_key=target_key, detector=detector)
    except Exception:
        seqs = []

    downloaded_inside = [
        row
        for row in db_frames
        if row.get("download_status") == "downloaded" and row.get("target_inside") is True
    ]
    usable_frames = [row for row in downloaded_inside if row.get("usable") is True]
    by_id = {str(row.get("frame_id")): row for row in downloaded_inside if row.get("frame_id")}

    valid_seqs = [
        s
        for s in seqs
        if isinstance(s.get("assets"), dict)
        and (s["assets"].get("frames") or [])
        and isinstance((s.get("report") or {}).get("inputs"), list)
        and len((s.get("report") or {}).get("inputs") or []) == len(s["assets"].get("frames") or [])
    ]

    if valid_seqs:
        has_usable_pair = len(usable_frames) >= 2 or (not db_frames and any(s.get("kind") == "screened" for s in valid_seqs))
        if has_usable_pair:
            valid_seqs.sort(
                key=lambda s: (
                    s.get("kind") != "screened",
                    not bool(s.get("is_primary")),
                    -int(s.get("frame_count") or 0),
                )
            )
        else:
            valid_seqs.sort(
                key=lambda s: (
                    not bool(s.get("is_primary")),
                    s.get("kind") != "screened",
                    -int(s.get("frame_count") or 0),
                )
            )
        seq = valid_seqs[0]
        inputs = (seq.get("report") or {}).get("inputs") or []
        assets = seq.get("assets") or {}
        asset_frames = assets.get("frames") or []
        asset_diffs = assets.get("diffs") or []
        frame_ids = seq.get("frame_ids") or []

        w = int(seq.get("grid_width") or 47)
        h = int(seq.get("grid_height") or 47)
        scale = float(seq.get("pixel_scale_arcsec") or 6.15)

        mid_mjd = (float(inputs[0]["mjd"]) + float(inputs[-1]["mjd"])) / 2.0
        pos = position_at(target_key, mid_mjd)
        if pos is not None:
            center_ra = round(float(pos.ra.deg), 6)
            center_dec = round(float(pos.dec.deg), 6)
        else:
            center_ra = round(float(target.ra), 6)
            center_dec = round(float(target.dec), 6)

        grid = Grid(
            width=w,
            height=h,
            pixscale_arcsec=scale,
            projection="TAN",
            center_ra=center_ra,
            center_dec=center_dec,
        )

        norm_raw = seq.get("norm") or (seq.get("report") or {}).get("norm") or {}
        vmin = float(norm_raw.get("vmin", 0.0))
        vmax = float(norm_raw.get("vmax", 1.0))
        if vmin >= vmax:
            vmax = vmin + 1.0
        norm = Norm(vmin=round(vmin, 4), vmax=round(vmax, 4), stretch="asinh")

        built_frames: list[Frame] = []
        any_unusable = (seq.get("kind") == "display_only") or (bool(downloaded_inside) and not usable_frames)
        for idx, inp in enumerate(inputs):
            fid = str(frame_ids[idx]) if idx < len(frame_ids) else f"{target_key}:{inp.get('obs_id', idx)}:D{detector}"
            dbf = by_id.get(fid) or {}
            mjd = round(float(inp.get("mjd") or dbf.get("observed_mjd")), 5)
            iso = _normalize_iso_utc(inp.get("iso_utc") or dbf.get("observed_at"))
            wave = round(float(inp.get("wavelength_um") or dbf.get("wavelength_um") or 1.0), 4)
            bw_raw = inp.get("bandwidth_um") if inp.get("bandwidth_um") is not None else dbf.get("bandwidth_um")
            bw = round(float(bw_raw), 4) if bw_raw is not None and float(bw_raw) > 0 else None

            xy_lower = inp.get("predicted_pixel_xy_origin_lower")
            if isinstance(xy_lower, (list, tuple)) and len(xy_lower) == 2:
                pred_px = (round(float(xy_lower[0]), 3), round(float(h - 1) - float(xy_lower[1]), 3))
            else:
                pred_px = (round(w / 2 - 0.5, 3), round(h / 2 - 0.5, 3))

            usable_flag = (
                bool(dbf.get("usable"))
                if "usable" in dbf
                else bool(inp.get("usable_for_candidate", seq.get("kind") == "screened"))
            )
            if not usable_flag or bool(dbf.get("bad_flags")):
                any_unusable = True

            obs_id = str(inp.get("obs_id") or dbf.get("obs_id") or f"frame-{idx + 1}")
            png_url = _storage_public_url(asset_frames[idx])
            diff_url = _storage_public_url(asset_diffs[idx]) if idx < len(asset_diffs) else None

            built_frames.append(
                Frame(
                    id=f"spherex-dr1-{target_key}-d{detector}-{obs_id}",
                    mjd=mjd,
                    iso=iso,
                    wavelength_um=wave,
                    bandwidth_um=bw,
                    release=str(dbf.get("release") or (seq.get("report") or {}).get("release") or "dr1"),
                    survey=1,
                    bad_pixel_frac=0.0 if usable_flag else None,
                    predicted_px=pred_px,
                    png=png_url,
                    diff_png=diff_url,
                    mission="SPHEREx",
                    band_or_detector=f"D{detector}",
                    quality_label="screened_dr1_usable" if usable_flag else "saturated_or_flagged_fallback",
                    source_product_id=dbf.get("product_id"),
                )
            )

        built_frames.sort(key=lambda f: f.mjd)
        warnings: list[str] = []
        if any_unusable:
            warnings.append("SATURATION_POSSIBLE")
        max_frames = int(getattr(query, "max_frames", 60))
        if len(built_frames) > max_frames:
            built_frames = built_frames[:max_frames]
            warnings.append("TRUNCATED")
        if len(built_frames) < 2:
            warnings.append("FEW_FRAMES")

        return Frames(
            api_version="0.1",
            target=target,
            detector=detector,
            grid=grid,
            norm=norm,
            reference_frame_id=built_frames[0].id if built_frames else None,
            frames=built_frames,
            warnings=warnings,
        )

    if downloaded_inside:
        chosen = usable_frames if usable_frames else downloaded_inside
        chosen = sorted(chosen, key=lambda r: (float(r.get("observed_mjd") or 0.0), str(r.get("obs_id") or "")))
        any_unusable = (not usable_frames) or any(not bool(r.get("usable", True)) or bool(r.get("bad_flags")) for r in chosen)
        w, h, scale = 47, 47, 6.15
        mid_mjd = (float(chosen[0]["observed_mjd"]) + float(chosen[-1]["observed_mjd"])) / 2.0
        pos = position_at(target_key, mid_mjd)
        center_ra = round(float(pos.ra.deg), 6) if pos is not None else round(float(target.ra), 6)
        center_dec = round(float(pos.dec.deg), 6) if pos is not None else round(float(target.dec), 6)
        grid = Grid(width=w, height=h, pixscale_arcsec=scale, projection="TAN", center_ra=center_ra, center_dec=center_dec)
        norm = Norm(vmin=0.0, vmax=1.0, stretch="asinh")
        built_frames = []
        for idx, dbf in enumerate(chosen):
            mjd = round(float(dbf.get("observed_mjd")), 5)
            obs_id = str(dbf.get("obs_id") or f"frame-{idx + 1}")
            usable_flag = bool(dbf.get("usable", False))
            px = dbf.get("predicted_pixel_x")
            py = dbf.get("predicted_pixel_y")
            pred_px = (round(float(px), 3), round(float(py), 3)) if px is not None and py is not None else (23.0, 23.0)
            png_url = str(dbf.get("storage_url") or dbf.get("cutout_url") or f"/api/frames/{target_key}/d{detector}/{obs_id}.png")
            built_frames.append(
                Frame(
                    id=f"spherex-dr1-{target_key}-d{detector}-{obs_id}",
                    mjd=mjd,
                    iso=_normalize_iso_utc(dbf.get("observed_at")),
                    wavelength_um=round(float(dbf.get("wavelength_um") or 1.0), 4),
                    bandwidth_um=round(float(dbf["bandwidth_um"]), 4) if dbf.get("bandwidth_um") else None,
                    release=str(dbf.get("release") or "dr1"),
                    survey=1,
                    bad_pixel_frac=0.0 if usable_flag else None,
                    predicted_px=pred_px,
                    png=png_url,
                    diff_png=None,
                    mission="SPHEREx",
                    band_or_detector=f"D{detector}",
                    quality_label="screened_dr1_usable" if usable_flag else "saturated_or_flagged_fallback",
                    source_product_id=dbf.get("product_id"),
                )
            )
        warnings = []
        if any_unusable:
            warnings.append("SATURATION_POSSIBLE")
        max_frames = int(getattr(query, "max_frames", 60))
        if len(built_frames) > max_frames:
            built_frames = built_frames[:max_frames]
            warnings.append("TRUNCATED")
        if len(built_frames) < 2:
            warnings.append("FEW_FRAMES")
        return Frames(
            api_version="0.1",
            target=target,
            detector=detector,
            grid=grid,
            norm=norm,
            reference_frame_id=built_frames[0].id if built_frames else None,
            frames=built_frames,
            warnings=warnings,
        )

    return None


def load_database_cutouts(query):
    result = []
    try:
        db_frames = database_provider.dr1_frames(query.target_key, query.detector)
    except Exception:
        db_frames = []
    downloaded_inside = [
        row
        for row in db_frames
        if row.get("download_status") == "downloaded" and row.get("target_inside") is True
    ]
    usable_frames = [row for row in downloaded_inside if row.get("usable") is True]
    candidates = usable_frames if usable_frames else downloaded_inside
    for row in candidates:
        prov = row.get("provenance") or {}
        relative = prov.get("file") or row.get("local_fits_path")
        if not relative:
            continue
        path = Path(relative)
        if not path.is_absolute():
            alt = Path(os.getenv("DATA_DIR", "data")) / path
            path = path if path.is_file() else alt
        if not path.is_file():
            continue
        result.append(
            Cutout(
                path.resolve(),
                str(row.get("obs_id", path.stem)),
                int(query.detector),
                float(row.get("observed_mjd")),
                str(row.get("release") or "dr1"),
                str(row.get("cutout_sha256") or ""),
                path.stat().st_size,
                path.stat().st_mtime_ns,
            )
        )
    if result or db_frames:
        result.sort(key=lambda item: item.mjd)
        return tuple(result[: getattr(query, "max_frames", 60)])

    for product in database_provider.products_for_target(query.target_key):
        match = re.search(r"D([1-6])", str(product.get("band") or ""), re.IGNORECASE)
        if match is None or int(match.group(1)) != query.detector:
            continue
        metadata = product.get("metadata") or {}
        relative = product.get("local_file") or metadata.get("relative_path") or metadata.get("fits_path")
        if not relative:
            continue
        path = Path(relative)
        if not path.is_absolute():
            data_dir = Path(os.getenv("DATA_DIR", "data"))
            path = data_dir.joinpath(*path.parts[1:]) if path.parts[0] == "data" else data_dir / path
        if not path.is_file():
            continue
        result.append(Cutout(path.resolve(), str(product.get("obs_id", path.stem)), query.detector, float(product.get("mjd_start")), str(product.get("collection", "")).removeprefix("spherex_"), "", path.stat().st_size, path.stat().st_mtime_ns))
    result.sort(key=lambda item: item.mjd)
    return tuple(result[:getattr(query, "max_frames", 60)])


def workspace():
    root = Path(os.getenv("DATA_DIR", "data")) / "cache"
    root.mkdir(parents=True, exist_ok=True)
    return TemporaryDirectory(prefix="irsa-", dir=root)
