"""Acquire bounded, resumable SPHEREx DR1 cutouts from IRSA TAP."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
import warnings
from pathlib import Path
from urllib.parse import urlencode

import astropy.units as u
import pyvo
import requests
from astropy.coordinates import SkyCoord
from astropy.time import Time
from validate_fits import validate

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'spherex'
TAP = 'https://irsa.ipac.caltech.edu/TAP'
# SIMBAD ICRS coordinates at J2000, previously retrieved and saved in
# data/five_targets/*/simbad.txt by five_targets.py. pmra includes cos(dec).
# WISE is resolved independently by its SIMBAD identifier, not a Gaia match.
TARGETS = {
    'barnard': ('GJ 699', 269.4520769586187, 4.693364966576667, -801.551, 10362.394),
    'wise0855': ('WISE J085510.83-071442.5', 133.81890825, -7.247048, -8123.7, 673.2),
    'epsilon_indi_b': ('2MASS J22041052-5646577', 331.0441465885212, -56.78284419511611, 3981.977, -2466.832),
    'rw_aurigae': ('RW Aur', 76.95652603458333, 30.401438173888884, 7.23, -20.33),
    'r_draconis': ('R Dra', 248.16761083294998, 66.75497941722, -20.643, 6.149),
}


class TimeoutSession(requests.Session):
    def __init__(self, timeout):
        super().__init__()
        self.timeout = timeout

    def request(self, method, url, **kwargs):
        if kwargs.get('timeout') is None:
            kwargs['timeout'] = self.timeout
        return super().request(method, url, **kwargs)


def coordinate(target, epoch):
    _, ra, dec, pmra, pmdec = TARGETS[target]
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', category=UserWarning)
        c = SkyCoord(ra=ra*u.deg, dec=dec*u.deg, pm_ra_cosdec=pmra*u.mas/u.yr,
                     pm_dec=pmdec*u.mas/u.yr, obstime=Time('J2000'), frame='icrs')
        return c.apply_space_motion(new_obstime=epoch)


def save_json(path, obj):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(obj, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    temp.replace(path)


def query(target, session):
    # Query at J2026; all candidate files are subsequently checked at their own epochs.
    pos = coordinate(target, Time('J2026'))
    query_text = f"""SELECT a.uri, p.time_bounds_lower, p.energy_bandpassname, p.provenance_version
    FROM spherex.artifact AS a JOIN spherex.plane AS p ON a.planeid = p.planeid
    WHERE 1 = CONTAINS(POINT('ICRS', {pos.ra.deg:.12f}, {pos.dec.deg:.12f}), p.poly)
      AND a.uri LIKE '%/spherex/dr1/level2/%'
    ORDER BY p.time_bounds_lower"""
    result = pyvo.dal.TAPService(TAP, session=session).search(query_text, maxrec=100000)
    if result.status[0].upper() == 'OVERFLOW':
        raise RuntimeError('TAP result overflow: counts would be incomplete')
    rows = []
    for row in result.to_table():
        uri, band = str(row['uri']), str(row['energy_bandpassname'])
        match = re.search(r'SPHEREx-D([1-6])', band, re.IGNORECASE)
        obs = re.search(r'level2_(\d{4}W\d{2}_[^/]+?)D([1-6])_spx_', uri)
        if not match or not obs or match.group(1) != obs.group(2):
            raise ValueError(f'Unexpected IRSA observation URI/band: {uri} / {band}')
        if not uri.startswith(('ibe/data/spherex/dr1/level2/', '/ibe/data/spherex/dr1/level2/')):
            raise ValueError(f'Unexpected non-DR1 URI: {uri}')
        mjd = float(row['time_bounds_lower'])
        moved = coordinate(target, Time(mjd, format='mjd', scale='utc'))
        rows.append({'obs_id': obs.group(1), 'detector': int(match.group(1)), 'mjd': mjd,
                     'iso_utc': Time(mjd, format='mjd', scale='utc').isot,
                     'release': 'dr1', 'pipeline_version': str(row['provenance_version']),
                     'source_url': 'https://irsa.ipac.caltech.edu/' + uri.lstrip('/'),
                     'target_ra_deg': float(moved.ra.deg), 'target_dec_deg': float(moved.dec.deg)})
    return rows, query_text


def run(target, args):
    folder = OUT / target
    cutouts = folder / 'cutouts'
    cutouts.mkdir(parents=True, exist_ok=True)
    identifier, ra, dec, pmra, pmdec = TARGETS[target]
    manifest_path, report_path = folder / 'manifest.json', folder / 'validation_report.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    manifest.update(target=target, identifier=identifier, release='dr1',
                    coordinate={'ra_deg': ra, 'dec_deg': dec, 'frame': 'ICRS', 'reference_epoch': 'J2000',
                                'pm_ra_cosdec_mas_per_year': pmra, 'pm_dec_mas_per_year': pmdec,
                                'source': 'https://simbad.cfa.harvard.edu/simbad/sim-id?' + urlencode({'Ident': identifier}),
                                'provenance': 'SIMBAD snapshot previously saved in data/five_targets',
                                'limitations': 'Linear proper motion only; no parallax, binary orbit, radial velocity or source detection.'},
                    query_status='running')
    manifest.setdefault('downloads', [])
    report = {'target': target, 'release': 'dr1', 'files': [], 'errors': []}
    save_json(manifest_path, manifest)
    session = TimeoutSession(args.timeout)
    try:
        for attempt in range(args.retries):
            try:
                rows, adql = query(target, session)
                break
            except (pyvo.dal.exceptions.DALServiceError, requests.RequestException):
                if attempt + 1 == args.retries:
                    raise
                time.sleep(2 ** attempt)
        counts = {f'D{i}': sum(row['detector'] == i for row in rows) for i in range(1, 7)}
        manifest.update(query_status='success', query_endpoint=TAP, adql=adql, counts_by_detector=counts,
                        search_position='J2026 linear proper motion; candidate footprint is rechecked at observation epoch',
                        counts_note='TAP candidate rows overlapping J2026 position, not confirmed detections')
        with (folder / 'observations.csv').open('w', newline='', encoding='utf-8') as f:
            fields = ['obs_id', 'detector', 'mjd', 'iso_utc', 'release', 'pipeline_version', 'source_url', 'target_ra_deg', 'target_dec_deg']
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
        print(f'{target}: {counts}', flush=True)
        candidates = [row for row in rows if args.detector is None or row['detector'] == args.detector]
        if not candidates:
            report['errors'].append({'stage': 'selection', 'error': 'No candidate observations for requested detector and release'})
        if args.limit > 3 and not any(d.get('validation', {}).get('valid') for d in manifest['downloads']):
            raise ValueError('Run and validate a pilot of at most 3 files for this target before expanding')
        # Even temporal sampling improves the chance of seeing a time baseline.
        if len(candidates) > args.limit:
            indices = sorted({round(i*(len(candidates)-1)/(args.limit-1)) for i in range(args.limit)}) if args.limit > 1 else [0]
            candidates = [candidates[i] for i in indices]
        for row in candidates:
            path = cutouts / f"{row['obs_id']}_D{row['detector']}.fits"
            params = {'center': f"{row['target_ra_deg']},{row['target_dec_deg']}d", 'size': args.size}
            cutout_url = row['source_url'] + '?' + urlencode(params)
            record = dict(row, cutout_url=cutout_url, file=str(path.relative_to(ROOT)))
            try:
                old = next((d for d in manifest['downloads'] if d.get('file') == record['file']), None)
                if path.exists():
                    if not old or old.get('cutout_url') != cutout_url:
                        raise RuntimeError('existing file has no matching provenance; refusing to overwrite')
                    result = validate(path, row['target_ra_deg'], row['target_dec_deg'], row['detector'], row['obs_id'])
                    if not result['valid']:
                        raise RuntimeError('existing file invalid; refusing to overwrite: ' + str(result['errors']))
                    if old.get('sha256') and hashlib.sha256(path.read_bytes()).hexdigest() != old['sha256']:
                        raise RuntimeError('existing file SHA256 does not match manifest')
                else:
                    temp = path.with_suffix('.fits.part')
                    for attempt in range(args.retries):
                        try:
                            with session.get(cutout_url, stream=True) as response:
                                response.raise_for_status()
                                with temp.open('wb') as f:
                                    for chunk in response.iter_content(1024 * 256):
                                        f.write(chunk)
                            result = validate(temp, row['target_ra_deg'], row['target_dec_deg'], row['detector'], row['obs_id'])
                            if not result['valid']:
                                raise ValueError('validation failed: ' + str(result['errors']))
                            temp.replace(path)
                            break
                        except Exception:
                            temp.unlink(missing_ok=True)
                            if attempt + 1 == args.retries:
                                raise
                            time.sleep(2 ** attempt)
                result['path'] = str(path.relative_to(ROOT))
                record.update(sha256=hashlib.sha256(path.read_bytes()).hexdigest(), size_bytes=path.stat().st_size, validation=result)
                manifest['downloads'] = [d for d in manifest['downloads'] if d.get('file') != record['file']] + [record]
                report['files'].append(result)
            except Exception as exc:
                report['errors'].append({'observation': row['obs_id'], 'detector': row['detector'], 'error': f'{type(exc).__name__}: {exc}'})
            save_json(manifest_path, manifest)
            save_json(report_path, report)
    except Exception as exc:
        manifest.update(query_status='error', query_error=f'{type(exc).__name__}: {exc}')
        report['errors'].append({'stage': 'query', 'error': manifest['query_error']})
        print(f"{target}: {manifest['query_error']}", flush=True)
        if not (folder / 'observations.csv').exists():
            (folder / 'observations.csv').write_text('obs_id,detector,mjd,iso_utc,release,pipeline_version,source_url,target_ra_deg,target_dec_deg\n', encoding='utf-8')
    save_json(manifest_path, manifest)
    save_json(report_path, report)
    return not report['errors']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', choices=[*TARGETS, 'all'], default='barnard')
    parser.add_argument('--detector', type=int, choices=range(1, 7))
    parser.add_argument('--limit', type=int, default=3, help='maximum attempted downloads per target (default 3)')
    parser.add_argument('--size', type=float, default=0.1, help='cutout size in degrees')
    parser.add_argument('--timeout', type=float, default=60, help='network connect/read timeout in seconds')
    parser.add_argument('--retries', type=int, default=3, help='download attempts')
    args = parser.parse_args()
    if args.limit < 1 or not 0 < args.size <= 0.2 or args.timeout <= 0 or args.retries < 1:
        parser.error('limit/retries/timeout must be positive; size must be in (0, 0.2] degrees')
    targets = TARGETS if args.target == 'all' else [args.target]
    results = [run(target, args) for target in targets]
    raise SystemExit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
