"""Derive candidate WCS from NEOSSAT star centroids and cross-check Gaia DR3.

Only centroids leave the machine. Results are review artifacts, not certified astrometry.
"""
import hashlib
import json
import argparse
from pathlib import Path

import numpy as np
import requests
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.time import Time
from astropy.wcs import WCS
from photutils.detection import DAOStarFinder

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/neossat_review/1999-KW4'
OUT = ROOT / 'data/neossat_review/wcs_candidates'


def gaia_cone(ra, dec, radius):
    page, records = 1, []
    while True:
        query = {'service': 'Mast.Catalogs.GaiaDR3.Cone', 'params': {'ra': ra, 'dec': dec, 'radius': radius},
                 'format': 'json', 'pagesize': 5000, 'page': page}
        r = requests.get('https://mast.stsci.edu/api/v0/invoke', params={'request': json.dumps(query)}, timeout=(10, 45))
        r.raise_for_status(); data = r.json()
        if data.get('status') != 'COMPLETE':
            raise ValueError('Gaia cone search did not complete')
        records.extend(data['data'])
        if page >= data['paging']['pagesFiltered']:
            if len(records) != data['paging']['rowsFiltered']:
                raise ValueError('Incomplete Gaia pagination')
            return records
        page += 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--retry-failed', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    previous_path = OUT / 'review.json'
    previous = {r['obs_id']: r for r in json.loads(previous_path.read_text(encoding='utf8'))} if args.retry_failed and previous_path.exists() else {}
    for path in sorted(SOURCE.glob('*.fits')):
        obs = path.name.split('-')[0]
        if previous.get(obs, {}).get('status') == 'candidate_wcs_crosschecked':
            results.append(previous[obs])
            continue
        result = {'obs_id': obs, 'fits_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                  'status': 'failed', 'science_validated': False}
        try:
            with fits.open(path) as hdus:
                hdr, data = hdus[0].header, np.asarray(hdus[0].data, dtype=float)
                _, median, std = sigma_clipped_stats(data, sigma=3)
                solution, trials = None, []
                for fwhm, sigma in ([(4.0, 4), (2.5, 3), (4.0, 3)] if args.retry_failed else [(2.5, 5)]):
                    sources = DAOStarFinder(fwhm=fwhm, threshold=sigma*std)(data-median)
                    if sources is None or len(sources) < 5:
                        trials.append({'fwhm': fwhm, 'sigma': sigma, 'status': 'too_few_sources'})
                        continue
                    sources.sort('flux', reverse=True)
                    stars = [[float(s['x_centroid']), float(s['y_centroid']), float(s['flux'])] for s in sources
                             if s['flux'] > 0 and 0 <= s['x_centroid'] < data.shape[1] and 0 <= s['y_centroid'] < data.shape[0]][:200]
                    response = requests.post('https://skysolver.app/api/v1/solve/stars',
                                             json={'width': data.shape[1], 'height': data.shape[0],
                                                   'stars': stars, 'pixel_origin': 0, 'time_limit_ms': 30000}, timeout=(10, 45))
                    response.raise_for_status(); solution = response.json()
                    trials.append({'fwhm': fwhm, 'sigma': sigma, 'stars': len(stars), 'solved': solution.get('solved'), 'error': solution.get('error')})
                    if solution.get('solved'):
                        break
                result['trials'] = trials
                if solution is None:
                    raise ValueError('Too few detected image sources')
                result['solver'] = {'service': 'https://skysolver.app/api/v1/solve/stars', 'stars_submitted': len(stars),
                                    'solved': solution.get('solved'), 'stats': solution.get('stats'), 'error': solution.get('error')}
                if not solution.get('solved'):
                    raise ValueError('Plate solver did not find a solution')
                candidate_header = fits.Header.fromstring(solution['fits_header'], sep='')
                wcs = WCS(candidate_header).celestial
                center = SkyCoord(*wcs.pixel_to_world_values((data.shape[1]-1)/2, (data.shape[0]-1)/2), unit='deg')
                pointing = SkyCoord(hdr['RA'], hdr['DEC'], unit=(u.hourangle, u.deg))
                separation = float(center.separation(pointing).deg)
                scale = float(solution['scale_arcsec'])
                result.update(pointing_separation_deg=separation, scale_arcsec_per_pixel=scale)
                if separation > .25 or not 2.5 <= scale <= 3.5:
                    raise ValueError('Solver result inconsistent with instrument pointing or pixel scale')
                (OUT / f'{obs}.wcs.txt').write_text(candidate_header.tostring(sep='\n', endcard=True, padding=False), encoding='ascii')
                (OUT / f'{obs}.solver.json').write_text(json.dumps(solution, indent=2), encoding='utf8')
                radius = float(np.hypot(*data.shape) * scale / 7200 + .03)
                gaia = gaia_cone(center.ra.deg, center.dec.deg, radius)
                gaia = [g for g in gaia if g.get('ra') is not None and g.get('dec') is not None]
                if not gaia:
                    raise ValueError('Gaia cross-check returned no sources')
                coords = SkyCoord([g['ra'] for g in gaia]*u.deg, [g['dec'] for g in gaia]*u.deg)
                dt = Time(hdr['DATE-OBS'], scale='utc').jyear - np.array([g.get('ref_epoch') or 2016 for g in gaia])
                pmra = np.array([g.get('pmra') or 0 for g in gaia]); pmdec = np.array([g.get('pmdec') or 0 for g in gaia])
                coords = coords.spherical_offsets_by(pmra*dt*u.mas, pmdec*dt*u.mas)
                image_sky = wcs.pixel_to_world([x[0] for x in stars], [x[1] for x in stars])
                indices, distances, _ = image_sky.match_to_catalog_sky(coords)
                candidates = sorted((float(distances[i].arcsec), int(indices[i])) for i in range(len(stars)) if distances[i].arcsec < 3)
                seen, matched = set(), []
                for dist, index in candidates:
                    if index not in seen:
                        seen.add(index); matched.append(dist)
                result['gaia_check'] = {'source': 'MAST Gaia DR3 cone; linear proper motion only',
                                        'catalog_sources': len(gaia), 'unique_matches_within_3_arcsec': len(matched),
                                        'median_residual_arcsec': float(np.median(matched)) if matched else None,
                                        'max_residual_arcsec': float(np.max(matched)) if matched else None}
                result['status'] = 'candidate_wcs_crosschecked' if len(matched) >= 5 else 'candidate_wcs_insufficient_gaia_matches'
        except (requests.RequestException, OSError, KeyError, TypeError, ValueError) as exc:
            result['error'] = f'{type(exc).__name__}: {str(exc)[:300]}'
        results.append(result)
        (OUT / 'review.json').write_text(json.dumps(results, indent=2, allow_nan=False), encoding='utf8')
        print(obs, result['status'], result.get('gaia_check', {}), result.get('error', ''), flush=True)


if __name__ == '__main__':
    main()
