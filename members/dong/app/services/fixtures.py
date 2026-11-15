"""Offline API 0.1 fixtures, with observed FITS preferred for frame requests."""

import hashlib
import json
import os
from collections import OrderedDict
from pathlib import Path
from threading import RLock

from ..api_models import (
    Frames,
    FramesQuery,
    PhotometryQuery,
    ResolveQuery,
    ScienceQuery,
    Target,
)
from .catalog import resolve_name, targets
from . import combined_timeline, database_provider
from .frame_rendering import NoCoverage
from .live_cutouts import (
    cached_result,
    harvest_mode,
    hybrid_mode,
    load_cutouts,
    load_database_spherex_frames,
    workspace,
)
from .observed_frames import matching_cutouts, render_cached
from .observed_science import measure
from shared.pipeline.irsa import UpstreamError, UpstreamTimeout

ROOT = Path(__file__).resolve().parents[4]
SAMPLES = ROOT / "api_samples"
TARGETS = {
    "barnard": "Barnard's Star",
    "wise0855": "WISE 0855-0714",
    "epsindib": "Epsilon Indi B",
    "rwaur": "RW Aurigae",
    "rdra": "R Draconis",
}
images = OrderedDict()
image_lock = RLock()


class FixtureError(Exception):
    def __init__(self, status, code, message, details):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def fail(status, code, message, details=None):
    raise FixtureError(status, code, message, details or {})


def require_fixture_mode():
    if os.getenv("DATA_MODE", "fixture") not in {"fixture", "real", "harvest", "live", "database", "hybrid"}:
        fail(500, "INTERNAL", "Unsupported data mode.")


def real_mode():
    """Local, provenance-tracked DR1 cutouts only; never falls back to demo images."""
    return os.getenv("DATA_MODE", "fixture") == "real"


def live_mode():
    return os.getenv("DATA_MODE", "live") in {"live", "harvest", "database", "hybrid"}


def archive_cutouts(query, directory):
    try:
        return load_cutouts(query, directory)
    except UpstreamTimeout:
        fail(504, "UPSTREAM_TIMEOUT", "IRSA did not respond before the deadline.")
    except UpstreamError:
        fail(502, "UPSTREAM_ERROR", "Unable to retrieve SPHEREx data from IRSA.")


def sample(filename):
    require_fixture_mode()
    return json.loads((SAMPLES / filename).read_text(encoding="utf-8"))


def target(query):
    if query.target_key is not None and query.target_key not in TARGETS:
        fail(404, "UNKNOWN_TARGET", "Unknown fixture target.", {"target_key": query.target_key})
    return {
        "ra": query.ra,
        "dec": query.dec,
        "target_key": query.target_key,
        "name": TARGETS.get(query.target_key),
    }


def health():
    if database_provider.enabled():
        mode = "hybrid" if hybrid_mode() else "database"
        try:
            database_provider.health()
            result = {"api_version": "0.1", "status": "ok", "mode": mode, "fixture_targets": [], "irsa_reachable": None if hybrid_mode() else False}
        except database_provider.DatabaseError:
            result = {"api_version": "0.1", "status": "degraded", "mode": mode, "fixture_targets": [], "irsa_reachable": None if hybrid_mode() else False}
    elif harvest_mode():
        result = {"api_version": "0.1", "status": "ok", "mode": "harvest", "fixture_targets": [], "irsa_reachable": False}
    elif real_mode():
        result = {"api_version": "0.1", "status": "ok", "mode": "local", "fixture_targets": [], "irsa_reachable": None}
    elif live_mode():
        result = {"status": "ok", "mode": "live", "fixture_targets": [], "irsa_reachable": None}
    else:
        result = sample("health.json")
    result["git_sha"] = os.getenv("GIT_SHA", "unknown")
    return result


def resolve(query: ResolveQuery):
    if database_provider.enabled():
        row = database_provider.find_target(query.name)
        if row is None:
            fail(404, "UNKNOWN_TARGET", "Name absent from Supabase targets table.", {"name": query.name})
        return {
            "api_version": "0.1", "query": query.name, "target_key": row.get("target_key"),
            "name": row.get("name", query.name), "ra": row.get("ra_deg", row.get("ra")),
            "dec": row.get("dec_deg", row.get("dec")), "epoch": row.get("epoch", "J2000.0"),
            "pmra": row.get("pmra"), "pmdec": row.get("pmdec"),
            "parallax_mas": row.get("parallax_mas"), "kind": row.get("kind", "other"),
            "source": "targets_table",
        }
    result = resolve_name(query.name)
    if result is None:
        fail(404, "UNKNOWN_TARGET", "Name absent from fixture resolver.", {"name": query.name})
    return result


