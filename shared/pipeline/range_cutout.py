"""RangeCutoutProvider: HTTP/S3 Byte-Range FITS cutout via astropy section with IRSA fallback.

Algorithm inspired by HTTP/S3 FITS range-read cutout patterns (ADR-003), independent MIT implementation.
Reads only the FITS headers, WCS metadata, and the requested [y0:y1, x0:x1] cutout rows (~1-2 MB
instead of downloading a full ~65 MB exposure), and falls back cleanly to IRSA cutout service.
"""

from __future__ import annotations

import logging
import math
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import astropy.units as u
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS

from shared.pipeline import irsa

logger = logging.getLogger("uvicorn.error")


def _compute_cutout_slice(
    wcs: WCS,
    shape: tuple[int, int],
    ra_deg: float,
    dec_deg: float,
    size_deg: float,
) -> tuple[int, int, int, int]:
    """Compute clamped integer [y0:y1, x0:x1] bounds around (ra_deg, dec_deg)."""
    height, width = shape
    center = SkyCoord(ra=ra_deg * u.deg, dec=dec_deg * u.deg, frame="icrs")
    cx, cy = wcs.world_to_pixel(center)
    if not (math.isfinite(float(cx)) and math.isfinite(float(cy))):
        raise ValueError("Target projects to non-finite pixel coordinates")

    scales = [abs(float(s.to_value(u.deg))) for s in wcs.proj_plane_pixel_scales()]
    scale_x = scales[0] if len(scales) >= 1 and scales[0] > 0 else 6.15 / 3600.0
    scale_y = scales[1] if len(scales) >= 2 and scales[1] > 0 else scale_x
    half_w = max(1.0, (size_deg / 2.0) / scale_x)
    half_h = max(1.0, (size_deg / 2.0) / scale_y)

    x0 = max(0, int(math.floor(float(cx) - half_w)))
    x1 = min(width, int(math.ceil(float(cx) + half_w)) + 1)
    y0 = max(0, int(math.floor(float(cy) - half_h)))
    y1 = min(height, int(math.ceil(float(cy) + half_h)) + 1)
    if x1 <= x0 or y1 <= y0:
        raise ValueError("Requested cutout does not overlap image bounds")
    return x0, x1, y0, y1


def _find_hdu(hdul: fits.HDUList, preferred: str, fallback_idx: int) -> fits.ImageHDU | fits.PrimaryHDU:
    for hdu in hdul:
        if (hdu.name or "").upper() == preferred and hdu.data is not None:
            return hdu
    if fallback_idx < len(hdul) and hdul[fallback_idx].data is not None:
        return hdul[fallback_idx]
    raise ValueError(f"HDU {preferred!r} not found in FITS")


def derive_range_uris(irsa_access_url: str) -> list[str]:
    """Build direct FITS URLs suitable for HTTP Range reads (stripping CGI cutout query params)."""
    clean = str(irsa_access_url or "").strip()
    if not clean:
        return []
    parts = urlsplit(clean)
    if parts.scheme not in {"http", "https"}:
        return [clean]
    base_url = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    uris: list[str] = []
    # Map IRSA /ibe/data/spherex/... or /data/SPHEREx/... paths to public S3 HTTP endpoint when matching level2 FITS
    lower_path = parts.path.lower()
    if lower_path.endswith(".fits"):
        for prefix in ("/ibe/data/spherex/", "/data/spherex/"):
            idx = lower_path.find(prefix)
            if idx >= 0:
                rel = parts.path[idx + len(prefix) :].lstrip("/")
                if rel:
                    uris.append(f"https://nasa-irsa-spherex.s3.amazonaws.com/{rel}")
        uris.append(base_url)
    return list(dict.fromkeys(uris))


