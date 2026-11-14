"""Sync local DR1 screening and processed pairs to Supabase (sky_archive.dr1_frames / dr1_pairs).

Reads only local reports and FITS; never modifies them. Rendered demo PNGs are written next to
each processed pair as demo_*.png and uploaded to the public bucket `spherex-dr1-demo` when
SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) are set in .env; otherwise
pairs are stored with upload_status='not_configured' and can be uploaded by rerunning later.
Database connection uses the libpq PG* variables in .env.
"""
import argparse
from collections import Counter
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import psycopg
import requests
from astropy.io import fits
from dotenv import load_dotenv
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from shared.image_processing import diff_png, frame_png  # noqa: E402

BUCKET = 'spherex-dr1-demo'
# Local folder name -> sky_archive.targets.target_key
TARGETS = {'barnard': 'barnard', 'epsilon_indi_b': 'epsindib', 'r_draconis': 'rdra',
           'rw_aurigae': 'rwaur', 'wise0855': 'wise0855'}
DB_TO_LOCAL = {v: k for k, v in TARGETS.items()}
PIXEL_KEY = re.compile(r'^(?P<obs>.+)_D(?P<det>[1-6])$')


def product_id(obs, det):
    return f'ivo://irsa.ipac/spherex_dr1?{obs}/D{det}'


def frame_id(target_key, obs, det):
    return f'{target_key}:{obs}:D{det}'


def iso(value):
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc) if value else None


def load(path):
    return json.loads(Path(path).read_text(encoding='utf8'))


def collect_frames(db_products):
    """One row per (target, obs, detector): DB DR1 products plus anything local."""
    screening = load(ROOT / 'data/reports/comparison_candidates.json')
    frames = {}
    for (tkey, obs, det), mjd in db_products.items():
        frames[(tkey, obs, det)] = {'frame_id': frame_id(tkey, obs, det), 'target_key': tkey, 'obs_id': obs,
                                    'detector': det, 'observed_mjd': mjd, 'download_status': 'pending',
                                    'provenance': {'source': 'sky_archive.products'}}
    for local, tkey in TARGETS.items():
        folder = ROOT / 'data/spherex' / local
        report = load(folder / 'selection_report.json') if (folder / 'selection_report.json').exists() else {'files': {}}
        for key, entry in report['files'].items():
            m = PIXEL_KEY.match(key)
            if not m or entry.get('status') not in {'deferred_503', 'deferred_timeout', 'failed'}:
                continue
            k = (tkey, m['obs'], int(m['det']))
            row = frames.setdefault(k, {'frame_id': frame_id(*k), 'target_key': tkey, 'obs_id': k[1], 'detector': k[2],
                                        'provenance': {'source': 'local selection_report'}})
            row['download_status'] = entry['status']
            row['cutout_url'] = entry.get('selection_url')
            row['provenance'] = {**row.get('provenance', {}), 'last_error': entry.get('error')}
        downloads = {(d['obs_id'], int(d['detector'])): d for d in load(folder / 'manifest.json')['downloads']}
        for img in screening['targets'][local]['images']:
            if img.get('release') != 'dr1':
                continue
            k = (tkey, img['obs_id'], int(img['detector']))
            d = downloads.get(k[1:], {})
            row = frames.setdefault(k, {'frame_id': frame_id(*k), 'target_key': tkey, 'obs_id': k[1], 'detector': k[2],
                                        'provenance': {}})
            px = img.get('predicted_pixel_xy') or [None, None]
            row.update({
                'observed_mjd': img['mjd'], 'observed_at': iso(img.get('iso_utc')),
                'wavelength_um': img.get('wavelength_um'), 'bandwidth_um': img.get('bandwidth_um'),
                'download_status': 'downloaded', 'cutout_url': d.get('original_irsa_selection_url') or d.get('cutout_url'),
                'cutout_size_deg': 0.1, 'cutout_sha256': img['sha256'], 'cutout_bytes': d.get('size_bytes'),
                'predicted_ra_deg': img.get('target_ra_deg'), 'predicted_dec_deg': img.get('target_dec_deg'),
                'predicted_pixel_x': px[0], 'predicted_pixel_y': px[1], 'target_inside': img.get('inside'),
                'target_pixel_finite': img.get('target_pixel_finite'), 'target_pixel_flags': img.get('target_pixel_flags'),
                'bad_flags': img.get('bad_flags_at_target') or [], 'usable': img.get('usable_for_candidate'),
                'reasons': img.get('reasons') or [],
                'screening': {k2: v for k2, v in img.items() if k2 != 'pixels_11x11'},
                'provenance': {**row.get('provenance', {}), 'local_file': img['file'].replace('\\', '/'),
                               'source_url': d.get('source_url'), 'pipeline_version': d.get('pipeline_version'),
                               'screening_rules': screening['rules']},
            })
    coverage_path = ROOT / 'data/reports/db_dr1_coverage.json'
    coverage = load(coverage_path) if coverage_path.exists() else {}
    for local, info in coverage.items():
        for key in info.get('not_covered', []):
            m = PIXEL_KEY.match(key)
            row = frames.get((TARGETS[local], m['obs'], int(m['det']))) if m else None
            if row and row.get('download_status') == 'pending':
                row['download_status'] = 'not_covered'
    for (tkey, obs, det), row in frames.items():
        row['product_id'] = product_id(obs, det) if (tkey, obs, det) in db_products or product_id(obs, det) in db_ids else None
    return frames