def frames(query: FramesQuery, response=None):
    requested_target = Target.model_validate(target(query))
    if query.timeline == 'combined':
        if query.target_key not in combined_timeline.KNOWN_TIMELINE_TARGETS or query.detector != 6:
            fail(400, 'BAD_PARAM', 'The combined timeline is available for D6 on the five challenge targets.')
        try:
            return combined_timeline.frames(query, requested_target)
        except (OSError, ValueError, KeyError, TypeError):
            fail(503, 'TIMELINE_UNAVAILABLE', 'The prebuilt combined timeline for this target is unavailable.')
    if database_provider.enabled() and (not hybrid_mode() or query.target_key is not None):
        db_spherex = load_database_spherex_frames(query, requested_target)
        if db_spherex is not None:
            if response is not None:
                response.headers["X-Cache"] = "MISS"
            return db_spherex
    if live_mode():
        def build():
            with workspace() as directory:
                result, pngs = render(query, requested_target, archive_cutouts(query, directory))
                return result.model_dump(mode="json", exclude_unset=True), pngs

        (result, published), status = cached_result("frames", query, build)
        if response is not None:
            response.headers["X-Cache"] = status
    else:
        require_fixture_mode()
        cutouts = matching_cutouts(query)
        if real_mode() and not cutouts:
            fail(404, "NO_FRAMES", "No validated local cutouts for this target, detector and selected release.",
                 {"target_key": query.target_key, "detector": query.detector,
                  "release": os.getenv("DATA_RELEASE", "dr1")})
        if cutouts is None:
            result, published = sample_frames(query, requested_target)
        else:
            result, published = render(query, requested_target, cutouts)
    with image_lock:
        for frame_id, content in published.items():
            images[frame_id] = content
            images.move_to_end(frame_id)
        while len(images) > 1200:
            images.popitem(last=False)
    return result


def render(query, requested_target, cutouts):
    try:
        return render_cached(query.model_dump_json(), requested_target.model_dump_json(), cutouts)
    except NoCoverage:
        fail(404, "NO_FRAMES", "No SPHEREx images cover this sky grid.",
             {"ra": query.ra, "dec": query.dec})


TARGET_PREDICTED_PX = {
    "barnard": [[17.0, 19.0], [19.0, 19.0], [21.0, 19.0]],
    "wise0855": [[19.0, 17.0], [19.0, 19.0], [19.0, 21.0]],
    "epsindib": [[17.5, 17.5], [19.5, 19.5], [21.5, 21.5]],
    "rwaur": [[19.0, 19.0], [19.0, 19.0], [19.0, 19.0]],
    "rdra": [[19.0, 19.0], [19.0, 19.0], [19.0, 19.0]],
}


def sample_frames(query, requested_target):
    result = sample("frames_barnard_d6.json")
    result["target"] = requested_target
    result["detector"] = query.detector
    result["grid"].update(center_ra=query.ra, center_dec=query.dec)
    identity = hashlib.sha256(query.model_dump_json().encode()).hexdigest()[:24]
    original_count = len(result["frames"])
    result["frames"] = result["frames"][: query.max_frames]
    if len(result["frames"]) < original_count:
        result["warnings"].append("TRUNCATED")
    if len(result["frames"]) < 3:
        result["warnings"].append("FEW_FRAMES")
    published = {}
    for index, frame in enumerate(result["frames"]):
        frame_id = f"fixture-{identity}-{index}"
        frame["id"] = frame_id
        frame["data_mode"] = "fixture"
        predicted = (
            TARGET_PREDICTED_PX[query.target_key][index]
            if query.target_key in TARGET_PREDICTED_PX and index < len(TARGET_PREDICTED_PX[query.target_key])
            else frame["predicted_px"]
        ) if query.target_key else None
        frame["predicted_px"] = predicted
        frame["png"] = f"/api/frames/{frame_id}.png"
        frame["diff_png"] = f"/api/frames/{frame_id}/diff.png"
        target_png = SAMPLES / f"png/targets/{query.target_key}_{index}.png" if query.target_key else None
        target_diff = SAMPLES / f"png/targets/{query.target_key}_{index}_diff.png" if query.target_key else None
        png_bytes = (
            target_png.read_bytes()
            if (target_png and target_png.is_file())
            else (SAMPLES / f"png/frame-{index}.png").read_bytes()
        )
        diff_bytes = (
            target_diff.read_bytes()
            if (target_diff and target_diff.is_file())
            else (SAMPLES / f"png/frame-{index}_diff.png").read_bytes()
        )
        published[frame_id] = (png_bytes, diff_bytes)
    result["reference_frame_id"] = result["frames"][0]["id"]
    return Frames.model_validate(result), published


