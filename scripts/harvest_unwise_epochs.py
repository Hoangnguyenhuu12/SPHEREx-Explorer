"""Harvest and verify time-resolved unWISE FITS cutouts served by WiseView."""

import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import quote, urlsplit

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from dotenv import dotenv_values
import numpy as np
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from members.dong.app.services.catalog import position_at, targets  # noqa: E402
from scripts.harvest_sky_archive import insert  # noqa: E402
from scripts.import_sky_archive import connection_settings, run_psql  # noqa: E402

WISEVIEW = "http://byw.tools/wiseview"
CUTOUT = "http://byw.tools/cutout"
TILES = "https://unwise.me/data/allwise/unwise-coadds/fulldepth/tiles.fits"
PAPER = "https://portal.nersc.gov/project/cosmo/temp/ameisner/neo4_unwise_coadds-revised.pdf"
FITS_CLIENT = "https://github.com/fkiwy/unTimely_Catalog_explorer/blob/main/unTimely_Catalog_tools.py"
CHALLENGE = "https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources"
KEY = ("release", "coadd_id", "epoch", "band", "search_ra_deg", "search_dec_deg", "requested_size_px")
COLUMNS = (*KEY, "mjd_start", "mjd_end", "footprint_icrs", "access_url", "sha256", "storage_url", "metadata")
VERIFY_SQL = """SELECT coadd_id, band, count(*) AS files, count(DISTINCT epoch) AS epochs,
       array_agg(DISTINCT epoch ORDER BY epoch) AS epoch_ids, min(mjd_start), max(mjd_end)
FROM sky_archive.unwise_epoch_cutouts
GROUP BY coadd_id, band ORDER BY coadd_id, band"""


def download(session, url, params=None):
    with session.get(url, params=params, timeout=(10, 25), stream=True) as response:
        if response.status_code == 404:
            return None, response.url, "HTTP 404"
        if response.status_code == 500:
            prefix = next(response.iter_content(4096), b"")
            if params is not None and re.search(rb"builtins\.KeyError:\s*" + str(params["epoch"]).encode() + rb"\b", prefix):
                return None, response.url, "epoch absent in WiseView (KeyError)"
        response.raise_for_status()
        body = bytearray()
        for chunk in response.iter_content(65536):
            if len(body) + len(chunk) > 8 * 1024**2:
                raise ValueError("FITS response exceeds 8 MiB")
            body.extend(chunk)
        return bytes(body), response.url, None


def inspect_cutout(body, epoch, center, tile_centers, tile_ids, track):
    with fits.open(io.BytesIO(body), memmap=False) as hdus:
        hdus.verify("exception")
        header = hdus[0].header
        pixels = hdus[0].data
        wcs = WCS(header).celestial
        if header.get("EPOCH") != epoch or pixels is None or pixels.ndim != 2 or not wcs.has_celestial:
            raise ValueError("FITS epoch, image dimensions or celestial WCS do not match")
        height, width = pixels.shape
        reference = wcs.pixel_to_world(*(wcs.wcs.crpix - 1)).icrs
        separation = tile_centers.separation(reference).arcsec
        nearest = int(separation.argmin())
        if separation[nearest] > 1:
            raise ValueError("FITS reference position does not match an unWISE atlas tile")
        for point in (center, *track):
            x, y = wcs.world_to_pixel(point)
            if not (0 <= x <= width - 1 and 0 <= y <= height - 1):
                raise ValueError("FITS cutout does not cover the requested sightline or target track")
            if not np.isfinite(pixels[round(float(y)), round(float(x))]):
                raise ValueError("FITS has invalid pixels at the requested sightline or target track")
        footprint = wcs.calc_footprint(axes=(width, height), center=False)
        if not np.isfinite(footprint).all():
            raise ValueError("FITS footprint has invalid coordinates")
        corners = SkyCoord(footprint[:, 0], footprint[:, 1], unit="deg", frame=reference.frame).icrs
        times = tuple(header.get(key) for key in ("MJDMIN", "MJDMAX"))
        if any(value is not None and not math.isfinite(value) for value in times):
            raise ValueError("FITS contains invalid MJD values")
        if all(value is not None for value in times) and times[0] > times[1]:
            raise ValueError("FITS MJD bounds are reversed")
        provenance = {key: header[key] for key in ("UNW_VER", "UNW_DVER", "UNW_DATE", "REFEREN1", "BUNIT", "TIMESYS", "MJDMIN", "MJDMAX") if key in header}
        wcs_header = {key: value for key, value in wcs.to_header().items()}
        return str(tile_ids[nearest]).strip(), times, {
            "frame": "ICRS", "vertices_deg": list(zip(corners.ra.deg.tolist(), corners.dec.deg.tolist())),
        }, provenance, {"width": width, "height": height, "wcs": wcs_header}


