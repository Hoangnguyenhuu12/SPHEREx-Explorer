"""A masked science pixel must not discard an otherwise intact acquisition."""
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from scripts.validate_fits import validate


def test_nonfinite_target_is_warning_but_identity_mismatch_fails(tmp_path):
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ['RA---TAN', 'DEC--TAN']
    wcs.wcs.crval = [10.0, 20.0]
    wcs.wcs.crpix = [2, 2]
    wcs.wcs.cdelt = [-0.001, 0.001]
    header = wcs.to_header()
    header['OBSID'] = 'observation'
    header['DETECTOR'] = 2
    image = np.ones((3, 3), dtype='float32')
    image[1, 1] = np.nan
    path = tmp_path / 'cutout.fits'
    fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(image, header=header, name='IMAGE'),
                  fits.ImageHDU(np.zeros((3, 3), dtype='int32'), name='FLAGS'),
                  fits.ImageHDU(np.ones((3, 3)), name='VARIANCE'),
                  fits.ImageHDU(np.ones((3, 3)), name='ZODI'),
                  fits.ImageHDU(np.ones((1, 1)), name='EPSF'),
                  fits.ImageHDU(np.ones((1, 1)), name='WCS-WAVE')]).writeto(path)
    result = validate(path, 10.0, 20.0, 2, 'observation')
    assert result['valid'] and not result['target_pixel_finite']
    assert 'target pixel is non-finite' in result['warnings']
    assert not validate(path, 10.0, 20.0, 2, 'different')['valid']