def image(frame_id, difference):
    with image_lock:
        content = images.get(frame_id)
        if content is not None:
            images.move_to_end(frame_id)
    if content is None:
        fail(404, "FRAME_NOT_FOUND", "Call /api/frames first or reload the list.", {"id": frame_id})
    return content[difference]


def measured_science(query, operation, aperture_arcsec=None):
    if live_mode():
        requested_target = target(query)
        entry = targets().get(query.target_key)
        catalog = entry[0] if entry else {
            **requested_target, "epoch": "J2000", "pmra": 0.0, "pmdec": 0.0,
            "source": "request",
        }
        def build():
            with workspace() as directory:
                cutouts = archive_cutouts(query, directory)
                return measure(operation, cutouts, tuple(catalog.items()), query.detector, aperture_arcsec)

        result, _ = cached_result(operation, query, build)
        if entry is None and operation == "astrometry":
            result = {**result, "catalog_pm": {
                "pmra": None, "pmdec": None, "epoch": "unknown", "source": "unknown",
            }}
        return {**result, "target": requested_target}
    require_fixture_mode()
    requested_target = target(query)
    entry = targets().get(query.target_key)
    if entry is None:
        return None
    catalog, _ = entry
    cutouts = matching_cutouts(query)
    if cutouts is None:
        return None
    result = measure(operation, cutouts, tuple(catalog.items()), query.detector, aperture_arcsec)
    return {**result, "target": requested_target}


def photometry(query: PhotometryQuery):
    if real_mode():
        fail(503, "INTERNAL", "Photometry is not yet validated for the selected local dataset.")
    observed =measured_science(query, "photometry", query.aperture_arcsec)
    if observed is not None:
        return observed
    if live_mode():
        fail(404, "NO_PHOTOMETRY", "IRSA returned no usable photometry for this target.", {
            "target_key": query.target_key,
            "collection": os.getenv("SPHEREX_COLLECTION", "spherex_dr1"),
        })
    result = sample("photometry_rdra.json")
    if query.target_key != result["target"]["target_key"]:
        result.update(reference_star=None, points=[], variability=None)
    result["target"] = target(query)
    if query.detector is not None:
        result["points"] = [p for p in result["points"] if p["detector"] == query.detector]
    result["variability"] = None
    return result


def astrometry(query: ScienceQuery):
    if real_mode():
        fail(503, "INTERNAL", "Astrometry is not yet validated for the selected local dataset.")
    observed = measured_science(query, "astrometry")
    if observed is not None:
        return observed
    if live_mode():
        fail(404, "NO_ASTROMETRY", "IRSA returned no usable astrometry for this target.", {
            "target_key": query.target_key,
            "collection": os.getenv("SPHEREX_COLLECTION", "spherex_dr1"),
        })
    result = sample("astrometry_barnard.json")
    if query.target_key != result["target"]["target_key"]:
        entry = targets().get(query.target_key)
        record = entry[0] if entry is not None else {}
        result.update(
            points=[],
            fit=None,
            catalog_pm={
                "pmra": record.get("pmra"),
                "pmdec": record.get("pmdec"),
                "epoch": record.get("epoch", "unknown"),
                "source": record.get("source", "unknown"),
            },
        )
    result["target"] = target(query)
    # The supplied astrometry sample contains D6 measurements only.
    if query.detector is not None and query.detector != 6:
        result["points"] = []
        result["fit"] = None
    return result