def cutout_from_fits(
    source: str | Path,
    ra_deg: float,
    dec_deg: float,
    size_deg: float,
    out_path: str | Path,
    *,
    use_fsspec: bool = False,
    fsspec_kwargs: dict[str, Any] | None = None,
) -> Path:
    """Slice a sub-region using HDU .section (range-read friendly) and write a minimal FITS cutout."""
    dest = Path(out_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    open_kwargs: dict[str, Any] = {}
    if use_fsspec:
        src_str = str(source)
        default_kwargs: dict[str, Any] = {
            "block_size": 512 * 1024,
            "cache_type": "bytes",
        }
        if src_str.startswith("s3://"):
            default_kwargs["anon"] = True
        open_kwargs["use_fsspec"] = True
        open_kwargs["fsspec_kwargs"] = {**default_kwargs, **(fsspec_kwargs or {})}

    with fits.open(str(source), memmap=not use_fsspec, **open_kwargs) as hdul:
        img_hdu = _find_hdu(hdul, "IMAGE", 1 if len(hdul) > 1 else 0)
        wcs = WCS(img_hdu.header, naxis=2)
        shape = (int(img_hdu.header["NAXIS2"]), int(img_hdu.header["NAXIS1"]))
        x0, x1, y0, y1 = _compute_cutout_slice(wcs, shape, ra_deg, dec_deg, size_deg)

        sub_img = np.array(img_hdu.section[y0:y1, x0:x1], copy=True)
        new_header = img_hdu.header.copy()
        if "CRPIX1" in new_header:
            new_header["CRPIX1"] = float(new_header["CRPIX1"]) - x0
        if "CRPIX2" in new_header:
            new_header["CRPIX2"] = float(new_header["CRPIX2"]) - y0

        out_hdus: list[fits.PrimaryHDU | fits.ImageHDU] = [
            fits.PrimaryHDU(header=hdul[0].header.copy()),
            fits.ImageHDU(data=sub_img, header=new_header, name="IMAGE"),
        ]
        flags_hdu = next(
            (hdu for hdu in hdul if (hdu.name or "").upper() == "FLAGS" and hdu.data is not None),
            None,
        )
        if flags_hdu is not None:
            sub_flags = np.array(flags_hdu.section[y0:y1, x0:x1], copy=True)
            out_hdus.append(fits.ImageHDU(data=sub_flags, header=flags_hdu.header.copy(), name="FLAGS"))

        fits.HDUList(out_hdus).writeto(dest, overwrite=True)
    return dest


class RangeCutoutProvider:
    """HTTP/S3 Byte-Range FITS cutout provider with automatic fallback to IRSA cutout service."""

    def fetch_cutout(
        self,
        *,
        range_uri: str | Path | None = None,
        irsa_access_url: str,
        ra_deg: float,
        dec_deg: float,
        size_deg: float,
        out_path: str | Path,
        obs_id: str | None = None,
        use_fsspec: bool = True,
        timeout_s: int = 12,
    ) -> tuple[Path, str]:
        mode = os.getenv("CUTOUT_PROVIDER", "auto").strip().lower()
        candidates: list[str] = []
        if range_uri:
            candidates.append(str(range_uri))
        if mode in {"auto", "range"}:
            for uri in derive_range_uris(irsa_access_url):
                if uri not in candidates:
                    candidates.append(uri)

        if mode != "irsa":
            for uri in candidates:
                is_local = not uri.startswith(("http://", "https://", "s3://")) and Path(uri).exists()
                try:
                    written = cutout_from_fits(
                        uri,
                        ra_deg,
                        dec_deg,
                        size_deg,
                        out_path,
                        use_fsspec=use_fsspec and not is_local,
                    )
                    logger.info("cutout_range_hit size_bytes=%d uri=%s", written.stat().st_size, uri)
                    return written, "range"
                except Exception as exc:  # noqa: BLE001 - fall back across mirrors/IRSA cutout
                    logger.debug("cutout_range_miss uri=%s err=%s", uri, type(exc).__name__)
                    continue

        irsa.download_cutout(
            irsa_access_url,
            ra_deg,
            dec_deg,
            size_deg,
            out_path,
            expected_obs_id=obs_id,
            timeout_s=timeout_s,
            retries=1,
        )
        return Path(out_path), "irsa"
