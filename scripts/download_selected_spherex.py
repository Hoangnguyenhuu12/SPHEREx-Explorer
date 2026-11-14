"""Resume Data Explorer-selected DR1 cutouts, retrying each for up to three minutes."""
import argparse
import hashlib
import json
import re
import subprocess
import time
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

from astropy.io import fits
from astropy.time import Time
from download_spherex import OUT, ROOT, TARGETS, coordinate, save_json
from validate_fits import validate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', choices=TARGETS, required=True)
    parser.add_argument('--url-list', type=Path, required=True)
    parser.add_argument('--retry-seconds', type=float, default=180)
    parser.add_argument('--limit', type=int, default=3)
    parser.add_argument('--defer-503', action='store_true', help='Move on immediately after HTTP 503 and save the URL for a later retry')
    args = parser.parse_args()
    if args.retry_seconds <= 0 or args.limit < 1:
        parser.error('retry-seconds and limit must be positive')
    folder = OUT / args.target
    (folder / 'cutouts').mkdir(parents=True, exist_ok=True)
    manifest_path = folder / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8')) if manifest_path.exists() else {'target': args.target, 'release': 'dr1', 'downloads': []}
    report_path = folder / 'selection_report.json'
    report = json.loads(report_path.read_text(encoding='utf8')) if report_path.exists() else {'target': args.target, 'files': {}}
    urls = [line.strip() for line in args.url_list.read_text(encoding='utf8').splitlines() if line.startswith('https://')]
    if len(urls) > args.limit:
        raise ValueError('URL list exceeds limit; select a smaller list or increase --limit')
    any_failure = False
    for url in urls:
        parsed = urlsplit(url)
        params = parse_qs(parsed.query)
        if parsed.scheme != 'https' or parsed.netloc != 'irsa.ipac.caltech.edu' or parsed.path != '/ibe/cutout':
            raise ValueError(f'Unexpected URL: {url}')
        path = params.get('path', [''])[0]
        match = re.fullmatch(r'spherex/dr1/level2/[A-Za-z0-9_/-]+/level2_([A-Za-z0-9_]+)D([1-6])_spx_[A-Za-z0-9_-]+\.fits', path)
        if not match:
            raise ValueError(f'Unexpected DR1 spectral image path: {path}')
        obs, detector = match.group(1), int(match.group(2))
        key = f'{obs}_D{detector}'
        dest = folder / 'cutouts' / f'{key}.fits'
        old = next((x for x in manifest.get('downloads', []) if x.get('obs_id') == obs and x.get('detector') == detector), None)
        if dest.exists():
            digest = hashlib.sha256(dest.read_bytes()).hexdigest()
            if not old or old.get('sha256') != digest:
                report['files'][key] = {'status': 'error', 'error': 'Existing file has no matching manifest SHA256; preserved'}
                any_failure = True
            else:
                report['files'][key] = {'status': 'already_downloaded', 'sha256': digest}
                print(f'{key}: already downloaded, skipped', flush=True)
            save_json(report_path, report)
            continue
        center = coordinate(args.target, Time('J2026'))
        source = 'https://irsa.ipac.caltech.edu/ibe/data/' + path
        cutout_url = source + '?' + urlencode({'center': f'{center.ra.deg:.9f},{center.dec.deg:.9f}', 'size': '0.1'}, safe=',')
        deadline = time.monotonic() + args.retry_seconds
        attempts = 0
        error = 'not attempted'
        while time.monotonic() < deadline:
            attempts += 1
            part = dest.with_suffix('.fits.part')
            try:
                remaining = deadline-time.monotonic()
                cmd = ['curl.exe', '-f', '-L', '-sS', '--max-time', str(max(1, int(min(30, remaining)))), '-o', str(part), cutout_url]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=max(2, remaining))
                if proc.returncode:
                    raise RuntimeError(proc.stderr.strip() or f'curl exited {proc.returncode}')
                with fits.open(part) as hdul:
                    mjd = float(hdul['IMAGE'].header['MJD-BEG'])
                c = coordinate(args.target, Time(mjd, format='mjd', scale='utc'))
                result = validate(part, float(c.ra.deg), float(c.dec.deg), detector, obs)
                if not result['valid']:
                    raise ValueError('FITS validation: ' + str(result['errors']))
                part.replace(dest)
                rel_dest = str(dest.relative_to(ROOT))
                result['path'] = rel_dest
                entry = {'obs_id': obs, 'detector': detector, 'mjd': mjd, 'iso_utc': Time(mjd, format='mjd', scale='utc').isot, 'release': 'dr1', 'pipeline_version': result['version'], 'source_url': source, 'cutout_url': cutout_url, 'original_irsa_selection_url': url, 'target_ra_deg': float(c.ra.deg), 'target_dec_deg': float(c.dec.deg), 'file': rel_dest, 'size_bytes': dest.stat().st_size, 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(), 'validation': result}
                manifest.setdefault('downloads', []).append(entry)
                save_json(manifest_path, manifest)
                report['files'][key] = {'status': 'downloaded', 'attempts': attempts, 'sha256': entry['sha256']}
                save_json(report_path, report)
                print(f'{key}: downloaded {entry["size_bytes"]} bytes', flush=True)
                break
            except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
                part.unlink(missing_ok=True)
                error = f'{type(exc).__name__}: {exc}'
                if args.defer_503 and 'returned error: 503' in error:
                    any_failure = True
                    report['files'][key] = {'status': 'deferred_503', 'attempts': attempts, 'error': error, 'selection_url': url}
                    save_json(report_path, report)
                    print(f'{key}: HTTP 503 deferred; moving on', flush=True)
                    break
                if isinstance(exc, ValueError):
                    any_failure = True
                    report['files'][key] = {'status': 'failed', 'attempts': attempts, 'error': error}
                    save_json(report_path, report)
                    print(f'{key}: invalid data, moving on: {error}', flush=True)
                    break
                report['files'][key] = {'status': 'retrying', 'attempts': attempts, 'error': error}
                save_json(report_path, report)
                print(f'{key}: attempt {attempts} failed: {error}', flush=True)
                remaining = deadline-time.monotonic()
                if remaining > 0:
                    time.sleep(min(10, remaining))
        else:
            any_failure = True
            report['files'][key] = {'status': 'failed', 'attempts': attempts, 'error': error}
            save_json(report_path, report)
            print(f'{key}: failed after {args.retry_seconds:g}s; moving on', flush=True)
    failed = [{'observation': key, 'error': value.get('error')} for key, value in report['files'].items() if value['status'] in {'failed', 'error'}]
    historical = [item for item in failed if 'target pixel is non-finite' in (item['error'] or '') or 'predicted target position outside cutout' in (item['error'] or '')]
    validation_report = {
        'target': args.target,
        'release': 'dr1',
        'validation_policy': 'Acquisition integrity and identity; non-finite or uncovered target pixels are warnings, not science approval.',
        'files': [entry['validation'] for entry in manifest.get('downloads', []) if 'validation' in entry],
        'errors': [item for item in failed if item not in historical],
        'deferred_503': [{'observation': key, 'selection_url': value['selection_url']} for key, value in report['files'].items() if value['status'] == 'deferred_503'],
        'historical_non_retained_attempts': historical,
    }
    save_json(folder / 'validation_report.json', validation_report)
    return 1 if any_failure else 0


if __name__ == '__main__':
    raise SystemExit(main())