def render_pair(folder, report):
    """Per-epoch PNGs and late-minus-early diff from the aligned FITS, chronological order."""
    with fits.open(folder / 'aligned_diagnostic.fits') as hdul:
        epochs = [hdul['EPOCH1'].data.astype(float), hdul['EPOCH2'].data.astype(float)]
        common = hdul['COMMON'].data.astype(bool)
    order = sorted(range(2), key=lambda i: report['inputs'][i]['mjd'])
    early, late = (np.where(common, epochs[i], np.nan) for i in order)
    values = np.concatenate([early[common], late[common]])
    lo, hi = map(float, np.percentile(values, [2, 99.5]))
    diff = late - early
    limit = float(np.percentile(np.abs(diff[common]), 99)) or 1.0
    # shared png_bytes flips rows, so PNG row 0 = largest y, matching the origin='lower' comparison figure.
    files = {'epoch_early.png': frame_png(early, lo, hi),
             'epoch_late.png': frame_png(late, lo, hi),
             'diff_late_minus_early.png': diff_png(diff, limit)}
    for name, data in files.items():
        (folder / f'demo_{name}').write_bytes(data)
    norm = {'vmin': lo, 'vmax': hi, 'stretch': 'asinh', 'diff_limit': limit,
            'png_orientation': 'row0_top_is_max_y', 'missing_rgb': [0, 0, 0]}
    return order, norm, files


def upload(session, base, key, path, data, ctype):
    r = session.post(f'{base}/storage/v1/object/{BUCKET}/{path}', data=data,
                     headers={'Authorization': f'Bearer {key}', 'apikey': key, 'x-upsert': 'true',
                              'Content-Type': ctype}, timeout=60)
    if r.status_code >= 300:
        raise RuntimeError(f'upload {path}: HTTP {r.status_code} {r.text[:200]}')


