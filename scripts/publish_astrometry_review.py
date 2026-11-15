"""Publish provisional astrometry review artifacts without changing science flags."""
import hashlib
import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
BUCKET = 'spherex-dr1-demo'
PREFIX = 'astrometry-review/2026-11-15-v1'


def main():
    load_dotenv(ROOT / '.env')
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SECRET_KEY']
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'x-upsert': 'true'}
    neossat = ROOT / 'data/neossat_review/wcs_candidates'
    gaia = ROOT / 'data/gaia_geocentric_review'
    files = [(ROOT / 'docs/ASTROMETRY_REVIEW_2019_NEOSSAT_GAIA.md', 'README.md'),
             (ROOT / 'data/reports/gaia_geocentric_parallax_review.json', 'gaia/summary.json'),
             (neossat / 'review.json', 'neossat/review.json')]
    files += [(p, f'neossat/{p.name}') for p in sorted(neossat.glob('*.wcs.txt'))]
    files += [(p, f'neossat/{p.name}') for p in sorted(neossat.glob('*.solver.json'))]
    files += [(p, f'gaia/{p.name}') for p in sorted(gaia.glob('*-w[12].json'))]
    if len(list(neossat.glob('*.wcs.txt'))) != 3 or len(list(gaia.glob('*-w[12].json'))) != 10:
        raise ValueError('Expected three candidate WCS files and ten Gaia review groups')
    entries = []
    for path, relative in files:
        payload = path.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        content_type = 'application/json' if path.suffix == '.json' else 'application/octet-stream'
        remote = f'{PREFIX}/{relative}'
        response = requests.post(f'{base}/storage/v1/object/{BUCKET}/{remote}', data=payload,
                                 headers={**headers, 'Content-Type': content_type}, timeout=60)
        response.raise_for_status()
        entries.append({'name': relative, 'sha256': digest, 'bytes': len(payload),
                        'url': f'{base}/storage/v1/object/public/{BUCKET}/{remote}'})
        print('Uploaded', relative, flush=True)
    manifest = {'status': 'provisional_science_review_required',
                'warning': 'NEOSSAT WCS candidates are not certified; Gaia positions use a geocentric approximation, not WISE spacecraft ephemeris.',
                'existing_verified_flags_and_overlays_unchanged': True, 'artifacts': entries}
    payload = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf8')
    response = requests.post(f'{base}/storage/v1/object/{BUCKET}/{PREFIX}/manifest.json', data=payload,
                             headers={**headers, 'Content-Type': 'application/json'}, timeout=60)
    response.raise_for_status()
    print('Published manifest with', len(entries), 'artifacts')


if __name__ == '__main__':
    main()
