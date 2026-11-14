"""Collect time-resolved WiseView cutouts for a WISE 0855 W1/W2 pilot."""
import hashlib
import argparse
import io
import json
import sys
from pathlib import Path

import numpy as np
import requests
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from members.dong.app.services.catalog import position_at, targets  # noqa: E402

OUT = ROOT / 'data/unwise/wise0855'
BASE = 'http://byw.tools'


def save(doc):
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / 'report.json.tmp'
    tmp.write_text(json.dumps(doc, indent=2, allow_nan=False), encoding='utf8')
    tmp.replace(OUT / 'report.json')


def main():
    global OUT
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', choices=tuple(targets()), default='wise0855')
    args = parser.parse_args()
    OUT = ROOT / 'data/unwise' / args.target
    center = position_at(args.target, Time('2016-01-01').mjd)
    ra, dec = float(center.ra.deg), float(center.dec.deg)
    session = requests.Session()
    response = session.get(BASE + '/tiles', params={'ra': ra, 'dec': dec}, timeout=30)
    response.raise_for_status()
    tiles = response.json()['tiles']
    if not tiles:
        raise RuntimeError('WiseView returned no tiles')
    tile = tiles[0]
    report = {'source': BASE, 'source_transport': 'HTTP; source files have no authenticated transport',
              'center_ra_deg': ra, 'center_dec_deg': dec, 'center_epoch': '2016-01-01',
              'tile': tile['coadd_id'], 'records': []}
    for item in sorted(tile['epochs'], key=lambda x: (x['band'], x['epoch'])):
        band, epoch = item['band'], item['epoch']
        path = OUT / f'w{band}' / f'epoch-{epoch:03d}.fits'
        path.parent.mkdir(parents=True, exist_ok=True)
        row = {**item, 'status': 'pending'}
        report['records'].append(row)
        params = {'ra': ra, 'dec': dec, 'size': 120, 'band': band, 'epoch': epoch}
        try:
            if not path.exists():
                response = session.get(BASE + '/cutout', params=params, timeout=(10, 30))
                response.raise_for_status()
                payload = response.content
            else:
                payload = path.read_bytes()
            with fits.open(io.BytesIO(payload)) as hdus:
                h, data = hdus[0].header, np.array(hdus[0].data, dtype=float)
                if data.ndim != 2 or min(data.shape) < 10:
                    raise ValueError('Missing or invalid image')
                wcs = WCS(h)
                x, y = (float(v) for v in wcs.world_to_pixel(position_at(args.target, item['mjdmean'])))
                inside = bool(np.isfinite(x) and np.isfinite(y) and 0 <= x < data.shape[1] and 0 <= y < data.shape[0])
                finite = np.isfinite(data)
                if not finite.any():
                    raise ValueError('No finite pixels')
                yy, xx = np.indices(data.shape)
                radius = np.hypot(xx - x, yy - y)
                core = data[(radius <= 2) & finite]
                annulus = data[(radius >= 5) & (radius <= 10) & finite]
                score = None
                if inside and len(core) and len(annulus):
                    noise = 1.4826 * np.median(np.abs(annulus - np.median(annulus)))
                    if noise > 0:
                        score = float((np.max(core) - np.median(annulus)) / noise)
                source_url = requests.Request('GET', BASE + '/cutout', params=params).prepare().url
                row.update(status='downloaded', path=str(path.relative_to(ROOT)), sha256=hashlib.sha256(payload).hexdigest(),
                           target_pixel=[x,y], target_inside=inside, finite_fraction=float(finite.mean()), local_contrast=score,
                           source_url=source_url)
            if not path.exists():
                tmp = path.with_suffix('.part')
                tmp.write_bytes(payload)
                tmp.replace(path)
        except (requests.RequestException, OSError, ValueError, KeyError) as exc:
            row.update(status='deferred' if isinstance(exc, requests.RequestException) else 'invalid',
                       error=f'{type(exc).__name__}: {exc}')
        save(report)
        print(f'W{band} epoch {epoch}: {row["status"]}', flush=True)
    print(f'Report: {OUT / "report.json"}')


if __name__ == '__main__':
    main()