def collect_pairs(frames, storage, uploaded=None):
    uploaded = uploaded or {}
    pairs = []
    for rep_path in sorted((ROOT / 'data/processed').glob('**/report.json')):
        report = load(rep_path)
        if report.get('release') != 'dr1' or 'inputs' not in report or report.get('target') not in TARGETS:
            continue
        folder = rep_path.parent
        tkey, det = TARGETS[report['target']], int(report['detector'])
        order, norm, rendered = render_pair(folder, report)
        e, l = (report['inputs'][i] for i in order)
        ids = [frame_id(tkey, x['obs_id'], det) for x in (e, l)]
        missing = [i for i in ids if (tkey, i.split(':')[1], det) not in frames]
        if missing:
            print('skip pair, frame not screened:', folder, missing)
            continue
        pid = f"{tkey}:D{det}:{e['obs_id']}__{l['obs_id']}"
        prefix = f"{tkey}/d{det}/{e['obs_id']}__{l['obs_id']}"
        assets = {'epoch_early_png': f'{prefix}/epoch_early.png', 'epoch_late_png': f'{prefix}/epoch_late.png',
                  'diff_png': f'{prefix}/diff_late_minus_early.png', 'comparison_png': f'{prefix}/comparison.png',
                  'blink_gif': f'{prefix}/blink.gif', 'aligned_fits': f'{prefix}/aligned_diagnostic.fits'}
        status = 'not_configured'
        # Skip re-uploading a pair already in the bucket whose processed files are older than its last sync.
        newest = max((folder / f).stat().st_mtime for f in ('report.json', 'comparison.png', 'blink.gif', 'aligned_diagnostic.fits'))
        if storage and pid in uploaded and newest < uploaded[pid]:
            status = 'uploaded'
        elif storage:
            session, base, key = storage
            try:
                for name, data in rendered.items():
                    upload(session, base, key, f'{prefix}/{name}', data, 'image/png')
                upload(session, base, key, assets['comparison_png'], (folder / 'comparison.png').read_bytes(), 'image/png')
                upload(session, base, key, assets['blink_gif'], (folder / 'blink.gif').read_bytes(), 'image/gif')
                upload(session, base, key, assets['aligned_fits'], (folder / 'aligned_diagnostic.fits').read_bytes(), 'application/fits')
                status = 'uploaded'
            except Exception as exc:  # record and continue with other pairs
                print('upload failed:', pid, exc)
                status = 'failed'
        shape = report.get('grid_shape_yx') or [None, None]
        pairs.append({
            'pair_id': pid, 'target_key': tkey, 'detector': det, 'frame_early_id': ids[0], 'frame_late_id': ids[1],
            'epoch_early_mjd': e['mjd'], 'epoch_late_mjd': l['mjd'],
            'wavelength_early_um': e.get('wavelength_um'), 'wavelength_late_um': l.get('wavelength_um'),
            'geometric_common_fraction': report.get('geometric_common_fraction'),
            'common_coverage_fraction': report.get('common_coverage_fraction'),
            'common_valid_pixels': report.get('common_valid_pixels'), 'grid_width': shape[1], 'grid_height': shape[0],
            'pixel_scale_arcsec': report.get('pixel_scale_arcsec'), 'norm': norm,
            'is_primary': folder.name.endswith(('_comparison', '_display')), 'pair_kind': report.get('pair_kind', 'screened'), 'status': report.get('status', 'preliminary_engineering_diagnostic'),
            'assets': assets, 'upload_status': status, 'warnings': report.get('warnings', []),
            'report': {**report, 'local_folder': str(folder.relative_to(ROOT)).replace('\\', '/')},
        })
    return pairs


def upsert(cur, table, key, rows, cols):
    sql = (f'insert into sky_archive.{table} ({", ".join(cols)}, updated_at) values ({", ".join(["%s"] * len(cols))}, now()) '
           f'on conflict ({key}) do update set ' + ', '.join(f'{c}=excluded.{c}' for c in cols if c != key) + ', updated_at=now()')
    defaults = {'bad_flags': [], 'reasons': [], 'warnings': [], 'screening': {}, 'provenance': {}, 'norm': {},
                'assets': {}, 'report': {}}
    wrap = lambda v: Jsonb(v) if isinstance(v, dict) else v  # noqa: E731
    cur.executemany(sql, [[wrap(r[c] if r.get(c) is not None else defaults.get(c)) for c in cols] for r in rows])


