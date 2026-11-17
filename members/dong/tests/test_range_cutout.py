"""Unit tests for HTTP/S3 Byte-Range FITS cutout provider (RangeCutoutProvider)."""

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from shared.pipeline.range_cutout import RangeCutoutProvider, cutout_from_fits, derive_range_uris


def _make_sample_fits(path):
    data = np.arange(100 * 100, dtype=np.float32).reshape(100, 100)
    flags = (data % 7 == 0).astype(np.uint8)
    w = WCS(naxis=2)
    w.wcs.crpix = [50.0, 50.0]
    w.wcs.cdelt = [-6.15 / 3600.0, 6.15 / 3600.0]
    w.wcs.crval = [269.452, 4.693]
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    hdr = w.to_header()
    hdul = fits.HDUList(
        [
            fits.PrimaryHDU(),
            fits.ImageHDU(data=data, header=hdr, name="IMAGE"),
            fits.ImageHDU(data=flags, header=hdr, name="FLAGS"),
        ]
    )
    hdul.writeto(path, overwrite=True)
    return data, flags


def test_cutout_from_fits_slices_exact_pixels_and_shifts_crpix(tmp_path):
    src = tmp_path / "full.fits"
    full_data, full_flags = _make_sample_fits(src)
    out = tmp_path / "sub.fits"

    cutout_from_fits(src, 269.452, 4.693, 0.05, out, use_fsspec=False)
    assert out.is_file()
    assert out.stat().st_size < src.stat().st_size

    with fits.open(out) as sub:
        img = sub["IMAGE"].data
        flg = sub["FLAGS"].data
        assert img.shape[0] < 100 and img.shape[1] < 100
        assert float(sub["IMAGE"].header["CRPIX1"]) < 50.0
        assert float(sub["IMAGE"].header["CRPIX2"]) < 50.0
        assert np.any(np.isin(img, full_data))
        assert flg.shape == img.shape
        assert full_flags.dtype == flg.dtype


def test_derive_range_uris_builds_s3_and_direct_fits_urls():
    url = "https://irsa.ipac.caltech.edu/ibe/data/spherex/level2/2025/001/exp.fits?center=269,4d&size=0.1"
    uris = derive_range_uris(url)
    assert uris[0] == "https://nasa-irsa-spherex.s3.amazonaws.com/level2/2025/001/exp.fits"
    assert uris[1] == "https://irsa.ipac.caltech.edu/ibe/data/spherex/level2/2025/001/exp.fits"


def test_range_cutout_provider_falls_back_to_irsa(monkeypatch, tmp_path):
    called = {}
    out = tmp_path / "fallback.fits"

    def fake_irsa(access_url, ra, dec, size, dest, **kwargs):
        called["url"] = access_url
        _make_sample_fits(dest)
        return dest

    monkeypatch.setattr("shared.pipeline.range_cutout.irsa.download_cutout", fake_irsa)
    provider = RangeCutoutProvider()
    written, mode = provider.fetch_cutout(
        range_uri="/nonexistent/bad.fits",
        irsa_access_url="https://irsa.ipac.caltech.edu/ibe/data/spherex/missing.fits",
        ra_deg=269.452,
        dec_deg=4.693,
        size_deg=0.1,
        out_path=out,
        use_fsspec=False,
    )
    assert written == out
    assert mode == "irsa"
    assert called["url"].endswith("missing.fits")
