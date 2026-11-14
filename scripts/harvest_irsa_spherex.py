"""SPHEREx IRSA SIA + DR1 HiPS Cube pipeline reusing harvest_sky_archive and import_sky_archive."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys
from tempfile import NamedTemporaryFile

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
import numpy as np
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from members.dong.app.services.catalog import position_at, targets  # noqa: E402
from scripts.harvest_sky_archive import (  # noqa: E402
    COLLECTIONS,
    download_cutout,
    insert,
    metadata,
    read_table,
    scalar,
    sql_value,
)
from scripts.import_sky_archive import connection_settings, run_psql  # noqa: E402
from shared.pipeline.irsa import IRSA_SIA_URL  # noqa: E402

MIGRATION_PATH = ROOT / "scripts" / "migrations" / "003_spherex_irsa_pipeline.sql"
HIPS_BASE_URL = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube"
HIPS_SAMPLE_TILES = (
    "Norder0/Dir0/Npix0.png",
    "Norder0/Dir0/Npix1.png",
    "Norder1/Dir0/Npix0.png",
)
# SPHEREx bad bitmask: allow SOURCE (bit 0 = 1) and FULLSAMPLE (bit 1 = 2) or similar;
# here we record raw flag value and treat non-finite pixels as invalid.


def parse_detector(band_name, obs_id=""):
    for text in (band_name or "", obs_id or ""):
        m = re.search(r"(?:SPHEREx-)?D([1-6])\b", str(text), re.IGNORECASE)
        if m:
            return f"D{m.group(1)}"
        # obs_id format like 2025W18_1B_0081_2 -> trailing _1.._6 is detector
        m2 = re.search(r"_([1-6])$", str(text).strip())
        if m2:
            return f"D{m2.group(1)}"
    return None


def build_session():
    session = requests.Session()
    session.mount(
        "https://",
        HTTPAdapter(
            max_retries=Retry(
                total=4,
                backoff_factor=2.0,
                status_forcelist=(429, 500, 502, 503, 504),
                raise_on_status=False,
            )
        ),
    )
    return session


def inspect_cutout_fits(path, ra_deg, dec_deg):
    """Open FITS cutout, verify WCS and valid pixels at the target coordinate."""
    with fits.open(path) as hdus:
        image_hdu = hdus["IMAGE"] if "IMAGE" in hdus else hdus[0]
        data = image_hdu.data
        header = image_hdu.header
        if data is None or data.ndim < 2:
            raise ValueError(f"Invalid image HDU in {path}")
        finite_mask = np.isfinite(data)
        valid_fraction = float(np.mean(finite_mask))

        wcs = WCS(header)
        wcs_ok = bool(wcs.has_celestial)
        target_finite = None
        target_flags = None

        if wcs_ok:
            px, py = wcs.world_to_pixel(SkyCoord(ra_deg, dec_deg, unit="deg"))
            ix, iy = int(round(float(px))), int(round(float(py)))
            ny, nx = data.shape[-2], data.shape[-1]
            if 0 <= ix < nx and 0 <= iy < ny:
                target_finite = bool(np.isfinite(data[iy, ix]))
                if "FLAGS" in hdus and hdus["FLAGS"].data is not None:
                    target_flags = int(hdus["FLAGS"].data[iy, ix])
            else:
                target_finite = False

    has_valid = bool(wcs_ok and target_finite is True)
    return {
        "wcs_verified": wcs_ok,
        "valid_pixel_fraction": valid_fraction,
        "target_pixel_finite": target_finite,
        "target_pixel_flags": target_flags,
        "has_valid_target_pixel": has_valid,
    }


def query_sia(session, collection, ra, dec, radius):
    try:
        response = session.get(
            IRSA_SIA_URL,
            params={
                "COLLECTION": collection,
                "POS": f"CIRCLE {ra:.8f} {dec:.8f} {radius}",
                "MAXREC": 10000,
            },
            timeout=(15, 65),
        )
        response.raise_for_status()
        tbl = read_table(response)
        rows = []
        for row in tbl:
            if row["obs_collection"] != collection or row["access_format"] != "image/fits":
                continue
            raw_url = str(row["access_url"])
            if not raw_url.startswith("https://irsa.ipac.caltech.edu/"):
                continue
            rows.append((row, response.url))
        return "ok", None, rows
    except Exception as exc:
        return "api_error", f"{type(exc).__name__}: {exc}", []


def harvest_hips_layer(session, storage_dir):
    props_url = f"{HIPS_BASE_URL}/properties"
    resp = session.get(props_url, timeout=(10, 30))
    resp.raise_for_status()
    props = {}
    for line in resp.text.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        props[k.strip()] = v.strip()

    verified_tiles = []
    tiles_dir = storage_dir / "hips" / "spherex_dr1_cube"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    for rel_tile in HIPS_SAMPLE_TILES:
        tile_url = f"{HIPS_BASE_URL}/{rel_tile}"
        local_tile = tiles_dir / rel_tile.replace("/", "_")
        try:
            r = session.get(tile_url, timeout=(10, 30))
            if r.status_code == 200 and len(r.content) > 0:
                local_tile.write_bytes(r.content)
                sha = hashlib.sha256(r.content).hexdigest()
                verified_tiles.append({
                    "tile": rel_tile,
                    "url": tile_url,
                    "status": r.status_code,
                    "bytes": len(r.content),
                    "content_type": r.headers.get("content-type"),
                    "sha256": sha,
                    "local_path": local_tile.relative_to(ROOT).as_posix(),
                })
            else:
                verified_tiles.append({
                    "tile": rel_tile,
                    "url": tile_url,
                    "status": r.status_code,
                    "bytes": len(r.content),
                })
        except Exception as exc:
            verified_tiles.append({
                "tile": rel_tile,
                "url": tile_url,
                "error": f"{type(exc).__name__}: {exc}",
            })

    spectral_metadata = {
        "cube": True,
        "cube_frames": 102,
        "wavelength_range_um": [0.75, 5.0],
        "em_min_m": 7.43e-7,
        "em_max_m": 5.009e-6,
        "dichroic_blank_frames": [50, 51],
        "hips_release_date": props.get("hips_release_date"),
        "hips_builder": props.get("hips_builder"),
        "credit": "NASA/SPHEREx, HiPS by Caltech/IPAC IRSA",
        "properties": props,
    }
    return (
        props.get("creator_did", "ivo://IPAC/P/SPHEREx/DR1/cube"),
        props.get("obs_title", "SPHEREx DR1 all-sky data cube"),
        HIPS_BASE_URL,
        props_url,
        props.get("hips_version", "1.4"),
        props.get("hips_frame", "equatorial"),
        int(props["hips_order"]) if props.get("hips_order", "").isdigit() else 5,
        int(props["hips_tile_width"]) if props.get("hips_tile_width", "").isdigit() else 512,
        spectral_metadata,
        {"tiles": verified_tiles},
    )


def pick_cutout_candidates(rows, max_cutouts, prioritize_detectors=()):
    """Select time-spread observations, optionally prioritizing specific detectors."""
    if not rows or max_cutouts <= 0:
        return []
    ordered = sorted(rows, key=lambda r: (r["mjd_start"] is None, r["mjd_start"] or 0.0, r["product_id"]))
    chosen = []
    seen = set()
    for det in prioritize_detectors:
        for r in ordered:
            if r["detector"] == det and r["product_id"] not in seen:
                chosen.append(r)
                seen.add(r["product_id"])
                break
    remaining = [r for r in ordered if r["product_id"] not in seen]
    need = max(0, max_cutouts - len(chosen))
    if need > 0 and remaining:
        if len(remaining) <= need:
            chosen.extend(remaining)
        else:
            step = (len(remaining) - 1) / max(1, need - 1)
            idxs = sorted({round(i * step) for i in range(need)}) if need > 1 else [0]
            for i in idxs:
                chosen.append(remaining[i])
    return chosen


def run_pipeline(args):
    migration_sql = MIGRATION_PATH.read_text(encoding="utf-8")
    session = build_session()

    if args.ra is not None:
        key = args.target_key or f"custom:{args.ra:.6f}:{args.dec:.6f}"
        target_list = [(key, f"ICRS {args.ra:g} {args.dec:+g}", args.ra, args.dec, True)]
    else:
        keys = args.targets or list(targets().keys())
        target_list = []
        for k in keys:
            cat = targets()[k][0]
            target_list.append((k, cat["name"], cat["ra"], cat["dec"], False))

    all_targets_rows = []
    all_products_rows = []
    all_target_products_rows = []
    all_cutouts_rows = []
    all_spherex_obs_rows = []
    all_audits_rows = []

    for key, name, base_ra, base_dec, is_custom in target_list:
        all_targets_rows.append((key, name, base_ra, base_dec))
        for collection in COLLECTIONS:
            # Determine query position (epoch-aware for catalog targets)
            epoch_mjd = 60800.0 if collection == "spherex_qr3" else args.center_mjd
            if is_custom:
                q_ra, q_dec = base_ra, base_dec
            else:
                pos = position_at(key, epoch_mjd)
                q_ra, q_dec = (float(pos.ra.deg), float(pos.dec.deg)) if pos is not None else (base_ra, base_dec)

            # For wise0855 in QR3, test default radius and widen if 0 products
            radii_to_try = [args.radius_deg]
            if key == "wise0855" and collection == "spherex_qr3" and args.radius_deg < 0.25:
                radii_to_try.extend([0.25, 0.5])

            final_status, final_err, sia_rows, used_radius = "ok", None, [], args.radius_deg
            for rad in radii_to_try:
                used_radius = rad
                status, err, rows = query_sia(session, collection, q_ra, q_dec, rad)
                final_status, final_err, sia_rows = status, err, rows
                if status == "api_error" or len(rows) > 0:
                    break

            det_counts = {}
            parsed_rows = []
            for raw_row, src_url in sia_rows:
                did = scalar(raw_row["obs_publisher_did"])
                raw_url = str(raw_row["access_url"])
                product_id = did or raw_url
                obs_id = str(raw_row["obs_id"])
                band_name = scalar(raw_row["energy_bandpassname"])
                detector = parse_detector(band_name, obs_id)
                if detector:
                    det_counts[detector] = det_counts.get(detector, 0) + 1
                mjd_start = scalar(raw_row["t_min"])
                mjd_end = scalar(raw_row["t_max"])
                em_min = scalar(raw_row["em_min"]) if "em_min" in raw_row.colnames else None
                em_max = scalar(raw_row["em_max"]) if "em_max" in raw_row.colnames else None
                s_ra = scalar(raw_row["s_ra"]) if "s_ra" in raw_row.colnames else None
                s_dec = scalar(raw_row["s_dec"]) if "s_dec" in raw_row.colnames else None
                s_region = scalar(raw_row["s_region"]) if "s_region" in raw_row.colnames else None
                meta = metadata(raw_row, src_url)

                all_products_rows.append((
                    product_id, collection, obs_id, did, band_name, mjd_start, mjd_end, raw_url, meta
                ))
                all_target_products_rows.append((key, product_id, q_ra, q_dec, used_radius))
                parsed_rows.append({
                    "product_id": product_id,
                    "target_key": key,
                    "release": collection,
                    "obs_id": obs_id,
                    "publisher_did": did,
                    "detector": detector,
                    "band_name": band_name,
                    "mjd_start": mjd_start,
                    "mjd_end": mjd_end,
                    "em_min_m": em_min,
                    "em_max_m": em_max,
                    "s_ra": s_ra,
                    "s_dec": s_dec,
                    "s_region": s_region,
                    "access_url": raw_url,
                    "query_ra_deg": q_ra,
                    "query_dec_deg": q_dec,
                    "query_radius_deg": used_radius,
                    "provenance": meta,
                })

            # Download FITS cutouts for barnard, wise0855, and epsindib QR3 D1/D4
            cutout_target = 0
            prio_dets = ()
            if key in ("barnard", "wise0855"):
                cutout_target = args.cutouts
            elif key == "epsindib" and collection == "spherex_qr3":
                cutout_target = max(2, min(args.cutouts, 2))
                prio_dets = ("D1", "D4")

            candidates = pick_cutout_candidates(parsed_rows, cutout_target, prioritize_detectors=prio_dets)
            checked_count = 0
            valid_pixel_count = 0
            cutout_results = {}

            for cand in candidates:
                obs_epoch = cand["mjd_start"] if cand["mjd_start"] is not None else epoch_mjd
                if not is_custom:
                    obs_pos = position_at(key, obs_epoch)
                    c_ra, c_dec = (float(obs_pos.ra.deg), float(obs_pos.dec.deg)) if obs_pos is not None else (q_ra, q_dec)
                else:
                    c_ra, c_dec = q_ra, q_dec

                prod_tuple = (
                    cand["product_id"], cand["release"], cand["obs_id"], cand["publisher_did"],
                    cand["band_name"], cand["mjd_start"], cand["mjd_end"], cand["access_url"], cand["provenance"]
                )
                try:
                    c_row = download_cutout(session, prod_tuple, key, (c_ra, c_dec), args.size_deg, args.storage)
                    all_cutouts_rows.append(c_row)
                    local_path = (args.storage / c_row[4])
                    info = inspect_cutout_fits(local_path, c_ra, c_dec)
                    info["local_cutout_path"] = local_path.relative_to(ROOT).as_posix()
                    cutout_results[cand["product_id"]] = info
                    checked_count += 1
                    if info["has_valid_target_pixel"]:
                        valid_pixel_count += 1
                    print(
                        f"[CUTOUT] {key} {collection} {cand['detector']} {cand['obs_id']}: "
                        f"wcs={info['wcs_verified']} finite={info['target_pixel_finite']} "
                        f"flags={info['target_pixel_flags']} valid_frac={info['valid_pixel_fraction']:.3f}",
                        flush=True,
                    )
                except Exception as exc:
                    print(f"[CUTOUT WARN] {key} {collection} {cand['obs_id']}: {type(exc).__name__}: {exc}", file=sys.stderr)

            for r in parsed_rows:
                ci = cutout_results.get(r["product_id"], {})
                all_spherex_obs_rows.append((
                    r["product_id"], r["target_key"], r["release"], r["obs_id"], r["publisher_did"],
                    r["detector"], r["band_name"], r["mjd_start"], r["mjd_end"],
                    r["em_min_m"], r["em_max_m"], r["s_ra"], r["s_dec"], r["s_region"],
                    r["access_url"], True,
                    ci.get("has_valid_target_pixel"),
                    bool(ci.get("wcs_verified", False)),
                    ci.get("valid_pixel_fraction"),
                    ci.get("target_pixel_finite"),
                    ci.get("target_pixel_flags"),
                    ci.get("local_cutout_path"),
                    r["query_ra_deg"], r["query_dec_deg"], r["query_radius_deg"],
                    r["provenance"],
                ))

            if final_status == "api_error":
                classification = "api_error"
            elif len(parsed_rows) == 0:
                classification = "no_products_found"
            elif valid_pixel_count > 0:
                classification = "has_valid_target_pixel"
            else:
                classification = "intersects_query_only"

            audit_id = f"{key}:{collection}:{q_ra:.6f}:{q_dec:.6f}:{used_radius:g}:{epoch_mjd:g}"
            all_audits_rows.append((
                audit_id, key, collection, epoch_mjd, q_ra, q_dec, used_radius,
                final_status, final_err, len(parsed_rows), det_counts,
                checked_count, valid_pixel_count, classification,
                f"Tried radii={radii_to_try}; used={used_radius}; dets={det_counts}",
            ))
            print(
                f"[SIA] {key} {collection} (ra={q_ra:.4f}, dec={q_dec:.4f}, r={used_radius}): "
                f"status={classification}, count={len(parsed_rows)}, dets={det_counts}",
                flush=True,
            )

    hips_row = harvest_hips_layer(session, args.storage.parent)
    print(f"[HiPS] {hips_row[0]} tiles_checked={len(hips_row[9]['tiles'])}", flush=True)

    # Emit re-runnable SQL
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", dir=args.output.parent, encoding="utf-8", newline="\n", delete=False) as tmp:
        tmp_path = Path(tmp.name)
        tmp.write("BEGIN;\nSET LOCAL standard_conforming_strings = on;\n")
        tmp.write((ROOT / "scripts" / "sky_archive_schema.sql").read_text(encoding="utf-8") + "\n")
        tmp.write(migration_sql + "\n")
        tmp.writelines(insert("targets", ("target_key", "name", "ra_deg", "dec_deg"), ("target_key",), all_targets_rows))
        if all_products_rows:
            tmp.writelines(insert(
                "products",
                ("product_id", "collection", "obs_id", "publisher_did", "band", "mjd_start", "mjd_end", "access_url", "metadata"),
                ("product_id",),
                all_products_rows,
            ))
        if all_target_products_rows:
            tp_cols = ("target_key", "product_id", "search_ra_deg", "search_dec_deg", "search_radius_deg")
            tmp.writelines(insert("target_products", tp_cols, tp_cols, all_target_products_rows))
        if all_cutouts_rows:
            c_cols = ("product_id", "center_ra_deg", "center_dec_deg", "size_deg", "relative_path", "byte_count", "sha256")
            tmp.writelines(insert("cutouts", c_cols, ("product_id", "center_ra_deg", "center_dec_deg", "size_deg"), all_cutouts_rows))
        if all_spherex_obs_rows:
            obs_cols = (
                "product_id", "target_key", "release", "obs_id", "publisher_did",
                "detector", "band_name", "mjd_start", "mjd_end",
                "em_min_m", "em_max_m", "s_ra", "s_dec", "s_region",
                "access_url", "intersects_query", "has_valid_target_pixel",
                "wcs_verified", "valid_pixel_fraction", "target_pixel_finite",
                "target_pixel_flags", "local_cutout_path",
                "query_ra_deg", "query_dec_deg", "query_radius_deg", "provenance",
            )
            tmp.writelines(insert("spherex_observations", obs_cols, ("product_id",), all_spherex_obs_rows))
        if all_audits_rows:
            audit_cols = (
                "audit_id", "target_key", "release", "epoch_mjd",
                "query_ra_deg", "query_dec_deg", "query_radius_deg",
                "api_status", "error_detail", "product_count", "detector_counts",
                "cutouts_checked", "valid_pixel_count", "classification", "notes",
            )
            tmp.writelines(insert("spherex_query_audits", audit_cols, ("audit_id",), all_audits_rows))
        hips_cols = (
            "layer_id", "title", "service_url", "properties_url",
            "hips_version", "hips_frame", "hips_order", "hips_tile_width",
            "spectral_metadata", "verified_tiles",
        )
        tmp.writelines(insert("hips_layers", hips_cols, ("layer_id",), [hips_row]))
        tmp.write("COMMIT;\n")
    tmp_path.replace(args.output)
    print(f"Generated SQL: {args.output}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("targets", nargs="*", help=f"Target keys (default: all 5: {', '.join(targets())})")
    parser.add_argument("--ra", type=float, help="Custom ICRS RA in degrees")
    parser.add_argument("--dec", type=float, help="Custom ICRS Dec in degrees")
    parser.add_argument("--target-key", help="Target key label for custom RA/Dec")
    parser.add_argument("--radius-deg", type=float, default=0.025)
    parser.add_argument("--center-mjd", type=float, default=61100.0)
    parser.add_argument("--cutouts", type=int, default=2, help="Cutouts per target/collection for barnard & wise0855")
    parser.add_argument("--size-deg", type=float, default=0.04)
    parser.add_argument("--storage", type=Path, default=ROOT / "data" / "sky-archive")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "spherex-irsa-pipeline.sql")
    parser.add_argument("--apply", action="store_true", help="Import generated SQL into Supabase via psql")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--psql", help="Path to psql executable")
    args = parser.parse_args()

    if (args.ra is None) != (args.dec is None):
        parser.error("--ra and --dec must be passed together")
    if args.ra is not None and not (0 <= args.ra < 360 and -90 <= args.dec <= 90):
        parser.error("--ra must be in [0, 360) and --dec in [-90, 90]")
    if not (0 < args.radius_deg <= 2.0 and 0 < args.size_deg <= 0.25 and math.isfinite(args.center_mjd)):
        parser.error("Invalid radius, size, or center-mjd")

    if args.apply:
        env, executable = connection_settings(args.env_file)

    run_pipeline(args)

    if args.apply:
        run_psql(env, args.psql or executable, ["-w", "-f", str(args.output)])
        print("Applied SQL to Supabase PostgreSQL successfully.", flush=True)


if __name__ == "__main__":
    main()
