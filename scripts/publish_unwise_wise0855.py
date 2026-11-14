"""Render and publish the W2 pilot after verifying a common unWISE WCS grid."""
import hashlib
import argparse
import io
import json
import os
from pathlib import Path

import numpy as np
import requests
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from dotenv import load_dotenv
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'data/unwise/wise0855/report.json'
BUCKET = 'spherex-dr1-demo'
PREFIX = 'wise-reference/unwise-wise0855-w2-v1'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', choices=['wise0855', 'barnard', 'epsindib', 'rwaur', 'rdra'], default='wise0855')
    parser.add_argument('--band', type=int, choices=[1, 2], default=2)
    args = parser.parse_args()
    report = json.loads((ROOT / 'data/unwise' / args.target / 'report.json').read_text(encoding='utf8'))
    rows = sorted((r for r in report['records'] if r['band'] == args.band and r['status'] == 'downloaded' and r['target_inside'] and r['finite_fraction'] >= 0.95), key=lambda r: r['mjdmean'])
    if len(rows) < 2:
        raise ValueError('At least two covered W2 epochs are needed')
    arrays = []
    ref_wcs = None
    ref_shape = None
    for row in rows:
        path = ROOT / row['path']
        if hashlib.sha256(path.read_bytes()).hexdigest() != row['sha256']:
            raise ValueError(f'Checksum mismatch: {path}')
        with fits.open(path) as hdus:
            data = np.asarray(hdus[0].data, dtype=float)
            wcs = WCS(hdus[0].header)
            if ref_wcs is None:
                ref_wcs, ref_shape = wcs, data.shape
            xy = np.array([[0., 0.], [ref_shape[1] - 1., 0.], [0., ref_shape[0] - 1.],
                           [ref_shape[1] - 1., ref_shape[0] - 1.], [(ref_shape[1] - 1.) / 2, (ref_shape[0] - 1.) / 2]])
            projected = wcs.all_world2pix(ref_wcs.all_pix2world(xy, 0), 0)
            if data.shape != ref_shape or not np.isfinite(projected).all() or np.max(np.abs(projected - xy)) > 0.05:
                raise ValueError(f'Image grid differs, independent alignment required: {path}')
            finite = np.isfinite(data)
            if finite.mean() < 0.95:
                raise ValueError(f'Insufficient finite image coverage: {path}')
            arrays.append(data - np.median(data[finite]))
    all_pixels = np.concatenate([a[np.isfinite(a)] for a in arrays])
    low, high = (float(x) for x in np.percentile(all_pixels, [1, 99.8]))
    if high <= low:
        raise ValueError('Invalid shared stretch')
    load_dotenv(ROOT / '.env')
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SECRET_KEY']
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'x-upsert': 'true'}
    prefix = f'wise-reference/unwise-{args.target}-w{args.band}-v1'
    public = f'{base}/storage/v1/object/public/{BUCKET}/{prefix}'
    session = requests.Session()
    frames = []
    for row, data in zip(rows, arrays):
        finite = np.isfinite(data)
        pixels = np.zeros(data.shape, dtype=np.uint8)
        pixels[finite] = (255 * np.arcsinh(10 * np.clip((data[finite] - low) / (high - low), 0, 1)) / np.arcsinh(10)).astype(np.uint8)
        output = io.BytesIO()
        Image.fromarray(np.flipud(pixels)).save(output, format='PNG')
        payload = output.getvalue()
        name = f'e{row["epoch"]:03d}-{hashlib.sha256(payload).hexdigest()[:16]}.png'
        response = session.post(f'{base}/storage/v1/object/{BUCKET}/{prefix}/{name}', data=payload,
                                headers={**headers, 'Content-Type': 'image/png'}, timeout=60)
        response.raise_for_status()
        frames.append({'epoch': row['epoch'], 'mjdmean': row['mjdmean'], 'date': Time(row['mjdmean'], format='mjd').isot,
                       'image_url': f'{public}/{name}', 'fits_sha256': row['sha256'], 'target_pixel': row['target_pixel'],
                       'forward': row['forward'], 'finite_fraction': row['finite_fraction']})
        print(f'Uploaded epoch {row["epoch"]}', flush=True)
    manifest = {'version': 1, 'target': args.target, 'band': f'W{args.band}', 'tile': report['tile'],
                'source': 'WiseView time-resolved unWISE cutouts', 'source_transport': report['source_transport'],
                'center_ra_deg': report['center_ra_deg'], 'center_dec_deg': report['center_dec_deg'],
                'description': 'Visual comparison only; fixed sky grid, median background removed per frame, shared stretch. Source identity and motion are not independently validated.',
                'stretch': {'type': 'asinh', 'lower': low, 'upper': high}, 'frames': frames}
    response = session.post(f'{base}/storage/v1/object/{BUCKET}/{prefix}/manifest.json',
                            data=json.dumps(manifest, indent=2, allow_nan=False).encode(),
                            headers={**headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache'}, timeout=60)
    response.raise_for_status()
    cfg = ROOT / 'frontend/src/shared/config/wise-reference.json'
    config = json.loads(cfg.read_text(encoding='utf8'))
    config.setdefault('blinkManifests', {}).setdefault(args.target, {})[f'W{args.band}'] = f'{public}/manifest.json'
    cfg.write_text(json.dumps(config, indent=2) + '\n', encoding='utf8')
    print(f'Published {len(frames)} {args.target} W{args.band} frames')


if __name__ == '__main__':
    main()
