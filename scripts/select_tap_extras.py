"""Select up to three untried DR1 TAP observations for the checkpointed downloader."""
import argparse
import json
from urllib.parse import urlencode, urlsplit
from astropy.time import Time
from astropy.table import Table
from download_spherex import ROOT, coordinate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', choices=['barnard', 'r_draconis'], required=True)
    parser.add_argument('--detector', type=int, choices=range(1, 7), required=True)
    parser.add_argument('--batch', required=True)
    args = parser.parse_args()
    if not args.batch.isalnum():
        parser.error('batch must be alphanumeric')
    folder = ROOT / 'data/spherex' / args.target
    output = folder / 'irsa-download-lists' / f'tap-extra-d{args.detector}-{args.batch}.txt'
    if output.exists():
        raise SystemExit(f'Existing selection preserved: {output}')
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf8'))
    report = json.loads((folder / 'selection_report.json').read_text(encoding='utf8'))
    tried = set(report['files']) | {f"{r['obs_id']}_D{r['detector']}" for r in manifest['downloads']}
    records = json.loads((ROOT / 'data/reports' / f'{args.target}_tap_latest.json').read_text(encoding='utf8'))['rows']
    rows = sorted((r for r in records if r['detector'] == args.detector and f"{r['obs_id']}_D{r['detector']}" not in tried), key=lambda r: r['mjd'])
    sia = Table.read(folder / 'sia-votable.xml', format='votable', use_names_over_ids=True)
    old = {(str(r['obs_id']), str(r['energy_bandpassname'])) for r in sia}
    new = [r for r in rows if (r['obs_id'], f"SPHEREx-D{r['detector']}") not in old]
    if new:
        rows = new
    n = min(3, len(rows))
    indices = sorted({round(i * (len(rows)-1)/(n-1)) for i in range(n)}) if n > 1 else list(range(n))
    pos = coordinate(args.target, Time('J2026'))
    urls = []
    for idx in indices:
        path = urlsplit(rows[idx]['source_url']).path.removeprefix('/ibe/data/')
        if not path.startswith('spherex/dr1/level2/'):
            raise ValueError('Unexpected TAP source path')
        urls.append('https://irsa.ipac.caltech.edu/ibe/cutout?' + urlencode({'ra': str(pos.ra.deg), 'dec': str(pos.dec.deg), 'size': '0.1', 'path': path}, safe='/'))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text('\n'.join(urls) + ('\n' if urls else ''), encoding='utf8')
    print(f'{args.target}: selected {len(urls)} from {len(rows)} untried D{args.detector} TAP records; {output}', flush=True)


if __name__ == '__main__':
    main()
