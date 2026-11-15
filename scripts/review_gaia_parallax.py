"""Compare unWISE Gaia markers against a geocentric parallax approximation.

This is a sensitivity review, not the spacecraft observer solution or a replacement overlay.
"""
import json
from pathlib import Path

import astropy.units as u
import numpy as np
import psycopg
from astropy.coordinates import SkyCoord, get_body_barycentric
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'data/unwise_archive_review'
OUT = ROOT / 'data/reports/gaia_geocentric_parallax_review.json'


def geocentric_shift(direction, parallax_mas, earth_au):
    transverse = earth_au - np.sum(direction * earth_au, axis=1)[:, None] * direction
    shifted = direction - np.asarray(parallax_mas)[:, None] * u.mas.to(u.rad) * transverse
    return shifted / np.linalg.norm(shifted, axis=1)[:, None]


def main():
    load_dotenv(ROOT / '.env')
    with psycopg.connect(connect_timeout=15) as conn:
        catalog = {str(row[0]): row[1] for row in conn.execute('SELECT source_id, parallax_mas FROM sky_archive.gaia_dr3')}
    groups = []
    for path in sorted(INPUT.glob('*-w[12].json')):
        manifest = json.loads(path.read_text(encoding='utf8'))
        frame_summaries, detailed_frames, shifts, total, applied = [], [], [], 0, 0
        for frame in manifest['frames']:
            if frame.get('status') != 'uploaded':
                continue
            wcs = WCS(fits.getheader(ROOT / frame['local_fits']))
            height = fits.getheader(ROOT / frame['local_fits'])['NAXIS2']
            valid = [g for g in frame['gaia'] if catalog.get(g['source_id']) is not None and np.isfinite(catalog[g['source_id']])]
            total += len(frame['gaia']); applied += len(valid)
            if not valid:
                continue
            xs = np.array([g['x'] for g in valid]); ys = np.array([height-1-g['y_png'] for g in valid])
            sky = wcs.pixel_to_world(xs, ys).icrs
            direction = sky.cartesian.xyz.value.T
            t = Time((frame['mjd_start'] + frame['mjd_end'])/2, format='mjd', scale='utc')
            earth_au = get_body_barycentric('earth', t).xyz.to_value(u.au)
            parallax = np.array([catalog[g['source_id']] for g in valid])
            shifted = geocentric_shift(direction, parallax, earth_au)
            new = SkyCoord(x=shifted[:, 0], y=shifted[:, 1], z=shifted[:, 2], representation_type='cartesian', frame='icrs')
            newx, newy = wcs.world_to_pixel(new)
            diff = np.hypot(newx-xs, newy-ys)
            finite = diff[np.isfinite(diff)]
            shifts.extend(finite.tolist())
            points = [{'source_id': g['source_id'], 'x': float(newx[i]), 'y_png': float(height-1-newy[i]),
                       'original_x': float(xs[i]), 'original_y_png': float(height-1-ys[i]),
                       'parallax_mas': float(catalog[g['source_id']]),
                       'proper_motion_applied': g['proper_motion_applied']}
                      for i, g in enumerate(valid) if np.isfinite(newx[i]) and np.isfinite(newy[i])]
            detailed_frames.append({'epoch': frame['epoch'], 'mjd': float(t.mjd), 'points': points})
            frame_summaries.append({'epoch': frame['epoch'], 'source_count': len(frame['gaia']),
                                    'parallax_available': len(valid), 'median_shift_px': float(np.median(finite)) if len(finite) else None,
                                    'max_shift_px': float(np.max(finite)) if len(finite) else None})
        detail_dir = ROOT / 'data/gaia_geocentric_review'
        detail_dir.mkdir(parents=True, exist_ok=True)
        detail = detail_dir / f"{manifest['target']}-{manifest['band'].lower()}.json"
        detail.write_text(json.dumps({'target': manifest['target'], 'band': manifest['band'],
                                      'warning': 'Geocenter approximation only; not mission observer coordinates.',
                                      'frames': detailed_frames}, allow_nan=False), encoding='utf8')
        groups.append({'target': manifest['target'], 'band': manifest['band'], 'frames': len(frame_summaries),
                       'source_positions': total, 'parallax_available': applied,
                       'median_shift_px': float(np.median(shifts)) if shifts else None,
                       'max_shift_px': float(np.max(shifts)) if shifts else None,
                       'detail_file': str(detail.relative_to(ROOT)).replace('\\', '/'), 'per_frame': frame_summaries})
        print(manifest['target'], manifest['band'], 'positions', total, 'with parallax', applied,
              'max_shift_px', groups[-1]['max_shift_px'], flush=True)
    result = {'method': 'First-order signed Gaia parallax using Earth barycentric position from Astropy built-in ephemeris; reference is existing proper-motion-only position.',
              'limitations': ['Geocenter approximation, not WISE spacecraft ephemeris.',
                              'No aberration, light deflection, radial velocity, covariance, or independent validation.',
                              'Not applied to published overlays; WCS epoch conventions require science review.',
                              'Negative Gaia parallaxes are retained as measured in the linear sensitivity calculation.'],
              'groups': groups}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2, allow_nan=False), encoding='utf8')
    print('Report:', OUT)


if __name__ == '__main__':
    main()