def spectrum(query: ScienceQuery):
    """Read measured flux from FITS supplied by harvest, database, or IRSA.

    The endpoint never classifies a source from a sparse spectrum. It returns
    measured points and explicit warnings when the archive cannot provide FITS.
    """
    from astropy.coordinates import SkyCoord
    from astropy.io import fits
    from astropy.wcs import WCS
    detector = query.detector or 6
    paths = []
    if harvest_mode():
        root = ROOT / "data" / "harvest" / str(query.target_key) / "spherex"
        if root.is_dir():
            paths = sorted(root.glob("*.fits"))
    elif live_mode():
        from types import SimpleNamespace
        spectrum_dir = ROOT / "data" / "cache" / "spectrum" / str(query.target_key)
        spectrum_dir.mkdir(parents=True, exist_ok=True)
        request = SimpleNamespace(
            target_key=query.target_key,
            ra=query.ra,
            dec=query.dec,
            detector=detector,
            size=0.1,
            max_frames=60,
        )
        try:
            paths = [item.path for item in load_cutouts(request, spectrum_dir)]
        except (UpstreamError, UpstreamTimeout, OSError, ValueError):
            paths = []
    if not paths:
        fail(404, "NO_SPECTRUM", "No measured FITS spectrum covers this position.", {
            "target_key": query.target_key,
            "data_mode": os.getenv("DATA_MODE", "fixture"),
            "source": "NASA/IPAC IRSA or sky_archive FITS",
        })
    points = []
    sky = SkyCoord(query.ra, query.dec, unit="deg")
    for path in paths:
        if f"_D{detector}_" not in path.name:
            continue
        try:
            with fits.open(path, memmap=False) as hdus:
                image = hdus["IMAGE"].data
                variance = hdus["VARIANCE"].data
                flags = hdus["FLAGS"].data
                wcs = WCS(hdus["IMAGE"].header, fobj=hdus).celestial
                header = hdus["IMAGE"].header
                mjd = float(header.get("MJD-AVG", header.get("MJD", 0.0)))
                frame_sky = position_at(query.target_key, mjd) if query.target_key and mjd else None
                x, y = wcs.world_to_pixel(frame_sky or sky)
                approximate = not (0 <= x < image.shape[1] and 0 <= y < image.shape[0])
                ix = max(0, min(image.shape[1] - 1, round(x)))
                iy = max(0, min(image.shape[0] - 1, round(y)))
                value = float(image[iy, ix])
                var = float(variance[iy, ix])
                flagged = bool(flags[iy, ix]) or not (value == value and var > 0)
                wave = None
                if "WCS-WAVE" in hdus:
                    table = hdus["WCS-WAVE"].data
                    xs = table["X"][0].astype(float)
                    ys = table["Y"][0].astype(float)
                    image_header = hdus["IMAGE"].header
                    x = 1 + x - float(image_header.get("CRPIX1A", 1))
                    y = 1 + y - float(image_header.get("CRPIX2A", 1))
                    values = table["VALUES"][0]
                    ix0 = max(0, min(len(xs) - 2, int(__import__("numpy").searchsorted(xs, x) - 1)))
                    iy0 = max(0, min(len(ys) - 2, int(__import__("numpy").searchsorted(ys, y) - 1)))
                    tx = (x - xs[ix0]) / (xs[ix0 + 1] - xs[ix0])
                    ty = (y - ys[iy0]) / (ys[iy0 + 1] - ys[iy0])
                    wave = float((1 - tx) * (1 - ty) * values[0, iy0, ix0] + tx * (1 - ty) * values[0, iy0, ix0 + 1] + (1 - tx) * ty * values[0, iy0 + 1, ix0] + tx * ty * values[0, iy0 + 1, ix0 + 1])
                if wave is None or not (wave > 0):
                    wave = {1: 0.92, 2: 1.38, 3: 2.03, 4: 3.12, 5: 4.12, 6: 4.71}[int(path.name.split("_D", 1)[1].split("_", 1)[0])]
                detector = int(path.name.split("_D", 1)[1].split("_", 1)[0])
                points.append({"wavelength_um": wave, "flux_mjy": None if flagged else value * 1e3, "err_mjy": None if flagged else (var ** 0.5) * 1e3, "flagged": flagged, "detector": detector, "warnings": ["GRID_TO_NATIVE_APPROXIMATION"] if approximate else []})
        except (OSError, KeyError, ValueError, TypeError):
            continue
    if not points:
        fail(404, "NO_SPECTRUM", "No valid spectral pixels cover this position.", {
            "target_key": query.target_key,
            "detector": detector,
            "position_epoch": "propagated_to_each_fits_mjd",
        })
    return {
        "api_version": "0.1",
        "mode": os.getenv("DATA_MODE", "fixture"),
        "position": {"ra": query.ra, "dec": query.dec},
        "flux_unit": "mJy",
        "points": sorted(points, key=lambda p: p["wavelength_um"]),
        "warnings": [
            "MEASURED_FLUX_ONLY",
            "NO_AUTOMATIC_STELLAR_CLASSIFICATION",
        ],
    }