FRAME_COLS = ['frame_id', 'target_key', 'product_id', 'obs_id', 'detector', 'observed_mjd', 'observed_at', 'wavelength_um',
              'bandwidth_um', 'download_status', 'cutout_url', 'cutout_size_deg', 'cutout_sha256', 'cutout_bytes',
              'predicted_ra_deg', 'predicted_dec_deg', 'predicted_pixel_x', 'predicted_pixel_y', 'target_inside',
              'target_pixel_finite', 'target_pixel_flags', 'bad_flags', 'usable', 'reasons', 'screening', 'provenance']
PAIR_COLS = ['pair_id', 'target_key', 'detector', 'frame_early_id', 'frame_late_id', 'epoch_early_mjd', 'epoch_late_mjd',
             'wavelength_early_um', 'wavelength_late_um', 'geometric_common_fraction', 'common_coverage_fraction',
             'common_valid_pixels', 'grid_width', 'grid_height', 'pixel_scale_arcsec', 'norm', 'is_primary', 'status',
             'assets', 'upload_status', 'warnings', 'report', 'pair_kind']

SEQ_COLS = ['sequence_id', 'target_key', 'detector', 'kind', 'is_primary', 'frame_ids', 'frame_count', 'epoch_mjds',
            'wavelengths_um', 'span_days', 'common_coverage_fraction', 'common_valid_pixels', 'grid_width', 'grid_height',
            'pixel_scale_arcsec', 'norm', 'assets', 'upload_status', 'status', 'warnings', 'report']
CTYPES = {'.png': 'image/png', '.gif': 'image/gif', '.fits': 'application/fits'}


def collect_sequences(frames, storage, uploaded=None):
    """Same-wavelength sequences from data/processed_sequences/ (one primary per target+detector)."""
    uploaded = uploaded or {}
    rows = []
    for rep_path in sorted((ROOT / 'data/processed_sequences').glob('*/report.json')):
        report = load(rep_path)
        if report.get('release') != 'dr1' or report.get('target') not in TARGETS:
            continue
        folder, tkey, det = rep_path.parent, TARGETS[report['target']], int(report['detector'])
        inputs = report['inputs']
        ids = [frame_id(tkey, i['obs_id'], det) for i in inputs]
        if any((tkey, i['obs_id'], det) not in frames for i in inputs):
            print('skip sequence, frame not screened:', folder)
            continue
        sid = f"{tkey}:D{det}:{inputs[0]['obs_id']}__{inputs[-1]['obs_id']}:n{len(inputs)}"
        prefix = f"sequences/{tkey}/d{det}/{inputs[0]['obs_id']}__{inputs[-1]['obs_id']}_n{len(inputs)}"
        n = len(inputs)
        assets = {'frames': [f'{prefix}/frame_{k:02d}.png' for k in range(1, n + 1)],
                  'diffs': [f'{prefix}/diff_{k:02d}_minus_01.png' for k in range(1, n + 1)],
                  'blink_gif': f'{prefix}/blink.gif', 'filmstrip_png': f'{prefix}/filmstrip.png',
                  'aligned_fits': f'{prefix}/aligned_sequence.fits'}
        names = report['outputs']
        newest = max((folder / f).stat().st_mtime for f in names + ['report.json'])
        status = 'not_configured'
        if storage and sid in uploaded and newest < uploaded[sid]:
            status = 'uploaded'
        elif storage:
            session, base, key = storage
            try:
                for name in names:
                    upload(session, base, key, f'{prefix}/{name}', (folder / name).read_bytes(), CTYPES[Path(name).suffix])
                status = 'uploaded'
            except Exception as exc:  # record and continue
                print('upload failed:', sid, exc)
                status = 'failed'
        shape = report.get('grid_shape_yx') or [None, None]
        rows.append({'sequence_id': sid, 'target_key': tkey, 'detector': det, 'kind': report['kind'], 'is_primary': True,
                     'frame_ids': ids, 'frame_count': n, 'epoch_mjds': [i['mjd'] for i in inputs],
                     'wavelengths_um': [i['wavelength_um'] for i in inputs], 'span_days': inputs[-1]['mjd'] - inputs[0]['mjd'],
                     'common_coverage_fraction': report.get('common_coverage_fraction'),
                     'common_valid_pixels': report.get('common_valid_pixels'), 'grid_width': shape[1], 'grid_height': shape[0],
                     'pixel_scale_arcsec': report.get('pixel_scale_arcsec'), 'norm': report.get('norm', {}), 'assets': assets,
                     'upload_status': status, 'status': report['status'], 'warnings': report.get('warnings', []),
                     'report': {**report, 'local_folder': str(folder.relative_to(ROOT)).replace(chr(92), '/')}})
    return rows


