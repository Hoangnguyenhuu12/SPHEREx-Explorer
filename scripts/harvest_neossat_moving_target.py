"""Harvest public NEOSSat moving-target observations from CADC and upsert into Supabase sky_archive."""

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile
import urllib.parse
import xml.etree.ElementTree as ET

from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.import_sky_archive import connection_settings, run_psql  # noqa: E402

CADC_TAP_URL = "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/sync"
MIGRATION_PATH = ROOT / "scripts" / "migrations" / "002_solar_system_moving_targets.sql"
CHALLENGE_URL = "https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources"

TARGET_CATALOG = {
    "1999-KW4": {
        "designation": "(66391) Moshup / 1999 KW4",
        "body_type": "asteroid",
    },
    "46P": {
        "designation": "46P/Wirtanen",
        "body_type": "comet",
    },
}


def sql_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
        return "'" + text.replace("'", "''") + "'::jsonb"
    return "'" + str(value).replace("'", "''") + "'"


def mjd_to_iso(mjd):
    if mjd is None:
        return None
    return Time(float(mjd), format="mjd", scale="utc").isot + "Z"


def build_session():
    session = requests.Session()
    session.mount(
        "https://",
        HTTPAdapter(
            max_retries=Retry(
                total=3,
                backoff_factor=1.0,
                status_forcelist=(429, 500, 502, 503, 504),
                raise_on_status=False,
            )
        ),
    )
    return session


def query_cadc_tap(session, adql):
    response = session.get(
        CADC_TAP_URL,
        params={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql.strip()},
        timeout=45,
    )
    response.raise_for_status()
    return list(csv.DictReader(io.StringIO(response.text)))


def fetch_observations(session, target_name, min_calib=2):
    adql = f"""
    SELECT o.observationID, o.collection, o.target_name, o.target_moving,
           o.instrument_name, o.telescope_name, o.proposal_id, o.proposal_title,
           p.productID, p.calibrationLevel, p.energy_bandpassName,
           p.provenance_name, p.provenance_producer, p.provenance_project, p.provenance_reference,
           c.obs_publisher_did, c.s_ra, c.s_dec, c.s_fov, c.s_region,
           c.t_min, c.t_max, c.em_min, c.em_max, c.access_url
    FROM caom2.Observation AS o
    JOIN caom2.Plane AS p ON o.obsID = p.obsID
    JOIN ivoa.ObsCore AS c ON p.publisherID = c.obs_publisher_did
    WHERE o.collection = 'NEOSSAT'
      AND o.target_name = '{target_name}'
      AND p.calibrationLevel >= {int(min_calib)}
      AND p.dataRelease <= '2026-11-15T00:00:00'
      AND c.s_ra IS NOT NULL
      AND c.s_dec IS NOT NULL
    ORDER BY c.t_min ASC
    """
    return query_cadc_tap(session, adql)


def select_spread_observations(rows, count):
    if len(rows) <= count:
        return rows
    if count <= 1:
        return [rows[0]]
    step = (len(rows) - 1) / (count - 1)
    indices = sorted({round(i * step) for i in range(count)})
    return [rows[i] for i in indices]


def resolve_datalink_fits_url(session, datalink_url):
    response = session.get(datalink_url, timeout=30)
    response.raise_for_status()
    root = ET.fromstring(response.content)
    fields = [el.get("name") for el in root.findall(".//{*}FIELD")]
    for tr in root.findall(".//{*}TR"):
        cells = [td.text or "" for td in tr.findall("{*}TD")]
        row = dict(zip(fields, cells))
        if row.get("semantics") == "#this" and "fits" in row.get("content_type", "").lower():
            return row.get("access_url") or datalink_url
    return datalink_url


