"""Select and download initial DR1 cutouts for Barnard and WISE D1-D5."""
import csv
import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlencode, urlsplit

from astropy.table import Table
from astropy.time import Time

from download_spherex import OUT, ROOT, coordinate


def main():
    outcome = 0
    for target in ('barnard', 'wise0855'):
        folder = OUT / target
        votable = folder / 'sia-votable.xml'
        table = Table.read(votable, format='votable', use_names_over_ids=True)
        pos = coordinate(target, Time('J2026'))
        for detector in range(1, 6):
            candidates = []
            for row in table:
                url = str(row['access_url'])
                if (str(row['obs_collection']).lower() == 'spherex_dr1'
                    and str(row['energy_bandpassname']) == f'SPHEREx-D{detector}'
                    and url.startswith('https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/')):
                    candidates.append((float(row['t_min']), str(row['obs_id']), url))
            candidates.sort()
            if not candidates:
                print(f'{target} D{detector}: no SIA candidates', flush=True)
                outcome = 1
                continue
            indices = sorted({round(i*(len(candidates)-1)/2) for i in range(3)})
            selected = [candidates[i] for i in indices]
            outdir = folder / 'irsa-download-lists'
            outdir.mkdir(exist_ok=True)
            selection = outdir / f'sia-selected-d{detector}.txt'
            urls = []
            for _, _, url in selected:
                path = urlsplit(url).path.removeprefix('/ibe/data/')
                urls.append('https://irsa.ipac.caltech.edu/ibe/cutout?' + urlencode({
                    'ra': str(pos.ra.deg), 'dec': str(pos.dec.deg), 'size': '0.1', 'path': path
                }, safe='/'))
            if selection.exists():
                if selection.read_text(encoding='utf8').splitlines() != urls:
                    raise ValueError(f'Existing selection differs; refusing to overwrite: {selection}')
            else:
                selection.write_text('\n'.join(urls)+'\n', encoding='utf8')
            print(f'{target} D{detector}: {len(candidates)} candidates; selected {[x[1] for x in selected]}', flush=True)
            proc = subprocess.run([sys.executable, str(ROOT/'scripts/download_selected_spherex.py'),
                                   '--target', target, '--url-list', str(selection), '--retry-seconds', '180'], cwd=ROOT)
            if proc.returncode:
                outcome = 1
    return outcome


if __name__ == '__main__':
    raise SystemExit(main())
