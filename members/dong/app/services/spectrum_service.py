"""Measure discrete aperture samples from observational cutouts only."""
import hashlib
import math
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import quote, urlsplit

import requests

from shared.science import APERTURE_ARCSEC, photometry_measurements
from . import database_provider as db
from . import live_cutouts as sources
from .catalog import position_at
from .observed_frames import Cutout, matching_cutouts, verify_cutouts


class SpectrumError(Exception):
    def __init__(self, status, code, message, **details):
        super().__init__(message)
        self.status, self.code, self.details = status, code, details


def storage_file(asset, checksum):
    """Download only project Storage FITS and reuse verified bytes across requests."""
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    if not base or not asset:
        return None
    url = asset if "://" in asset else sources._storage_public_url(quote(asset.lstrip("/"), safe="/"))
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.netloc != urlsplit(base).netloc
            or not parts.path.startswith("/storage/v1/object/public/")
            or not parts.path.lower().endswith(".fits")):
        return None
    root = Path(os.getenv("DATA_DIR", "data")) / "cache" / "spectrum-assets"
    root.mkdir(parents=True, exist_ok=True)
    path = root / (hashlib.sha256((url + str(checksum or "")).encode()).hexdigest() + ".fits")
    if path.is_file():
        if not checksum or hashlib.sha256(path.read_bytes()).hexdigest() == checksum:
            return path
    with requests.get(url, timeout=(4, 12), stream=True, allow_redirects=False) as response:
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise db.DatabaseError("Storage request failed")
        with NamedTemporaryFile(dir=root, delete=False) as tmp:
            temp = Path(tmp.name)
        try:
            digest = hashlib.sha256()
            with temp.open("wb") as handle:
                for chunk in response.iter_content(65536):
                    if handle.tell() + len(chunk) > 32 * 1024 * 1024:
                        raise db.DatabaseError("Storage cutout exceeds size limit")
                    digest.update(chunk)
                    handle.write(chunk)
            if checksum and digest.hexdigest() != checksum:
                raise db.DatabaseError("Storage cutout checksum mismatch")
            with temp.open("rb") as handle:
                if not handle.read(9).startswith(b"SIMPLE  ="):
                    raise db.DatabaseError("Storage object is not FITS")
            temp.replace(path)
            return path
        finally:
            temp.unlink(missing_ok=True)


def stored_cutouts(query):
    products = db.products_for_target(query.target_key)
    selected = {}
    for product in products:
        band = str(product.get("band", "")).split("-")[-1]
        if band in {f"D{i}" for i in range(1, 7)} and query.detector in (None, int(band[1])):
            selected[product["product_id"]] = (product, int(band[1]))
    found = []
    ids = list(selected)
    for start in range(0, len(ids), 40):
        chunk = ids[start:start + 40]
        quoted = ",".join('"' + pid.replace('"', '\\"') + '"' for pid in chunk)
        rows = db._get("cutouts", {"select": "*", "product_id": f"in.({quoted})"})
        for row in rows:
            product, detector = selected.get(row.get("product_id"), (None, None))
            if product is None:
                continue
            path = storage_file(row.get("storage_url") or row.get("relative_path"), row.get("sha256"))
            if path and product.get("mjd_start") is not None:
                stat = path.stat()
                found.append(Cutout(path, str(product.get("obs_id") or Path(path).stem), detector, float(product["mjd_start"]),
                                    str(product.get("collection") or "spherex_dr1").removeprefix("spherex_"), row.get("sha256"),
                                    stat.st_size, stat.st_mtime_ns))
    return found, bool(selected)


def samples(query, cutouts, source):
    points = []
    for cutout in cutouts or ():
        if query.detector not in (None, cutout.detector):
            continue
        coord = position_at(query.target_key, cutout.mjd)
        xy = (query.ra, query.dec) if coord is None else (coord.ra.deg, coord.dec.deg)
        item = {"path": cutout.path, "mjd": cutout.mjd, "release": cutout.release,
                "detector": cutout.detector, "data_kind": "observational"}
        try:
            verify_cutouts([cutout])
            row = photometry_measurements([item], [xy], APERTURE_ARCSEC)["rows"][0]
        except (ValueError, OSError, TypeError, IndexError, KeyError, ArithmeticError):
            continue
        if not all(isinstance(row.get(k), (int, float)) and math.isfinite(row[k])
                   for k in ("flux_mjy", "err_mjy", "snr")):
            continue
        wave = row.get("wavelength_um")
        nominal = wave is None
        if nominal:
            wave = (0.92, 1.38, 2.03, 3.12, 4.12, 4.71)[cutout.detector - 1]
        points.append(dict(detector=cutout.detector, wavelength_um=wave, flux_mjy=row["flux_mjy"],
                           err_mjy=row["err_mjy"], snr=row["snr"], detected=row["detected"], flagged=False,
                           sample_kind="band_flux" if nominal else "spectral_flux",
                           wavelength_source="nominal detector center" if nominal else row["wavelength_source"],
                           mjd=cutout.mjd, obs_id=cutout.obs_id, release=cutout.release, source=source))
    return points


def read(query):
    mode = os.getenv("DATA_MODE", "fixture")
    points = []
    metadata = False
    if mode in {"database", "hybrid"} and query.target_key:
        try:
            points = samples(query, sources.load_database_cutouts(query), "sky_archive FITS")
            if not points:
                stored, metadata = stored_cutouts(query)
                points = samples(query, stored, "Supabase Storage")
                metadata = metadata and not stored
        except (requests.RequestException, db.DatabaseError) as exc:
            if mode == "database":
                raise db.DatabaseError("Cannot read archived cutouts") from exc
    if not points and mode in {"live", "hybrid"}:
        with sources.workspace() as directory:
            points = samples(query, sources.load_irsa_cutouts(query, directory), "NASA/IPAC IRSA")
    elif mode == "harvest":
        points = samples(query, sources.load_harvest_cutouts(query), "harvest FITS")
    elif mode in {"real", "fixture"}:
        points = samples(query, matching_cutouts(query), "local FITS")
    if not points:
        if metadata:
            raise SpectrumError(404, "SPECTRUM_ASSET_UNAVAILABLE", "No readable archived FITS asset.", mode=mode)
        raise SpectrumError(404, "NO_SPECTRUM", "No usable aperture measurements at this position.", mode=mode)
    return {"api_version": "0.1", "mode": mode, "position": {"ra": query.ra, "dec": query.dec},
            "points": sorted(points, key=lambda p: (p["wavelength_um"], p["mjd"])),
            "flux_unit": "mJy", "aperture_arcsec": APERTURE_ARCSEC, "is_continuous_spectrum": False,
            "sample_kind": "spectral_flux" if all(p["sample_kind"] == "spectral_flux" for p in points) else "band_flux",
            "wavelength_source": ", ".join(sorted({p["wavelength_source"] for p in points})),
            "warnings": ["APERTURE_PHOTOMETRY", "NO_APERTURE_CORRECTION"]}
