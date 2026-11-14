"""Try a bounded set of alternative DR1 Barnard frames without reusing failures."""
import json
import subprocess
import sys
from urllib.parse import urlencode, urlsplit
from astropy.table import Table
from astropy.time import Time
from download_spherex import OUT, ROOT, coordinate

folder=OUT/'barnard'
table=Table.read(folder/'sia-votable.xml',format='votable',use_names_over_ids=True)
pos=coordinate('barnard',Time('J2026'))
for detector in range(1,5):
    manifest=json.loads((folder/'manifest.json').read_text(encoding='utf8'))
    good=sum(d['detector']==detector for d in manifest['downloads'])
    if good>=3: continue
    report=json.loads((folder/'selection_report.json').read_text(encoding='utf8'))
    tried=set(report.get('files',{}))
    rows=[]
    for row in table:
        url=str(row['access_url']); obs=str(row['obs_id']); key=f'{obs}_D{detector}'
        if (str(row['obs_collection']).lower()=='spherex_dr1'
            and str(row['energy_bandpassname'])==f'SPHEREx-D{detector}'
            and url.startswith('https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/')
            and key not in tried):
            rows.append((float(row['t_min']),obs,url))
    rows.sort()
    if not rows: print(f'D{detector}: no untried candidates',flush=True);continue
    indexes=sorted({round(i*(len(rows)-1)/2) for i in range(3)})
    for idx in indexes:
        if good>=3: break
        _,obs,url=rows[idx]; path=urlsplit(url).path.removeprefix('/ibe/data/')
        entry='https://irsa.ipac.caltech.edu/ibe/cutout?'+urlencode({'ra':str(pos.ra.deg),'dec':str(pos.dec.deg),'size':'0.1','path':path},safe='/')
        file=folder/'irsa-download-lists'/f'sia-alternative-d{detector}-{obs}.txt'
        if file.exists() and file.read_text(encoding='utf8').strip()!=entry: raise ValueError(f'Existing list differs: {file}')
        if not file.exists(): file.write_text(entry+'\n',encoding='utf8')
        print(f'barnard D{detector}: alternative {obs}',flush=True)
        subprocess.run([sys.executable,str(ROOT/'scripts/download_selected_spherex.py'),'--target','barnard','--url-list',str(file),'--retry-seconds','180'],cwd=ROOT)
        manifest=json.loads((folder/'manifest.json').read_text(encoding='utf8'))
        good=sum(d['detector']==detector for d in manifest['downloads'])
    print(f'barnard D{detector}: {good}/3 validated; alternatives exhausted or target reached',flush=True)
