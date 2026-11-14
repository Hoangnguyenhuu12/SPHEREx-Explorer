"""Validate local AllWISE cutouts and publish visual previews to Supabase Storage."""
import hashlib
import io
import json
import os
import sys
from pathlib import Path

import numpy as np
import requests
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from dotenv import load_dotenv
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from members.dong.app.services.catalog import position_at, targets  # noqa: E402

SOURCE = ROOT / 'data/imports/full_harvest_fusion/data/harvest'
BUCKET = 'spherex-dr1-demo'
PREFIX = 'wise-reference/allwise-v1'


def main():
    load_dotenv(ROOT / '.env')
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SECRET_KEY']
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'x-upsert': 'true'}
    session = requests.Session()
    public = f'{base}/storage/v1/object/public/{BUCKET}/{PREFIX}'
    images = []
    for target, (catalog, _) in targets().items():
        for band in (1, 2):
            path = SOURCE / target / 'wise' / f'{target}_wise_W{band}.fits'
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            with fits.open(path) as hdus:
                h, data = hdus[0].header, np.asarray(hdus[0].data, dtype=float)
                if data.ndim != 2 or h.get('BAND') != band or h.get('TELESCOP') != 'WISE':
                    raise ValueError(f'Invalid FITS image or identity: {path}')
                start, end = Time(h['DATEOBS1'], scale='utc'), Time(h['DATEOBS2'], scale='utc')
                wcs = WCS(h)
                points = []
                for t in (start, end):
                    pos = position_at(target, t.mjd)
                    x, y = (float(v) for v in wcs.world_to_pixel(pos))
                    points.append({'date': t.isot, 'x': x, 'y': y,
                                   'inside': bool(np.isfinite(x) and np.isfinite(y) and 0 <= x < data.shape[1] and 0 <= y < data.shape[0])})
                valid = np.isfinite(data)
                if not valid.any():
                    raise ValueError(f'No finite data: {path}')
                lo, hi = np.percentile(data[valid], [1, 99.8])
                if not hi > lo:
                    raise ValueError(f'Invalid stretch: {path}')
                pixels = np.zeros(data.shape, dtype=np.uint8)
                pixels[valid] = (255 * np.arcsinh(10 * np.clip((data[valid] - lo) / (hi - lo), 0, 1)) / np.arcsinh(10)).astype(np.uint8)
                out = io.BytesIO()
                Image.fromarray(np.flipud(pixels)).save(out, format='PNG')
                payload = out.getvalue()
                pnghash = hashlib.sha256(payload).hexdigest()
                name = f'{target}-w{band}-{pnghash[:16]}.png'
                response = session.post(f'{base}/storage/v1/object/{BUCKET}/{PREFIX}/{name}', data=payload,
                                        headers={**headers, 'Content-Type': 'image/png'}, timeout=60)
                response.raise_for_status()
                images.append({'target': target, 'target_name': catalog['name'], 'band': f'W{band}',
                               'wavelength_um': 3.4 if band == 1 else 4.6,
                               'source': 'AllWISE / WISE / IPAC', 'coadd_id': h.get('COADDID'),
                               'start': start.isot, 'end': end.isot, 'source_sha256': digest,
                               'preview_sha256': pnghash, 'image_url': f'{public}/{name}',
                               'coverage': points, 'finite_fraction': float(valid.mean())})
            print(f'{target} W{band}: uploaded; coverage {[p["inside"] for p in points]}', flush=True)
    manifest = {'version': 1, 'description': 'AllWISE reference coadds; independently stretched, not time-resolved unWISE.',
                'position_model': 'Linear proper motion at start and end; excludes parallax and orbital motion.', 'images': images}
    blob = json.dumps(manifest, ensure_ascii=False, allow_nan=False, indent=2).encode()
    response = session.post(f'{base}/storage/v1/object/{BUCKET}/{PREFIX}/manifest.json', data=blob,
                            headers={**headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache'}, timeout=60)
    response.raise_for_status()
    cfg = ROOT / 'frontend/src/shared/config/wise-reference.json'
    config = json.loads(cfg.read_text(encoding='utf8')) if cfg.exists() else {}
    config['manifestUrl'] = f'{public}/manifest.json'
    cfg.write_text(json.dumps(config, indent=2) + '\n', encoding='utf8')
    print('Published manifest and frontend configuration.')


if __name__ == '__main__':
    main()
