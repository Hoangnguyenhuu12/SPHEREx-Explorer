"""Acquire and render independent NEOSSAT observations for visual inspection.

No image registration, WCS overlay, or moving-object detection is claimed.
"""
import hashlib
import io
import json
import os
from pathlib import Path

import numpy as np
import psycopg
import requests
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from dotenv import load_dotenv
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/neossat_review/1999-KW4'
BUCKET = 'spherex-dr1-demo'
PREFIX = 'neossat-review/1999-kw4-v1'


def main():
    load_dotenv(ROOT / '.env')
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SECRET_KEY']
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'x-upsert': 'true'}
    OUT.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(connect_timeout=15) as conn:
        rows = conn.execute("""SELECT obs_id, fits_url, fits_sha256, mjd_start, target_name_raw
                               FROM sky_archive.moving_target_observations
                               WHERE target_key=%s ORDER BY mjd_start""", ('1999-KW4',)).fetchall()
    results = []
    for obs, url, expected, mjd, name in rows:
        result = {'obs_id': obs, 'source_url': url, 'catalog_mjd': mjd, 'target_name_raw': name}
        try:
            r = requests.get(url, timeout=(10, 45))
            r.raise_for_status()
            data = r.content
            digest = hashlib.sha256(data).hexdigest()
            if expected and expected != digest:
                raise ValueError('FITS checksum does not match existing archive record')
            with fits.open(io.BytesIO(data), checksum=True) as hdus:
                h = hdus[0].header
                image = np.asarray(hdus[0].data, dtype=float)
                if image.ndim != 2 or str(h.get('OBJECT', '')).strip() != '1999-KW4':
                    raise ValueError('Invalid image or object identifier')
                date = Time(h['DATE-OBS'], format='isot', scale='utc')
                if abs(date.mjd - mjd) * 86400 > 1:
                    raise ValueError('Observation time disagrees with archive record')
                valid = np.isfinite(image)
                if valid.mean() < 0.9:
                    raise ValueError('Insufficient finite pixels')
                lo, hi = (float(x) for x in np.percentile(image[valid], [1, 99.8]))
                if hi <= lo:
                    raise ValueError('Invalid display range')
                pixels = np.zeros(image.shape, dtype=np.uint8)
                pixels[valid] = (255 * np.arcsinh(10 * np.clip((image[valid] - lo) / (hi - lo), 0, 1)) / np.arcsinh(10)).astype(np.uint8)
                out = io.BytesIO()
                Image.fromarray(np.flipud(pixels)).save(out, format='PNG')
                png = out.getvalue()
                image_hash = hashlib.sha256(png).hexdigest()
                png_name = f'{obs}-{image_hash[:16]}.png'
                wcs_present = bool(WCS(h).has_celestial)
                result.update({'status': 'rendered', 'fits_sha256': digest, 'fits_bytes': len(data),
                               'date_obs': date.isot, 'shape': list(image.shape),
                               'finite_fraction': float(valid.mean()), 'celestial_wcs': wcs_present,
                               'stretch': {'method': 'asinh', 'vmin': lo, 'vmax': hi},
                               'image_url': f'{base}/storage/v1/object/public/{BUCKET}/{PREFIX}/{png_name}'})
            file = OUT / f'{obs}-{digest[:16]}.fits'
            if file.exists() and hashlib.sha256(file.read_bytes()).hexdigest() != digest:
                raise ValueError('Existing local file checksum mismatch')
            if not file.exists():
                tmp = file.with_suffix('.part')
                tmp.write_bytes(data)
                tmp.replace(file)
            uploaded = requests.post(f'{base}/storage/v1/object/{BUCKET}/{PREFIX}/{png_name}', data=png,
                                     headers={**headers, 'Content-Type': 'image/png'}, timeout=60)
            uploaded.raise_for_status()
        except (requests.RequestException, OSError, KeyError, ValueError) as exc:
            result.update({'status': 'failed', 'error': f'{type(exc).__name__}: {str(exc)[:300]}'})
        results.append(result)
        (OUT / 'report.json').write_text(json.dumps(results, indent=2), encoding='utf8')
        print(obs, result['status'], 'celestial_wcs', result.get('celestial_wcs'), flush=True)
    manifest = {'target': '1999-KW4', 'mission': 'NEOSSAT',
                'description': 'Independent visual previews; no WCS registration or confirmed target detection.', 'observations': results}
    r = requests.post(f'{base}/storage/v1/object/{BUCKET}/{PREFIX}/manifest.json',
                      data=json.dumps(manifest, indent=2).encode(),
                      headers={**headers, 'Content-Type': 'application/json'}, timeout=60)
    r.raise_for_status()
    print('Manifest uploaded; successes', sum(x['status'] == 'rendered' for x in results), '/', len(results))


if __name__ == '__main__':
    main()