def download_and_verify_fits(session, fits_url, dest_path):
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    if not dest_path.exists():
        with session.get(fits_url, stream=True, timeout=60) as resp:
            resp.raise_for_status()
            tmp = dest_path.with_suffix(".tmp")
            with tmp.open("wb") as handle:
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        handle.write(chunk)
            tmp.replace(dest_path)

    raw = dest_path.read_bytes()
    sha256 = hashlib.sha256(raw).hexdigest()
    byte_count = len(raw)

    wcs_verified = False
    header_time_verified = False
    header_obs_utc = None
    header_meta = {}

    with fits.open(dest_path) as hdul:
        hdu = hdul[0]
        hdr = hdu.header
        if hdu.data is None:
            raise ValueError(f"Primary HDU has no image data: {dest_path}")
        wcs = WCS(hdr)
        if wcs.has_celestial:
            # Verify pixel-to-world transform succeeds at image center
            cy, cx = hdu.data.shape[0] / 2.0, hdu.data.shape[1] / 2.0
            sky = wcs.pixel_to_world(cx, cy)
            header_meta["wcs_center_ra_deg"] = float(sky.ra.deg)
            header_meta["wcs_center_dec_deg"] = float(sky.dec.deg)
            wcs_verified = True

        date_obs = hdr.get("DATE-OBS") or hdr.get("DATE_OBS")
        mjd_obs = hdr.get("MJD-OBS")
        if date_obs or mjd_obs is not None:
            header_time_verified = True
            header_obs_utc = str(date_obs) if date_obs else mjd_to_iso(mjd_obs)

        header_meta.update(
            {
                "object": hdr.get("OBJECT"),
                "target": hdr.get("TARGET"),
                "date_obs": str(date_obs) if date_obs else None,
                "mjd_obs": float(mjd_obs) if mjd_obs is not None else None,
                "exptime": hdr.get("EXPTIME"),
                "filter": hdr.get("FILTER"),
                "naxis1": hdr.get("NAXIS1"),
                "naxis2": hdr.get("NAXIS2"),
                "ctype1": hdr.get("CTYPE1"),
                "ctype2": hdr.get("CTYPE2"),
            }
        )

    return {
        "local_fits_path": str(dest_path.relative_to(ROOT)).replace("\\", "/"),
        "fits_sha256": sha256,
        "fits_bytes": byte_count,
        "wcs_verified": wcs_verified,
        "header_time_verified": header_time_verified,
        "header_obs_utc": header_obs_utc,
        "header_meta": header_meta,
    }


