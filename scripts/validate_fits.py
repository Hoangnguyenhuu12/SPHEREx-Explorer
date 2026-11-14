from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS


def validate(path, ra=None, dec=None, expected_detector=None, expected_obs_id=None):
    result = {'path': str(path), 'valid': False, 'errors': [], 'warnings': []}
    try:
        with fits.open(path, checksum=True, memmap=False) as hdul:
            hdul.verify('exception')
            for hdu in hdul:
                if 'CHECKSUM' in hdu.header and hdu.verify_checksum() != 1:
                    result['errors'].append(f'{hdu.name}: checksum mismatch')
                if 'DATASUM' in hdu.header and hdu.verify_datasum() != 1:
                    result['errors'].append(f'{hdu.name}: datasum mismatch')
            names = [h.name.upper() for h in hdul]
            result['hdus'] = names
            for name in ['IMAGE', 'FLAGS', 'VARIANCE', 'ZODI', 'WCS-WAVE']:
                if name not in names:
                    result['errors'].append(f'missing HDU: {name}')
            if 'PSF' not in names and 'EPSF' not in names:
                result['errors'].append('missing HDU: PSF or EPSF')
            if 'IMAGE' not in names or 'FLAGS' not in names:
                return result
            image, flags = hdul['IMAGE'].data, hdul['FLAGS'].data
            if image is None or flags is None or image.ndim != 2 or image.shape != flags.shape:
                result['errors'].append('IMAGE/FLAGS missing or incompatible dimensions')
                return result
            result['image_shape_yx'] = list(image.shape)
            result['finite_fraction'] = float(np.isfinite(image).mean())
            result['finite_unflagged_fraction'] = float((np.isfinite(image) & (flags == 0)).mean())
            if not np.isfinite(image).any():
                result['warnings'].append('IMAGE contains no finite pixels')
            header = hdul['IMAGE'].header
            detector = header.get('DETECTOR')
            result.update(detector=detector, obs_id=header.get('OBSID'),
                          version=hdul[0].header.get('VERSION'),
                          mjd_beg=header.get('MJD-BEG'), mjd_end=header.get('MJD-END'))
            if detector is None or (expected_detector and int(detector) != int(expected_detector)):
                result['errors'].append('missing or mismatched detector')
            if not result['obs_id']:
                result['errors'].append('missing OBSID')
            elif expected_obs_id and result['obs_id'] != expected_obs_id:
                result['errors'].append('OBSID does not match archive record')
            wcs = WCS(header).celestial
            if not wcs.has_celestial:
                result['errors'].append('missing celestial WCS')
            else:
                result['wcs_ctype'] = list(wcs.wcs.ctype)
                if ra is not None and dec is not None:
                    x, y = wcs.world_to_pixel_values(ra, dec)
                    x, y = float(x), float(y)
                    result['target_pixel_xy'] = [x, y] if np.isfinite(x) and np.isfinite(y) else None
                    covered = np.isfinite(x) and np.isfinite(y) and -0.5 <= x < image.shape[1] - 0.5 and -0.5 <= y < image.shape[0] - 0.5
                    result['target_in_cutout'] = bool(covered)
                    if not covered:
                        result['warnings'].append('predicted target position outside cutout')
                        result['target_pixel_finite'] = None
                    else:
                        ix, iy = int(np.floor(x + 0.5)), int(np.floor(y + 0.5))
                        result['target_pixel_finite'] = bool(np.isfinite(image[iy, ix]))
                        result['target_pixel_flags'] = int(flags[iy, ix])
                        if not result['target_pixel_finite']:
                            result['warnings'].append('target pixel is non-finite')
            result['valid'] = not result['errors']
    except Exception as exc:
        result['errors'].append(f'{type(exc).__name__}: {exc}')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Validate one SPHEREx FITS cutout')
    parser.add_argument('fits', type=Path)
    parser.add_argument('--ra', type=float)
    parser.add_argument('--dec', type=float)
    parser.add_argument('--detector', type=int, choices=range(1, 7))
    args = parser.parse_args()
    if (args.ra is None) != (args.dec is None):
        parser.error('--ra and --dec must be supplied together')
    report = validate(args.fits, args.ra, args.dec, args.detector)
    print(json.dumps(report, indent=2, allow_nan=False))
    raise SystemExit(0 if report['valid'] else 1)
