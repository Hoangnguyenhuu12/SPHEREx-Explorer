"""Export challenge-source SPHEREx products and Gaia DR3 to PostgreSQL SQL."""

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile
import xml.etree.ElementTree as ET

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from astropy.io import fits, votable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from members.dong.app.services.catalog import position_at, targets  # noqa: E402
from scripts.import_sky_archive import connection_settings, run_psql  # noqa: E402
from shared.pipeline.irsa import IRSA_SIA_URL, make_cutout_url  # noqa: E402

MAST_API = "https://mast.stsci.edu/api/v0/invoke"
GAIA_SERVICE = "Mast.Catalogs.GaiaDR3.Cone"
COLLECTIONS = ("spherex_dr1", "spherex_qr3")
CHALLENGE = "https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources"
MAX_CUTOUT_BYTES = 32 * 1024**2


def read_table(response):
    response.raise_for_status()
    body = response.content
    for info in ET.fromstring(body).iterfind(".//{*}INFO"):
        if info.get("name", "").upper() == "QUERY_STATUS" and info.get("value", "").upper() in {
            "ERROR", "OVERFLOW",
        }:
            raise ValueError(f"Archive returned {info.get('value')}: {info.text or response.url}")
    return votable.parse(io.BytesIO(body)).get_first_table().to_table(use_names_over_ids=True)


def scalar(value):
    if value is None or getattr(value, "mask", False) is True or str(value) == "--":
        return None
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, bytes):
        return value.decode("utf-8")
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, list):
        return [scalar(item) for item in value]
    if isinstance(value, dict):
        return {key: scalar(item) for key, item in value.items()}
    return value


def metadata(row, source_url):
    return {"source_url": source_url, "challenge_url": CHALLENGE,
            "record": {name: scalar(row[name]) for name in row.colnames}}


def sql_value(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (float, int)):
        return str(value)
    cast = "::jsonb" if isinstance(value, dict) else ""
    if cast:
        value = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    return "'" + value.replace("'", "''") + "'" + cast


def insert(table, columns, keys, rows):
    column_list = ", ".join(columns)
    conflict = ", ".join(keys)
    updates = ", ".join(f"{name} = EXCLUDED.{name}" for name in columns if name not in keys)
    action = f"DO UPDATE SET {updates}" if updates else "DO NOTHING"
    unique = {tuple(row[columns.index(key)] for key in keys): row for row in rows}
    batch = list(unique.values())
    for offset in range(0, len(batch), 250):
        values = ",\n".join(
            "(" + ", ".join(map(sql_value, row)) + ")" for row in batch[offset:offset + 250]
        )
        yield (f"INSERT INTO sky_archive.{table} ({column_list}) VALUES\n{values}\n"
               f"ON CONFLICT ({conflict}) {action};\n")


def download_cutout(session, product, target_key, position, size, storage):
    product_id, _, obs_id, _, _, _, _, access_url, _ = product
    ra, dec = position
    url = make_cutout_url(access_url, ra, dec, size)
    identity = hashlib.sha256(url.encode()).hexdigest()[:24]
    relative = Path(target_key) / f"{identity}.fits"
    path = storage / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with session.get(url, stream=True, timeout=(10, 50)) as response:
            response.raise_for_status()
            with NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
                temporary_path = Path(temporary.name)
                try:
                    size_read = 0
                    for chunk in response.iter_content(chunk_size=256 * 1024):
                        size_read += len(chunk)
                        if size_read > MAX_CUTOUT_BYTES:
                            raise ValueError("Cutout exceeded 32 MiB")
                        temporary.write(chunk)
                    temporary.close()
                    validate_cutout(temporary_path, obs_id)
                    temporary_path.replace(path)
                finally:
                    temporary.close()
                    temporary_path.unlink(missing_ok=True)
    else:
        validate_cutout(path, obs_id)
    with path.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
    return product_id, ra, dec, size, relative.as_posix(), path.stat().st_size, checksum


