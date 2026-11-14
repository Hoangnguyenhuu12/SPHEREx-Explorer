"""Restore missing public unWISE FITS storage links only after SHA-256 verification."""
import hashlib
import io
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg
import requests
from astropy.io import fits
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/reports/unwise_archive_storage_sync.json'
BUCKET = 'spherex-dr1-demo'
PREFIX = 'unwise-archive/verified-fits-v1'


def main():
    load_dotenv(ROOT / '.env')
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SECRET_KEY']
    with psycopg.connect(connect_timeout=15) as conn:
        rows = conn.execute("""SELECT access_url, sha256 FROM sky_archive.unwise_epoch_cutouts
                               WHERE storage_url IS NULL AND access_url IS NOT NULL AND sha256 IS NOT NULL
                               ORDER BY band, coadd_id, epoch""").fetchall()
        print('Rows to verify:', len(rows), flush=True)

        def transfer(row):
            url, expected = row
            try:
                r = requests.get(url, timeout=(10, 35))
                r.raise_for_status()
                payload = r.content
                actual = hashlib.sha256(payload).hexdigest()
                if actual != expected:
                    return {'sha256': expected, 'status': 'checksum_mismatch', 'source_url': url}
                with fits.open(io.BytesIO(payload)) as hdus:
                    if hdus[0].data is None or hdus[0].data.ndim != 2:
                        raise ValueError('Invalid FITS image')
                path = f'{PREFIX}/{expected}.fits'
                uploaded = requests.post(f'{base}/storage/v1/object/{BUCKET}/{path}', data=payload,
                                         headers={'apikey': key, 'Authorization': f'Bearer {key}', 'x-upsert': 'true',
                                                  'Content-Type': 'application/fits'}, timeout=60)
                uploaded.raise_for_status()
                return {'sha256': expected, 'status': 'uploaded', 'source_url': url,
                        'storage_url': f'{base}/storage/v1/object/public/{BUCKET}/{path}'}
            except (requests.RequestException, OSError, ValueError) as exc:
                return {'sha256': expected, 'status': 'failed', 'source_url': url,
                        'error': f'{type(exc).__name__}: {str(exc)[:300]}'}

        outcomes = []
        OUT.parent.mkdir(parents=True, exist_ok=True)
        with ThreadPoolExecutor(max_workers=4) as pool:
            for result in pool.map(transfer, rows):
                if result['status'] == 'uploaded':
                    conn.execute("""UPDATE sky_archive.unwise_epoch_cutouts SET storage_url=%s
                                    WHERE access_url=%s AND sha256=%s AND storage_url IS NULL""",
                                 (result['storage_url'], result['source_url'], result['sha256']))
                    conn.commit()
                outcomes.append(result)
                OUT.write_text(json.dumps(outcomes, indent=2), encoding='utf8')
                if len(outcomes) % 20 == 0 or result['status'] != 'uploaded':
                    print('Processed', len(outcomes), '/', len(rows), result['status'], flush=True)
        print('Finished:', len(outcomes), 'failures:', sum(x['status'] != 'uploaded' for x in outcomes), flush=True)


if __name__ == '__main__':
    main()
