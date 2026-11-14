"""Verify all five targets and six detectors through the local DR1 frame API."""
import json
import os
import sys
from io import BytesIO
from pathlib import Path

from astropy.time import Time
from fastapi.testclient import TestClient
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(ROOT/'members/dong'))
from download_spherex import coordinate

os.environ['DATA_MODE']='real'
os.environ['DATA_RELEASE']='dr1'
from app.main import app

TARGETS={'barnard':'barnard','wise0855':'wise0855','epsilon_indi_b':'epsindib','rw_aurigae':'rwaur','r_draconis':'rdra'}


def main():
    report={'release':'dr1','data_mode':'real','purpose':'technical API/rendering check, not a source detection or scientific validation','cases':[]}
    c=TestClient(app,raise_server_exceptions=False)
    for target,key in TARGETS.items():
        pos=coordinate(target,Time('J2026'))
        for detector in range(1,7):
            item={'target':target,'detector':detector,'errors':[],'warnings':[],'png_checked':0,'diff_checked':0}
            try:
                r=c.get('/api/frames',params={'target_key':key,'ra':float(pos.ra.deg),'dec':float(pos.dec.deg),'detector':detector});item['http_status']=r.status_code
                body=r.json()
                if r.status_code!=200:
                    item['errors'].append(body.get('error',{}));report['cases'].append(item);continue
                frames=body['frames'];item['frame_count']=len(frames);item['warnings']=body['warnings']
                if not frames:item['errors'].append('No rendered frames')
                for f in frames:
                    if f['release']!='dr1':item['errors'].append('Unexpected release: '+f['release'])
                    for key_name,count_name in [('png','png_checked'),('diff_png','diff_checked')]:
                        res=c.get(f[key_name])
                        if res.status_code!=200 or res.headers.get('content-type')!='image/png':item['errors'].append(f'{key_name} returned {res.status_code}');continue
                        with Image.open(BytesIO(res.content)) as img:
                            if img.size!=(body['grid']['width'],body['grid']['height']):item['errors'].append('PNG dimensions differ from grid')
                            img.verify()
                        item[count_name]+=1
            except Exception as exc:  # noqa: BLE001 - report every failed detector without stopping the audit
                item['errors'].append(type(exc).__name__+': '+str(exc))
            report['cases'].append(item)
            print(target,'D'+str(detector),item.get('http_status'),item.get('frame_count',0),','.join(item['warnings']), 'errors',len(item['errors']),flush=True)
    report['summary']={'case_count':len(report['cases']),'passed':sum(not case['errors'] for case in report['cases']),'failed':sum(bool(case['errors']) for case in report['cases']),'frames':sum(case.get('frame_count',0) for case in report['cases']),'png_checked':sum(case['png_checked'] for case in report['cases']),'diff_checked':sum(case['diff_checked'] for case in report['cases'])}
    out=ROOT/'data/reports/image_pipeline_qa.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf8'); print('Summary:',report['summary']);return 1 if report['summary']['failed'] else 0

if __name__=='__main__':raise SystemExit(main())
