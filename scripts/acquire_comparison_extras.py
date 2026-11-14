"""Acquire at most three untried DR1 D6 images per target for pair screening."""
import argparse
import json
import subprocess
import sys
from urllib.parse import urlencode, urlsplit
from astropy.table import Table
from astropy.time import Time
from download_spherex import ROOT, coordinate
from repair_fusion_qr3 import footprint_contains


def main(detector, targets, batch=''):
    for target in targets:
        folder=ROOT/'data/spherex'/target
        suffix=f'-{batch}' if batch else ''
        selection=folder/f'irsa-download-lists/sia-comparison-extra-d{detector}{suffix}.txt'
        if not selection.exists():
            m=json.loads((folder/'manifest.json').read_text(encoding='utf8'))
            report_path=folder/'selection_report.json'
            report=json.loads(report_path.read_text(encoding='utf8')) if report_path.exists() else {'files':{}}
            tried=set(report['files']) | {x['obs_id']+'_D'+str(x['detector']) for x in m['downloads']}
            table=Table.read(folder/'sia-votable.xml',format='votable',use_names_over_ids=True)
            rows=[]
            for r in table:
                obs=str(r['obs_id']);url=str(r['access_url'])
                if str(r['obs_collection']).lower()!='spherex_dr1' or str(r['energy_bandpassname'])!=f'SPHEREx-D{detector}' or obs+f'_D{detector}' in tried:continue
                if not url.startswith('https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/'):continue
                mjd=float(r['t_min']);pos=coordinate(target,Time(mjd,format='mjd',scale='utc'))
                if not footprint_contains(r['s_region'],pos):continue
                rows.append((mjd,obs,url))
            rows.sort()
            indexes=sorted({round(i*(len(rows)-1)/(min(3,len(rows))-1)) for i in range(min(3,len(rows)))}) if len(rows)>1 else ([0] if rows else [])
            pos=coordinate(target,Time('J2026'))
            urls=[]
            for i in indexes:
                path=urlsplit(rows[i][2]).path.removeprefix('/ibe/data/')
                urls.append('https://irsa.ipac.caltech.edu/ibe/cutout?'+urlencode({'ra':str(pos.ra.deg),'dec':str(pos.dec.deg),'size':'0.1','path':path},safe='/'))
            selection.parent.mkdir(parents=True,exist_ok=True)
            selection.write_text('\n'.join(urls)+('\n' if urls else ''),encoding='utf8')
        if not selection.read_text(encoding='utf8').strip():
            print(target,f'no untried D{detector} candidate',flush=True);continue
        print(target,f'trying at most 3 previously untried D{detector} cutouts',flush=True)
        subprocess.run([sys.executable,str(ROOT/'scripts/download_selected_spherex.py'),'--target',target,'--url-list',str(selection),'--retry-seconds','180'],cwd=ROOT)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--detector',type=int,choices=range(1,7),default=6)
    parser.add_argument('--targets',nargs='+',choices=['epsilon_indi_b','rw_aurigae','barnard','r_draconis'],default=['epsilon_indi_b','rw_aurigae','barnard','r_draconis'])
    parser.add_argument('--batch',default='',help='Optional alphanumeric batch label; reuse it to resume the same selection')
    args=parser.parse_args()
    if args.batch and not args.batch.isalnum():parser.error('batch must be alphanumeric')
    main(args.detector,args.targets,args.batch)
