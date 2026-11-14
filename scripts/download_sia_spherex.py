"""Acquire three DR1 D6 cutouts per target using IRSA SIA and resumable downloads."""
import csv
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit

from astropy.table import Table
from astropy.time import Time
from download_spherex import OUT, ROOT, TARGETS, coordinate, save_json


def run(target):
    folder = OUT / target
    folder.mkdir(parents=True, exist_ok=True)
    cache = folder / 'sia-votable.xml'
    manifest_path = folder / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8')) if manifest_path.exists() else {'target': target, 'downloads': []}
    position = coordinate(target, Time('J2026'))
    query_url = 'https://irsa.ipac.caltech.edu/SIA?' + urlencode({'POS': f'CIRCLE {position.ra.deg} {position.dec.deg} 0.000277778', 'COLLECTION': 'spherex_dr1'})
    if not cache.exists():
        end = time.monotonic() + 180
        while True:
            part = cache.with_suffix('.xml.part')
            remaining = end - time.monotonic()
            if remaining <= 0:
                manifest.update(sia_status='error', sia_error=error)
                save_json(manifest_path, manifest)
                print(target, 'SIA query failed after 180 seconds:', error, flush=True)
                return False
            p = subprocess.run(['curl.exe', '-f', '-L', '-sS', '--max-time', str(max(1,int(min(30,remaining)))), '-o', str(part), query_url], capture_output=True, text=True)
            if p.returncode == 0:
                try:
                    data=part.read_bytes()
                    if b'value="OVERFLOW"' in data or b'value="ERROR"' in data:
                        raise ValueError('SIA response indicates overflow or error')
                    Table.read(part, format='votable', use_names_over_ids=True)
                    part.replace(cache)
                    break
                except Exception as exc:
                    error = f'{type(exc).__name__}: {exc}'
            else:
                error = p.stderr.strip()
            part.unlink(missing_ok=True)
            print(target, 'SIA retry:', error, flush=True)
            time.sleep(min(10, max(0,end-time.monotonic())))
    data = cache.read_bytes()
    if b'value="OVERFLOW"' in data or b'value="ERROR"' in data:
        raise ValueError('SIA cache indicates overflow or error')
    table = Table.read(cache, format='votable', use_names_over_ids=True)
    rows = []
    for r in table:
        url = str(r['access_url'])
        if str(r['obs_collection']).lower() != 'spherex_dr1' or not url.startswith('https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/'):
            continue
        band = str(r['energy_bandpassname'])
        rows.append({'obs_id': str(r['obs_id']), 'detector': band, 'mjd': float(r['t_min']), 'release': 'dr1', 'source_url': url, 'em_min_m': str(r['em_min']), 'em_max_m': str(r['em_max'])})
    rows.sort(key=lambda x: x['mjd'])
    counts = {f'D{i}': sum(r['detector'] == f'SPHEREx-D{i}' for r in rows) for i in range(1,7)}
    manifest.update(sia_status='success', sia_url=query_url, sia_counts_by_detector=counts,
                    sia_count_note='DR1 SIA candidates covering J2026 position within 1 arcsec; not confirmed detections; wavelength and usable coverage vary')
    save_json(manifest_path, manifest)
    with (folder/'observations.csv').open('w',newline='',encoding='utf8') as f:
        w=csv.DictWriter(f,fieldnames=['obs_id','detector','mjd','release','source_url','em_min_m','em_max_m']);w.writeheader();w.writerows(rows)
    print(target, 'candidate counts:', counts, flush=True)
    eligible=[r for r in rows if r['detector']=='SPHEREx-D6']
    if not eligible:
        print(target, 'no D6 candidate; moving on', flush=True)
        return False
    indices=sorted({round(i*(len(eligible)-1)/2) for i in range(3)}) if len(eligible)>1 else [0]
    selected=[eligible[i] for i in indices]
    lists=folder/'irsa-download-lists';lists.mkdir(exist_ok=True)
    file=lists/'sia-selected-d6.txt'
    content=[]
    for r in selected:
        path=urlsplit(r['source_url']).path.removeprefix('/ibe/data/')
        content.append('https://irsa.ipac.caltech.edu/ibe/cutout?' + urlencode({'ra':str(position.ra.deg),'dec':str(position.dec.deg),'size':'0.1','path':path},safe='/'))
    file.write_text('\n'.join(content)+'\n',encoding='utf8')
    print(target,'selected:', [r['obs_id'] for r in selected], flush=True)
    proc=subprocess.run([sys.executable,str(ROOT/'scripts/download_selected_spherex.py'),'--target',target,'--url-list',str(file),'--retry-seconds','180'],cwd=ROOT)
    return proc.returncode==0


if __name__ == '__main__':
    targets=sys.argv[1:] or ['wise0855','epsilon_indi_b','rw_aurigae','r_draconis']
    ok=True
    for name in targets:
        try:
            ok=run(name) and ok
        except Exception as exc:
            print(name, f'{type(exc).__name__}: {exc}', flush=True)
            ok=False
    raise SystemExit(0 if ok else 1)
