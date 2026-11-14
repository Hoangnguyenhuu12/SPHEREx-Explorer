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


def cached_result(operation, query, build):
    root = Path(os.getenv("DATA_DIR", "data")) / "cache" / "api-0.1-live"
    # Cache visit-grouped results separately from the previous exposure-level renderer.
    key = ("v4-visits", os.getenv("DATA_MODE", "fixture"), operation, collections_for_live(), query.model_dump_json())
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


def workspace():
    root = Path(os.getenv("DATA_DIR", "data")) / "cache"
    root.mkdir(parents=True, exist_ok=True)
    return TemporaryDirectory(prefix="irsa-", dir=root)
