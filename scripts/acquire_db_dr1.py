"""Download the DR1 products listed in Supabase sky_archive.products that are not yet local,
then screen, process any new candidate pairs, and leave Supabase syncing to sync_supabase_dr1.py.

Only products whose s_region contains the target's predicted position at observation time are
selected (others are recorded as not_covered in data/reports/db_dr1_coverage.json). Downloads go
through download_selected_spherex.py (checkpointed, SHA-verified, HTTP 503 deferred).
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import psycopg
from astropy.time import Time
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from download_spherex import coordinate, save_json  # noqa: E402
from repair_fusion_qr3 import footprint_contains  # noqa: E402

TARGETS = {'barnard': 'barnard', 'epsilon_indi_b': 'epsindib', 'r_draconis': 'rdra',
           'rw_aurigae': 'rwaur', 'wise0855': 'wise0855'}
COVERAGE = ROOT / 'data/reports/db_dr1_coverage.json'


def tried(local):
    folder = ROOT / 'data/spherex' / local
    report = json.loads((folder / 'selection_report.json').read_text(encoding='utf8')) if (folder / 'selection_report.json').exists() else {'files': {}}
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf8'))
    done = {f"{d['obs_id']}_D{d['detector']}" for d in manifest['downloads']}
    # deferred_503 and deferred_timeout entries are retried; other recorded outcomes (failed, downloaded) are not.
    return done | {k for k, v in report['files'].items() if v.get('status') not in {'deferred_503', 'deferred_timeout'}}


def process_new_pairs(local):
    screening = json.loads((ROOT / 'data/reports/comparison_candidates.json').read_text(encoding='utf8'))
    for pair in screening['targets'][local]['candidate_pairs']:
        det, observations = pair['detector'], sorted(pair['observations'])
        primary = ROOT / 'data/processed' / f'{local}_d{det}_comparison'
        if (primary / 'report.json').exists() and sorted(x['obs_id'] for x in json.loads((primary / 'report.json').read_text(encoding='utf8'))['inputs']) == observations:
            continue
        extra = ROOT / 'data/processed' / f'{local}_d{det}_pairs' / '__'.join(observations)
        if (extra / 'report.json').exists() or (extra / 'processing_failure.json').exists():
            continue
        destination = extra if (primary / 'report.json').exists() else primary
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/process_candidate_pair.py'), '--target', local,
                                 '--detector', str(det), '--observations', *observations, '--output', str(destination)],
                                cwd=ROOT, capture_output=True, text=True)
        print(f'{local} D{det} {observations}: rc={result.returncode}', flush=True)
        if result.returncode:
            extra.mkdir(parents=True, exist_ok=True)
            save_json(extra / 'processing_failure.json', {'observations': observations, 'status': 'processing_failed', 'error': result.stderr[-4000:]})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--targets', nargs='+', choices=list(TARGETS), default=list(TARGETS))
    parser.add_argument('--chunk', type=int, default=25, help='Files per downloader call before rescreening')
    args = parser.parse_args()
    load_dotenv(ROOT / '.env')
    with psycopg.connect(connect_timeout=20) as conn:
        rows = conn.execute("""select tp.target_key, p.obs_id, p.band, p.mjd_start, p.access_url, p.metadata->'record'->>'s_region'
                               from sky_archive.products p join sky_archive.target_products tp using (product_id)
                               where p.collection = 'spherex_dr1' order by p.mjd_start""").fetchall()
    coverage = json.loads(COVERAGE.read_text(encoding='utf8')) if COVERAGE.exists() else {}
    for local in args.targets:
        tkey, done = TARGETS[local], tried(local)
        pos = coordinate(local, Time('J2026'))
        urls, not_covered = [], []
        for key, obs, band, mjd, url, region in rows:
            det = int(band[-1])
            if key != tkey or f'{obs}_D{det}' in done:
                continue
            path = urlsplit(url).path.removeprefix('/ibe/data/')
            if not path.startswith('spherex/dr1/level2/') or not region:
                continue
            if not footprint_contains(region, coordinate(local, Time(mjd, format='mjd', scale='utc'))):
                not_covered.append(f'{obs}_D{det}')
                continue
            urls.append('https://irsa.ipac.caltech.edu/ibe/cutout?' + urlencode(
                {'ra': str(pos.ra.deg), 'dec': str(pos.dec.deg), 'size': '0.1', 'path': path}, safe='/'))
        coverage[local] = {'not_covered': sorted(set(not_covered) | set(coverage.get(local, {}).get('not_covered', [])))}
        save_json(COVERAGE, coverage)
        print(f'{local}: {len(urls)} DB DR1 products to download, {len(not_covered)} not covering the predicted position', flush=True)
        folder = ROOT / 'data/spherex' / local / 'irsa-download-lists'
        for start in range(0, len(urls), args.chunk):
            chunk = folder / f'db-dr1-{start // args.chunk:03d}.txt'
            chunk.write_text('\n'.join(urls[start:start + args.chunk]) + '\n', encoding='utf8')
            subprocess.run([sys.executable, str(ROOT / 'scripts/download_selected_spherex.py'), '--target', local,
                            '--url-list', str(chunk), '--limit', str(args.chunk), '--retry-seconds', '180', '--defer-503'], cwd=ROOT)
        if urls:
            subprocess.run([sys.executable, str(ROOT / 'scripts/screen_comparison_candidates.py')], cwd=ROOT, check=True)
            process_new_pairs(local)
    subprocess.run([sys.executable, str(ROOT / 'scripts/check_comparison_readiness.py')], cwd=ROOT)


if __name__ == '__main__':
    main()
