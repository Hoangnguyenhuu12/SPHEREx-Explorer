"""Render Supabase unWISE cutouts with Gaia positions on their actual WCS grids."""
import hashlib
import io
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import psycopg
import requests
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from dotenv import load_dotenv
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from members.dong.app.services.catalog import position_at, targets  # noqa: E402

BUCKET = 'spherex-dr1-demo'
PREFIX = 'unwise-gaia-review/v1'
OUT = ROOT / 'data/unwise_archive_review'


def upload(base, key, name, data, ctype):
    r = requests.post(f'{base}/storage/v1/object/{BUCKET}/{name}', data=data,
                      headers={'apikey': key, 'Authorization': f'Bearer {key}', 'x-upsert': 'true',
                               'Content-Type': ctype}, timeout=60)
    r.raise_for_status()
    return f'{base}/storage/v1/object/public/{BUCKET}/{name}'


def main():
    load_dotenv(ROOT / '.env')
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SECRET_KEY']
    with psycopg.connect(connect_timeout=15) as conn:
        rows = conn.execute("""SELECT coadd_id, epoch, band, search_ra_deg, search_dec_deg,
                                      mjd_start, mjd_end, storage_url, sha256
                               FROM sky_archive.unwise_epoch_cutouts ORDER BY search_ra_deg, band, epoch""").fetchall()
        gaia = {}
        for target in targets():
            gaia[target] = conn.execute("""SELECT g.source_id, g.ra_deg, g.dec_deg, g.pmra_mas_yr,
                                          g.pmdec_mas_yr, g.ref_epoch_jyear, g.g_mag
                                   FROM sky_archive.gaia_dr3 g JOIN sky_archive.target_gaia_dr3 t USING (source_id)
                                   WHERE t.target_key=%s""", (target,)).fetchall()
    groups = {}
    for row in rows:
        coadd, epoch, band, ra, dec, mjd_start, mjd_end, url, digest = row
        if not url or not digest or mjd_start is None or mjd_end is None:
            continue
        center = SkyCoord(ra * u.deg, dec * u.deg)
        midpoint = (mjd_start + mjd_end) / 2
        candidates = [(float(center.separation(position_at(t, midpoint)).deg), t) for t in targets()]
        dist, target = min(candidates)
        if dist > .05:
            print('Unmatched sky position', coadd, band, epoch, flush=True)
            continue
        groups.setdefault((target, band), []).append(row)
    OUT.mkdir(parents=True, exist_ok=True)
    summary_path = OUT / 'summary.json'
    summary = json.loads(summary_path.read_text(encoding='utf8')) if summary_path.exists() else []
    for (target, band), batch in groups.items():
        previous = next((x for x in summary if x['target'] == target and x['band'] == band), None)
        if previous and previous.get('algorithm_version') == 2 and previous['uploaded'] == previous['total'] == len(batch) and (OUT / f'{target}-{band.lower()}.json').exists():
            print(target, band, 'already completed', flush=True)
            continue
        summary = [x for x in summary if (x['target'], x['band']) != (target, band)]
        records, arrays, ref_wcs = [], [], None
        for coadd, epoch, _, ra, dec, start, end, url, digest in batch:
            record = {'epoch': epoch, 'mjd_start': start, 'mjd_end': end, 'source_sha256': digest, 'source_url': url}
            records.append(record)
            try:
                local = OUT / 'inputs' / f'{digest}.fits'
                if local.exists():
                    source_bytes = local.read_bytes()
                else:
                    r = requests.get(url, timeout=(10, 35)); r.raise_for_status()
                    source_bytes = r.content
                if hashlib.sha256(source_bytes).hexdigest() != digest:
                    raise ValueError('Source SHA-256 mismatch')
                local.parent.mkdir(parents=True, exist_ok=True)
                if not local.exists():
                    tmp = local.with_suffix('.part'); tmp.write_bytes(source_bytes); tmp.replace(local)
                record['local_fits'] = str(local.relative_to(ROOT)).replace('\\', '/')
                with fits.open(io.BytesIO(source_bytes)) as h:
                    data, wcs = np.asarray(h[0].data, dtype=float), WCS(h[0].header)
                    if data.ndim != 2 or not wcs.has_celestial:
                        raise ValueError('No 2-D celestial WCS')
                    if ref_wcs is None:
                        ref_wcs, shape = wcs, data.shape
                    pts = np.array([[0., 0.], [shape[1]-1., shape[0]-1.], [(shape[1]-1.)/2, (shape[0]-1.)/2]])
                    reproj = wcs.all_world2pix(ref_wcs.all_pix2world(pts, 0), 0)
                    if data.shape != shape or not np.isfinite(reproj).all() or np.max(np.abs(reproj-pts)) > .05:
                        raise ValueError('Image WCS differs; registration needed')
                    valid = np.isfinite(data)
                    if valid.mean() < .95:
                        raise ValueError('Insufficient finite image coverage')
                    rows_gaia = gaia[target]
                    src = SkyCoord([r[1] for r in rows_gaia] * u.deg, [r[2] for r in rows_gaia] * u.deg)
                    years = Time((start+end)/2, format='mjd').jyear - np.array([r[5] if r[5] is not None else 2016.0 for r in rows_gaia])
                    motion = np.array([r[3] is not None and r[4] is not None for r in rows_gaia])
                    pmra = np.array([r[3] if r[3] is not None else 0 for r in rows_gaia])
                    pmdec = np.array([r[4] if r[4] is not None else 0 for r in rows_gaia])
                    pos = src.spherical_offsets_by(pmra * years * u.mas, pmdec * years * u.mas)
                    xs, ys = wcs.world_to_pixel(pos)
                    mask = np.isfinite(xs) & np.isfinite(ys) & (xs >= 0) & (xs <= shape[1]-1) & (ys >= 0) & (ys <= shape[0]-1)
                    record['gaia'] = [{'source_id': str(rows_gaia[i][0]), 'x': float(xs[i]), 'y_png': float(shape[0]-1-ys[i]),
                                       'proper_motion_applied': bool(motion[i]), 'g_mag': rows_gaia[i][6]}
                                      for i in np.flatnonzero(mask)]
                    record.update(status='checked', finite_fraction=float(valid.mean()), date=Time((start+end)/2, format='mjd').isot)
                    arrays.append((record, data - np.median(data[valid])))
            except (requests.RequestException, OSError, ValueError, KeyError, TypeError) as exc:
                record.update(status='failed', error=f'{type(exc).__name__}: {str(exc)[:300]}')
        if arrays:
            values = np.concatenate([a[np.isfinite(a)] for _, a in arrays])
            lo, hi = (float(x) for x in np.percentile(values, [1, 99.8]))
            if hi <= lo:
                raise ValueError(f'Invalid stretch for {target} {band}')
            def render_and_upload(item):
                record, data = item
                try:
                    valid = np.isfinite(data); pixels = np.zeros(data.shape, dtype=np.uint8)
                    pixels[valid] = (255*np.arcsinh(10*np.clip((data[valid]-lo)/(hi-lo),0,1))/np.arcsinh(10)).astype(np.uint8)
                    image = Image.fromarray(np.flipud(pixels))
                    stream = io.BytesIO(); image.save(stream, format='PNG')
                    payload = stream.getvalue()
                    name = f'{PREFIX}/{target}/{band.lower()}/e{record["epoch"]:03d}-{hashlib.sha256(payload).hexdigest()[:16]}.png'
                    record['image_url'] = upload(base, key, name, payload, 'image/png')
                    overlay = image.convert('RGB')
                    draw = ImageDraw.Draw(overlay)
                    for star in record['gaia']:
                        x, y = star['x'], star['y_png']
                        draw.ellipse((x-2, y-2, x+2, y+2), outline=(0, 210, 255), width=1)
                    out = io.BytesIO(); overlay.save(out, format='PNG')
                    encoded = out.getvalue()
                    overlay_name = f'{PREFIX}/{target}/{band.lower()}/e{record["epoch"]:03d}-gaia-{hashlib.sha256(encoded).hexdigest()[:16]}.png'
                    record['gaia_overlay_url'] = upload(base, key, overlay_name, encoded, 'image/png')
                    record['status'] = 'uploaded'
                except requests.RequestException as exc:
                    record.update(status='failed', error=f'{type(exc).__name__}: {str(exc)[:300]}')
            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(render_and_upload, arrays))
            manifest = {'target': target, 'band': band, 'source': 'Supabase unwise_epoch_cutouts; Gaia DR3',
                        'gaia_position_model': 'Linear proper motion from reference epoch; no parallax or observer motion. Sources without proper motion remain at catalog position.',
                        'warning': 'Reference positions and visual inspection only; source identity and measurements unverified.',
                        'stretch': {'type': 'asinh', 'vmin': lo, 'vmax': hi}, 'frames': records}
            payload = json.dumps(manifest, ensure_ascii=False, allow_nan=False).encode()
            upload(base, key, f'{PREFIX}/{target}/{band.lower()}/manifest.json', payload, 'application/json')
            (OUT / f'{target}-{band.lower()}.json').write_bytes(payload)
        summary.append({'target': target, 'band': band, 'algorithm_version': 2, 'total': len(records),
                        'uploaded': sum(r.get('status') == 'uploaded' for r in records),
                        'failures': [r for r in records if r.get('status') != 'uploaded']})
        summary_path.write_text(json.dumps(summary, indent=2), encoding='utf8')
        print(target, band, summary[-1]['uploaded'], '/', len(records), flush=True)


if __name__ == '__main__':
    main()