def storage_settings(env_path):
    env = {**os.environ, **{key: value for key, value in dotenv_values(env_path).items() if value is not None}}
    url = env.get("SUPABASE_URL", "").rstrip("/")
    key = env.get("SUPABASE_SECRET_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY")
    bucket = env.get("SUPABASE_STORAGE_BUCKET")
    if not (url and key and bucket):
        return None
    parts = urlsplit(url)
    if not (parts.scheme == "https" and parts.hostname and parts.hostname.endswith(".supabase.co")
            and not (parts.username or parts.password or parts.path or parts.query or parts.fragment)):
        raise ValueError("Storage requires the project's HTTPS Supabase URL")
    db_user = env.get("PGUSER", "")
    if db_user.startswith("postgres.") and db_user.removeprefix("postgres.") != parts.hostname.split(".")[0]:
        raise ValueError("Storage URL and PostgreSQL project reference do not match")
    return url, key, bucket


def upload(settings, path, body):
    base, key, bucket = settings
    object_url = f"{base}/storage/v1/object/{quote(bucket, safe='')}/{quote(path)}"
    headers = {"apikey": key, "Content-Type": "application/fits", "x-upsert": "true"}
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    response = requests.post(object_url, data=body, headers=headers, timeout=(10, 30), allow_redirects=False)
    if not 200 <= response.status_code < 300:
        raise ValueError(f"Storage upload failed: HTTP {response.status_code}")
    return object_url


def harvest(args, center, track):
    results, unavailable = [], []
    args.storage.mkdir(parents=True, exist_ok=True)
    origin = storage_settings(args.env_file) if args.apply else None
    with requests.Session() as session:
        adapter = HTTPAdapter(max_retries=Retry(total=2, backoff_factor=1,
                                                 status_forcelist=(429, 502, 503, 504), raise_on_status=False))
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        atlas, _, _ = download(session, TILES)
        if atlas is None:
            raise ValueError("unWISE atlas tile list unavailable")
        with fits.open(io.BytesIO(atlas), memmap=False) as hdus:
            table = hdus[1].data
            centers = SkyCoord(table["ra"], table["dec"], unit="deg", frame="icrs")
            tile_ids = table["coadd_id"].copy()
        for band in args.band:
            for epoch in range(args.start_epoch, args.start_epoch + args.epoch_limit):
                params = {"ra": float(center.ra.deg), "dec": float(center.dec.deg),
                          "size": args.size, "band": int(band[-1]), "epoch": epoch}
                try:
                    body, url, missing = download(session, CUTOUT, params)
                    if body is None:
                        unavailable.append({"band": band, "epoch": epoch, "reason": missing})
                        continue
                    tile, times, footprint, header, image = inspect_cutout(body, epoch, center, centers, tile_ids, track)
                except (requests.RequestException, OSError, ValueError) as error:
                    unavailable.append({"band": band, "epoch": epoch, "reason": str(error)})
                    continue
                version = str(header.get("UNW_VER", ""))
                match = re.match(r"^(neo\d+)(?:-|$)", version, re.IGNORECASE)
                release = match.group(1).lower() if match else "wiseview-unwise-release-unreported"
                digest = hashlib.sha256(body).hexdigest()
                relative = f"{tile}/{band.lower()}-e{epoch:03d}-{digest[:16]}.fits"
                path = args.storage / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(body)
                storage_url = None
                if origin:
                    try:
                        storage_url = upload(origin, f"unwise/{relative}", body)
                    except (requests.RequestException, ValueError) as error:
                        print(f"{band} e{epoch:03d}: Storage failed ({type(error).__name__}); kept local", flush=True)
                metadata = {"wiseview": WISEVIEW, "project": "https://github.com/backyardworlds/wiseview",
                            "challenge": CHALLENGE, "project_paper": PAPER, "fits_client_reference": FITS_CLIENT,
                            "tile_index": TILES,
                            "time_format": "MJD", "time_unit": "d", "fits_header": header,
                            "image": image, "local_path": path.relative_to(args.storage).as_posix()}
                results.append((release, tile, epoch, band, float(center.ra.deg), float(center.dec.deg),
                                args.size, *times, footprint, url, digest, storage_url, metadata))
                print(f"{band} e{epoch:03d} {tile} {release} MJD={times}", flush=True)
    return results, unavailable