def validate_cutout(path, obs_id):
    with fits.open(path) as hdus:
        header = hdus["IMAGE"].header
        if header.get("NAXIS", 0) < 2 or str(header.get("OBSID", obs_id)) != obs_id:
            raise ValueError("FITS image shape or OBSID did not match the selected observation")


def harvest_gaia(session, ra, dec, radius):
    page, count = 1, 0
    while True:
        query = {"service": GAIA_SERVICE, "params": {"ra": ra, "dec": dec, "radius": radius},
                 "format": "json", "pagesize": 500, "page": page}
        response = session.get(MAST_API, params={"request": json.dumps(query)}, timeout=(10, 55))
        response.raise_for_status()
        result = response.json()
        if result.get("status") != "COMPLETE":
            raise ValueError(f"MAST Gaia DR3 returned {result.get('status')}: {result.get('msg')}")
        paging = result["paging"]
        rows = result["data"]
        count += len(rows)
        for row in rows:
            provenance = {"source_url": MAST_API, "service": GAIA_SERVICE,
                          "challenge_url": CHALLENGE, "record": scalar(row)}
            yield (int(row["source_id"]), row["ra"], row["dec"], scalar(row.get("phot_g_mean_mag")),
                   scalar(row.get("parallax")), scalar(row.get("pmra")), scalar(row.get("pmdec")),
                   provenance)
        if page >= paging["pagesFiltered"]:
            if count != paging["rowsFiltered"]:
                raise ValueError("MAST Gaia DR3 pagination returned an incomplete result")
            return
        page += 1


def harvest_target(session, args, key, catalog):
    position = position_at(key, args.center_mjd)
    ra, dec = (position.ra.deg, position.dec.deg) if position is not None else (
        catalog["ra"], catalog["dec"],
    )
    footprint = float(ra), float(dec), args.radius_deg
    products, gaia, cutouts = [], [], []
    for collection in COLLECTIONS:
        response = session.get(IRSA_SIA_URL, params={
            "COLLECTION": collection, "POS": f"CIRCLE {ra:.8f} {dec:.8f} {args.radius_deg}",
            "MAXREC": 10000,
        }, timeout=(10, 60))
        rows = []
        for row in read_table(response):
            if row["obs_collection"] != collection or row["access_format"] != "image/fits":
                continue
            raw_url = str(row["access_url"])
            if not raw_url.startswith("https://irsa.ipac.caltech.edu/"):
                raise ValueError(f"Unexpected SPHEREx product host: {raw_url}")
            did = scalar(row["obs_publisher_did"])
            rows.append((did or raw_url, collection, str(row["obs_id"]), did,
                         scalar(row["energy_bandpassname"]), scalar(row["t_min"]),
                         scalar(row["t_max"]), raw_url, metadata(row, response.url)))
        print(f"{key}: {collection}: {len(rows)} image records", flush=True)
        products.extend(rows)
        ordered = sorted(rows, key=lambda product: (product[5] is None, product[5], product[0]))
        downloaded = 0
        for product in ordered[: args.cutouts + 6]:
            if downloaded >= args.cutouts:
                break
            epoch = product[5] if product[5] is not None else args.center_mjd
            observed = position_at(key, epoch)
            center = (float(observed.ra.deg), float(observed.dec.deg)) if observed is not None else footprint[:2]
            try:
                cutouts.append(download_cutout(session, product, key, center, args.size_deg, args.storage))
                downloaded += 1
            except requests.HTTPError as error:
                status = error.response.status_code
                if status not in (404, 422, 429, 500, 502, 503, 504):
                    raise
                print(f"{key}: {product[2]} {product[4]} cutout HTTP {status}", file=sys.stderr)
            except (requests.Timeout, requests.ConnectionError) as error:
                print(f"{key}: {product[2]} {product[4]}: {type(error).__name__}", file=sys.stderr)
        if args.cutouts and downloaded < args.cutouts:
            print(f"{key}: {collection}: saved {downloaded}/{args.cutouts} FITS cutouts", file=sys.stderr)

    if not args.skip_gaia:
        gaia = list(harvest_gaia(session, *footprint))
        print(f"{key}: Gaia DR3: {len(gaia)} sources", flush=True)
    return products, gaia, cutouts, footprint


