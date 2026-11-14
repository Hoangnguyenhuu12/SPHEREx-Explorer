"""Inspect imported QR3 target pixels without merging them into the DR1 sequence."""
import sqlite3
import sys
from collections import Counter
from importlib import import_module
from pathlib import Path

from astropy.io import fits
from build_fusion_quality_review import inspect
from download_spherex import ROOT, save_json

sys.path.insert(0,str(ROOT))
imaging=import_module('members.huu-hoang.tan_pipeline')
PACKAGE=ROOT/'data/imports/full_harvest_fusion'


def main():
    db=sqlite3.connect((PACKAGE/'data/spherex_sia2.db').resolve().as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
    report={'release':'qr3','method':'predicted-position pixel flags; source identity not confirmed; no DR1 mixing','targets':{}}
    for target,key in [('rw_aurigae','rwaur'),('r_draconis','rdra')]:
        rows=db.execute('select * from observations where target_key=? and mission=?',(key,'SPHEREx')).fetchall();records=[]
        for row in rows:
            d=dict(row);p=(PACKAGE/Path(d['fits_path'].replace('\\','/'))).resolve()
            if not p.is_relative_to((PACKAGE/'data/harvest').resolve()):raise ValueError('Path escapes package')
            r=inspect(p,target,'qr3',d['sha256']);r['eligible']=False;r['reasons']=[]
            if not r.get('inside'):r['reasons'].append('predicted position outside')
            if not r.get('target_pixel_finite'):r['reasons'].append('target pixel non-finite or unavailable')
            if r.get('inside'):
                with fits.open(p,memmap=False) as h:planes=imaging.flag_planes(h['FLAGS'].header)
                bits=[name for name,bit in planes.items() if name not in {'MP_SOURCE','MP_FULLSAMPLE'} and r['target_pixel_flags']&(1<<bit)]
                r['bad_flags_at_target']=bits
                if bits:r['reasons'].append('quality flag at predicted target pixel')
            r['eligible']=not r['reasons'] and bool(r.get('wavelength_um')) and bool(r.get('bandwidth_um'))
            records.append(r)
        report['targets'][target]={'count':len(records),'eligible_count':sum(x['eligible'] for x in records),'reason_counts':dict(Counter(reason for x in records for reason in x['reasons'])),'observations':records}
        print(target,'QR3',len(records),'eligible',sum(x['eligible'] for x in records),flush=True)
    db.close();save_json(ROOT/'data/reports/imported_qr3_readiness.json',report)

if __name__=='__main__':main()