def apply_export(args):
    env, psql = connection_settings(args.env_file)
    options = ["-w", "-q", "-f", str(args.output)]
    run_psql(env, psql, options)

    def counts():
        return subprocess.check_output([psql, "-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                                        "-c", VERIFY_SQL], env=env, text=True)

    first = counts()
    run_psql(env, psql, options)
    if first != counts():
        raise ValueError("Epoch counts changed after reimport")
    print(first, end="")
    print("Verified: epoch counts unchanged after reimport.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=tuple(targets()), help="Catalog target key (alternative to --ra/--dec)")
    parser.add_argument("--ra", type=float)
    parser.add_argument("--dec", type=float)
    parser.add_argument("--band", nargs="+", choices=("W2", "W1"), default=["W2", "W1"])
    parser.add_argument("--start-epoch", type=int, default=0)
    parser.add_argument("--epoch-limit", type=int, default=24, help="Number of consecutive archive epoch labels to probe")
    parser.add_argument("--size", type=int, default=128, help="Requested cutout size in pixels")
    parser.add_argument("--storage", type=Path, default=ROOT / "data/unwise")
    parser.add_argument("--output", type=Path, default=ROOT / "data/unwise-epochs.sql")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--apply-existing", action="store_true")
    args = parser.parse_args()
    if (args.ra is None) != (args.dec is None):
        parser.error("--ra and --dec must be supplied together")
    if args.target is not None and args.ra is not None:
        parser.error("--target cannot be combined with --ra/--dec")
    if args.ra is not None and not (0 <= args.ra < 360 and -90 <= args.dec <= 90):
        parser.error("RA must be in [0, 360) and Dec in [-90, 90]")
    if not (args.start_epoch >= 0 and 1 <= args.epoch_limit <= 200 and 16 <= args.size <= 512):
        parser.error("invalid starting epoch, epoch limit or cutout size")
    args.band = list(dict.fromkeys(args.band))
    try:
        if not args.apply_existing:
            if args.ra is None:
                target_key = args.target or "wise0855"
                center = position_at(target_key, Time(2017, format="jyear").mjd)
                track = [position_at(target_key, Time(year, format="jyear").mjd) for year in (2010, 2024.6)]
            else:
                center, track = SkyCoord(args.ra, args.dec, unit="deg", frame="icrs"), []
            rows, unavailable = harvest(args, center, track)
            report = {"ra_deg": float(center.ra.deg), "dec_deg": float(center.dec.deg), "size_px": args.size,
                      "available": [{"release": r[0], "coadd_id": r[1], "epoch": r[2], "band": r[3],
                                     "mjd_start": r[7], "mjd_end": r[8], "url": r[10], "sha256": r[11],
                                     "storage_url": r[12], "file": r[-1]["local_path"]}
                                    for r in rows], "unavailable": unavailable}
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
            if not rows:
                raise ValueError("No verified FITS found; see the JSON report")
            ddl = (Path(__file__).with_name("migrations") / "unwise_epoch_cutouts.sql").read_text(encoding="utf-8")
            sql = "".join(insert("unwise_epoch_cutouts", COLUMNS, KEY, rows)).replace(
                "storage_url = EXCLUDED.storage_url",
                "storage_url = CASE WHEN unwise_epoch_cutouts.sha256 = EXCLUDED.sha256 "
                "THEN COALESCE(EXCLUDED.storage_url, unwise_epoch_cutouts.storage_url) "
                "ELSE EXCLUDED.storage_url END",
            )
            temp = args.output.with_suffix(".sql.tmp")
            temp.write_text(f"BEGIN;\nSET LOCAL standard_conforming_strings = on;\n{ddl}\n{sql}\nCOMMIT;\n", encoding="utf-8")
            temp.replace(args.output)
            for band in args.band:
                print(f"{band}: verified {[r[2] for r in rows if r[3] == band]}; "
                      f"unavailable {[r['epoch'] for r in unavailable if r['band'] == band]}")
            print(f"SQL: {args.output}", flush=True)
        if args.apply or args.apply_existing:
            apply_export(args)
    except (OSError, ValueError, requests.RequestException, subprocess.CalledProcessError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