def export(args):
    schema = (Path(__file__).with_name("sky_archive_schema.sql")).read_text(encoding="utf-8")
    footprints = ("search_ra_deg", "search_dec_deg", "search_radius_deg")
    image_columns = ("product_id", "collection", "obs_id", "publisher_did", "band", "mjd_start",
                     "mjd_end", "access_url", "metadata")
    gaia_columns = ("source_id", "ra_deg", "dec_deg", "g_mag", "parallax_mas", "pmra_mas_yr",
                    "pmdec_mas_yr", "metadata")
    cutout_key = ("product_id", "center_ra_deg", "center_dec_deg", "size_deg")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with requests.Session() as session, NamedTemporaryFile(
        mode="w", dir=args.output.parent, encoding="utf-8", newline="\n", delete=False,
    ) as output:
        session.mount("https://", HTTPAdapter(max_retries=Retry(
            total=2, backoff_factor=1, status_forcelist=(429, 500, 502, 503, 504),
            raise_on_status=False,
        )))
        temporary = Path(output.name)
        try:
            output.write("BEGIN;\nSET LOCAL standard_conforming_strings = on;\n" + schema + "\n")
            for key in sorted(set(args.targets)):
                catalog = targets()[key][0]
                products, gaia, cutouts, footprint = harvest_target(session, args, key, catalog)
                output.writelines(insert("targets", ("target_key", "name", "ra_deg", "dec_deg"),
                                         ("target_key",), [(key, catalog["name"], catalog["ra"], catalog["dec"])]))
                output.writelines(insert("products", image_columns, ("product_id",), products))
                association = ("target_key", "product_id", *footprints)
                output.writelines(insert("target_products", association, association,
                                         [(key, row[0], *footprint) for row in products]))
                output.writelines(insert("gaia_dr3", gaia_columns, ("source_id",), gaia))
                association = ("target_key", "source_id", *footprints)
                output.writelines(insert("target_gaia_dr3", association, association,
                                         [(key, row[0], *footprint) for row in gaia]))
                output.writelines(insert("cutouts", (*cutout_key, "relative_path", "byte_count", "sha256"),
                                         cutout_key, cutouts))
            output.write("COMMIT;\n")
            output.close()
            temporary.replace(args.output)
        finally:
            output.close()
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("targets", nargs="+", choices=tuple(targets()))
    parser.add_argument("--radius-deg", type=float, default=0.025)
    parser.add_argument("--center-mjd", type=float, default=61100)
    parser.add_argument("--skip-gaia", action="store_true")
    parser.add_argument("--cutouts", type=int, default=0, help="Maximum FITS per target and collection")
    parser.add_argument("--size-deg", type=float, default=0.04)
    parser.add_argument("--storage", type=Path, default=ROOT / "data" / "sky-archive")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "sky-archive.sql")
    parser.add_argument("--apply", action="store_true", help="Run psql using settings from .env")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env", help="Configuration for --apply")
    parser.add_argument("--psql", help="Path to psql, for --apply")
    args = parser.parse_args()
    if args.apply:
        try:
            env, executable = connection_settings(args.env_file)
        except ValueError as error:
            parser.error(str(error))
    if not (0 < args.radius_deg <= 1 and 0 < args.size_deg <= 0.25 and args.cutouts >= 0
            and math.isfinite(args.center_mjd)):
        parser.error("radius must be (0, 1], size (0, 0.25], cutouts nonnegative and MJD finite")
    export(args)
    print(f"SQL: {args.output}")
    if args.apply:
        run_psql(env, args.psql or executable, ["-f", str(args.output)])


if __name__ == "__main__":
    main()