db_ids = set()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', help='Render and count only; no database or storage writes')
    args = parser.parse_args()
    load_dotenv(ROOT / '.env')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SECRET_KEY')
    base = os.getenv('SUPABASE_URL', '').rstrip('/')
    ref = os.getenv('PGUSER', '').partition('.')[2]
    if not base and re.fullmatch(r'[a-z0-9]{20}', ref):
        base = f'https://{ref}.supabase.co'  # pooler user is postgres.<project_ref>
    if not key:
        print('Storage upload not configured: set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in .env')
    storage = (requests.Session(), base, key) if key and base and not args.dry_run else None
    with psycopg.connect(connect_timeout=20) as conn, conn.cursor() as cur:
        cur.execute("""select tp.target_key, p.obs_id, p.band, p.mjd_start, p.product_id
                       from sky_archive.products p join sky_archive.target_products tp using (product_id)
                       where p.collection = 'spherex_dr1'""")
        db_products = {}
        for tkey, obs, band, mjd, pid in cur.fetchall():
            db_products[(tkey, obs, int(band[-1]))] = mjd
            db_ids.add(pid)
        frames = collect_frames(db_products)
        cur.execute("select pair_id, extract(epoch from updated_at) from sky_archive.dr1_pairs where upload_status = 'uploaded'")
        uploaded = {pid: float(ts) for pid, ts in cur.fetchall()}
        pairs = collect_pairs(frames, storage, uploaded)
        # Only one primary per target+detector (the *_comparison folder); guard against duplicates.
        # Screened primaries win over display-only ones for the same target+detector.
        pairs.sort(key=lambda p: p['pair_kind'] != 'screened')
        seen = set()
        for p in pairs:
            if p['is_primary'] and (p['target_key'], p['detector']) in seen:
                p['is_primary'] = False
            seen.add((p['target_key'], p['detector'])) if p['is_primary'] else None
        from collections import Counter
        print('frames', len(frames), dict(Counter(f['download_status'] for f in frames.values())))
        print('pairs', len(pairs), dict(Counter(p['upload_status'] for p in pairs)))
        if args.dry_run:
            return
        upsert(cur, 'dr1_frames', 'frame_id', list(frames.values()), FRAME_COLS)
        cur.execute('update sky_archive.dr1_pairs set is_primary = false where pair_id <> all(%s)', [[p['pair_id'] for p in pairs if p['is_primary']]])
        upsert(cur, 'dr1_pairs', 'pair_id', pairs, PAIR_COLS)
        # Sequences (additive; pairs above are unchanged).
        cur.execute("select sequence_id, extract(epoch from updated_at) from sky_archive.dr1_sequences where upload_status = 'uploaded'")
        seq_uploaded = {sid: float(ts) for sid, ts in cur.fetchall()}
        sequences = collect_sequences(frames, storage, seq_uploaded)
        cur.execute('update sky_archive.dr1_sequences set is_primary = false where sequence_id <> all(%s)', [[s['sequence_id'] for s in sequences]])
        upsert(cur, 'dr1_sequences', 'sequence_id', sequences, SEQ_COLS)
        print('sequences', len(sequences), dict(Counter(s['upload_status'] for s in sequences)))
        conn.commit()
        print('synced to sky_archive.dr1_frames / dr1_pairs')


if __name__ == '__main__':
    main()