def build_sql(target_name, target_info, records):
    migration_sql = MIGRATION_PATH.read_text(encoding="utf-8")
    all_header_objs = [
        str(r["fits_check"]["header_meta"].get("object") or "").upper()
        for r in records
        if r.get("fits_check")
    ]
    target_verified = bool(records) and all(
        str(r["target_moving"]) in ("1", "true", "True") for r in records
    )
    verification_status = "verified_metadata" if target_verified else "coverage_only_unconfirmed"
    obs_id_status = "verified_metadata" if target_verified else "unconfirmed"
    verification_notes = (
        f"Verified via CADC CAOM-2 (target_name={target_name}, target_moving=1, calib_level=2) "
        f"and FITS header inspection (OBJECT={all_header_objs})."
        if target_verified
        else "Only sky coverage verified; moving-target metadata unconfirmed."
    )

    lines = [
        "BEGIN;",
        "SET LOCAL standard_conforming_strings = on;",
        migration_sql.strip(),
        "",
        f"""INSERT INTO sky_archive.solar_system_targets (
    target_key, name, designation, body_type, verification_status,
    verification_notes, source_archive, provenance, updated_at
) VALUES (
    {sql_literal(target_name)},
    {sql_literal(target_name)},
    {sql_literal(target_info["designation"])},
    {sql_literal(target_info["body_type"])},
    {sql_literal(verification_status)},
    {sql_literal(verification_notes)},
    'CADC_NEOSSAT',
    {sql_literal({"challenge_url": CHALLENGE_URL, "tap_url": CADC_TAP_URL, "collection": "NEOSSAT"})},
    now()
)
ON CONFLICT (target_key) DO UPDATE SET
    name = EXCLUDED.name,
    designation = EXCLUDED.designation,
    body_type = EXCLUDED.body_type,
    verification_status = EXCLUDED.verification_status,
    verification_notes = EXCLUDED.verification_notes,
    source_archive = EXCLUDED.source_archive,
    provenance = EXCLUDED.provenance,
    updated_at = now();""",
    ]

    for rec in records:
        fits_check = rec.get("fits_check") or {}
        prov = {
            "challenge_url": CHALLENGE_URL,
            "tap_url": CADC_TAP_URL,
            "collection": rec["collection"],
            "instrument": rec["instrument_name"],
            "telescope": rec["telescope_name"],
            "provenance_name": rec["provenance_name"],
            "provenance_producer": rec["provenance_producer"],
            "provenance_project": rec["provenance_project"],
            "provenance_reference": rec["provenance_reference"],
            "em_min_m": float(rec["em_min"]) if rec["em_min"] else None,
            "em_max_m": float(rec["em_max"]) if rec["em_max"] else None,
            "fits_header": fits_check.get("header_meta"),
        }
        lines.append(
            f"""INSERT INTO sky_archive.products (
    product_id, collection, obs_id, publisher_did, band,
    mjd_start, mjd_end, access_url, metadata
) VALUES (
    {sql_literal(rec["obs_publisher_did"])},
    {sql_literal(rec["collection"])},
    {sql_literal(rec["observationID"])},
    {sql_literal(rec["obs_publisher_did"])},
    {sql_literal(rec["energy_bandpassName"])},
    {float(rec["t_min"])},
    {float(rec["t_max"])},
    {sql_literal(rec["fits_url"])},
    {sql_literal({"ra_deg": float(rec["s_ra"]), "dec_deg": float(rec["s_dec"]), "s_region": rec["s_region"], "target_name": rec["target_name"], "provenance": prov})}
)
ON CONFLICT (product_id) DO UPDATE SET
    collection = EXCLUDED.collection,
    obs_id = EXCLUDED.obs_id,
    publisher_did = EXCLUDED.publisher_did,
    band = EXCLUDED.band,
    mjd_start = EXCLUDED.mjd_start,
    mjd_end = EXCLUDED.mjd_end,
    access_url = EXCLUDED.access_url,
    metadata = EXCLUDED.metadata;"""
        )
        lines.append(
            f"""INSERT INTO sky_archive.moving_target_observations (
    product_id, target_key, source_archive, obs_id, publisher_did,
    target_name_raw, target_moving, calibration_level,
    mjd_start, mjd_end, observed_at, ra_deg, dec_deg, fov_deg,
    coverage_region, band_filter, fits_url, datalink_url,
    local_fits_path, fits_sha256, fits_bytes,
    wcs_verified, header_time_verified, header_obs_utc,
    object_identification_status, provenance, updated_at
) VALUES (
    {sql_literal(rec["obs_publisher_did"])},
    {sql_literal(target_name)},
    'CADC_NEOSSAT',
    {sql_literal(rec["observationID"])},
    {sql_literal(rec["obs_publisher_did"])},
    {sql_literal(rec["target_name"])},
    {sql_literal(str(rec["target_moving"]) in ("1", "true", "True"))},
    {int(rec["calibrationLevel"])},
    {float(rec["t_min"])},
    {float(rec["t_max"])},
    {sql_literal(mjd_to_iso(rec["t_min"]))}::timestamptz,
    {float(rec["s_ra"])},
    {float(rec["s_dec"])},
    {float(rec["s_fov"]) if rec["s_fov"] else "NULL"},
    {sql_literal(rec["s_region"])},
    {sql_literal(rec["energy_bandpassName"])},
    {sql_literal(rec["fits_url"])},
    {sql_literal(rec["access_url"])},
    {sql_literal(fits_check.get("local_fits_path"))},
    {sql_literal(fits_check.get("fits_sha256"))},
    {fits_check["fits_bytes"] if fits_check.get("fits_bytes") is not None else "NULL"},
    {sql_literal(bool(fits_check.get("wcs_verified", False)))},
    {sql_literal(bool(fits_check.get("header_time_verified", False)))},
    {sql_literal(fits_check.get("header_obs_utc"))},
    {sql_literal(obs_id_status)},
    {sql_literal(prov)},
    now()
)
ON CONFLICT (product_id) DO UPDATE SET
    target_key = EXCLUDED.target_key,
    obs_id = EXCLUDED.obs_id,
    mjd_start = EXCLUDED.mjd_start,
    mjd_end = EXCLUDED.mjd_end,
    observed_at = EXCLUDED.observed_at,
    ra_deg = EXCLUDED.ra_deg,
    dec_deg = EXCLUDED.dec_deg,
    fov_deg = EXCLUDED.fov_deg,
    coverage_region = EXCLUDED.coverage_region,
    band_filter = EXCLUDED.band_filter,
    fits_url = EXCLUDED.fits_url,
    datalink_url = EXCLUDED.datalink_url,
    local_fits_path = COALESCE(EXCLUDED.local_fits_path, sky_archive.moving_target_observations.local_fits_path),
    fits_sha256 = COALESCE(EXCLUDED.fits_sha256, sky_archive.moving_target_observations.fits_sha256),
    fits_bytes = COALESCE(EXCLUDED.fits_bytes, sky_archive.moving_target_observations.fits_bytes),
    wcs_verified = sky_archive.moving_target_observations.wcs_verified OR EXCLUDED.wcs_verified,
    header_time_verified = sky_archive.moving_target_observations.header_time_verified OR EXCLUDED.header_time_verified,
    header_obs_utc = COALESCE(EXCLUDED.header_obs_utc, sky_archive.moving_target_observations.header_obs_utc),
    object_identification_status = EXCLUDED.object_identification_status,
    provenance = EXCLUDED.provenance,
    updated_at = now();"""
        )

    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default="1999-KW4", choices=tuple(TARGET_CATALOG))
    parser.add_argument("--limit", type=int, default=6, help="Number of time-spread observations to harvest")
    parser.add_argument("--download-fits", type=int, default=2, help="Number of FITS files to download and verify")
    parser.add_argument("--storage", type=Path, default=ROOT / "data" / "neossat")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "neossat-moving-targets.sql")
    parser.add_argument("--apply", action="store_true", help="Apply generated SQL to Supabase via psql")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--psql", help="Path to psql executable")
    args = parser.parse_args()

    if args.apply:
        env, executable = connection_settings(args.env_file)

    session = build_session()
    all_rows = fetch_observations(session, args.target)
    if len(all_rows) < 2:
        raise RuntimeError(f"Expected >= 2 public calibrated observations for {args.target}, got {len(all_rows)}")

    selected = select_spread_observations(all_rows, max(2, args.limit))
    download_indices = {0, len(selected) - 1} if args.download_fits >= 2 else set(range(args.download_fits))
    if args.download_fits > 2:
        for i in range(min(args.download_fits, len(selected))):
            download_indices.add(i)

    for idx, rec in enumerate(selected):
        rec["fits_url"] = resolve_datalink_fits_url(session, rec["access_url"])
        if idx in download_indices:
            fname = f"NEOS_SCI_{rec['observationID']}_{rec['productID']}.fits"
            dest = args.storage / args.target / fname
            rec["fits_check"] = download_and_verify_fits(session, rec["fits_url"], dest)
            print(
                f"[FITS OK] {fname} | bytes={rec['fits_check']['fits_bytes']} | "
                f"wcs={rec['fits_check']['wcs_verified']} | time={rec['fits_check']['header_obs_utc']}"
            )

    sql_text = build_sql(args.target, TARGET_CATALOG[args.target], selected)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        mode="w", dir=args.output.parent, encoding="utf-8", newline="\n", delete=False
    ) as tmp:
        tmp_path = Path(tmp.name)
        tmp.write(sql_text)
    tmp_path.replace(args.output)
    print(f"Generated SQL ({len(selected)} observations): {args.output}")

    if args.apply:
        run_psql(env, args.psql or executable, ["-f", str(args.output)])
        print("Applied SQL to Supabase PostgreSQL successfully.")


if __name__ == "__main__":
    main()
