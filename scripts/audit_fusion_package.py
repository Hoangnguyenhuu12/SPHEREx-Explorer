"""Audit an externally supplied SPHEREx/WISE package without changing it."""
import argparse
import hashlib
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path, PurePosixPath

import numpy as np
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from download_spherex import coordinate

KEYS = {'barnard':'barnard','wise0855':'wise0855','epsindib':'epsilon_indi_b','rwaur':'rw_aurigae','rdra':'r_draconis'}

def audit(package):
    package=package.resolve()
    db=package/'data/spherex_sia2.db'
    connection=sqlite3.connect(db.as_uri()+'?mode=ro',uri=True)
    connection.row_factory=sqlite3.Row
    observations=connection.execute('select * from observations').fetchall()
    result={'source':str(package),'observations':[],'summary':{},'errors':[]}
    for row in observations:
        d=dict(row); relative=PurePosixPath(str(d['fits_path']).replace('\\','/'))
        candidate=(package/Path(*relative.parts)).resolve()
        record={'target':d['target_key'],'mission':d['mission'],'release':d['release'],'detector':d['detector'],'obs_id':d['obs_id'],'file':str(relative),'errors':[]}
        try:
            if not candidate.is_relative_to(package/'data/harvest') or not candidate.is_file():
                raise ValueError('missing file or path outside harvest')
            with candidate.open('rb') as f: digest=hashlib.file_digest(f,'sha256').hexdigest()
            record['sha256_ok']=bool(d['sha256']) and digest.lower()==str(d['sha256']).lower()
            if not record['sha256_ok']: record['errors'].append('missing or mismatched SHA256')
            with fits.open(candidate,memmap=False) as hdus:
                hdus.verify('exception')
                if d['mission']=='SPHEREx':
                    for name in ['IMAGE','FLAGS','VARIANCE','ZODI','WCS-WAVE']:
                        if name not in hdus: record['errors'].append('missing '+name)
                    if 'PSF' not in hdus and 'EPSF' not in hdus: record['errors'].append('missing PSF/EPSF')
                    image=hdus['IMAGE'].data; header=hdus['IMAGE'].header
                    record['shape']=list(image.shape)
                    if str(header.get('OBSID'))!=d['obs_id'] or str(header.get('DETECTOR'))!=str(d['detector']).removeprefix('D'):
                        record['errors'].append('FITS identity mismatch')
                    if 'FLAGS' in hdus and hdus['FLAGS'].data.shape!=image.shape:
                        record['errors'].append('IMAGE/FLAGS shape mismatch')
                    record['finite_fraction']=float(np.isfinite(image).mean())
                    mjd=float(header.get('MJD-BEG',d['mjd']))
                    predicted=coordinate(KEYS[d['target_key']],Time(mjd,format='mjd',scale='utc'))
                    x,y=WCS(header).celestial.world_to_pixel(predicted); x,y=float(x),float(y)
                    inside=np.isfinite(x) and np.isfinite(y) and -0.5<=x<image.shape[1]-.5 and -.5<=y<image.shape[0]-.5
                    record['predicted_pixel_xy']=[x,y] if np.isfinite(x) and np.isfinite(y) else None
                    record['predicted_position_inside']=bool(inside)
                    if inside:
                        ix,iy=int(np.floor(x+.5)),int(np.floor(y+.5));record['target_pixel_finite']=bool(np.isfinite(image[iy,ix]))
                else:
                    record['primary_shape']=list(hdus[0].data.shape) if hdus[0].data is not None else None
        except Exception as e:
            record['errors'].append(type(e).__name__+': '+str(e))
        result['observations'].append(record)
    for target in KEYS:
        rows=[r for r in result['observations'] if r['target']==target]
        sp=[r for r in rows if r['mission']=='SPHEREx']
        result['summary'][target]={'spherex_files':len(sp),'wise_files':sum(r['mission']=='WISE' for r in rows),
             'detectors':dict(Counter(r['detector'] for r in sp)), 'release':dict(Counter(r['release'] for r in sp)),
             'outside_predicted_position':sum(r.get('predicted_position_inside') is False for r in sp),
             'inside_predicted_position':sum(r.get('predicted_position_inside') is True for r in sp),
             'inside_with_finite_target_pixel':sum(r.get('predicted_position_inside') is True and r.get('target_pixel_finite') is True for r in sp),
             'file_errors':sum(bool(r['errors']) for r in rows)}
        manifest=package/'data/harvest'/target/'manifest.json'
        if manifest.is_file():
            m=json.loads(manifest.read_text(encoding='utf8'));result['summary'][target]['harvest_manifest_entries']=len(m.get('entries',[]))
        sed=package/'data/fusion_products'/target/(target+'_sed.json')
        if sed.is_file():
            items=json.loads(sed.read_text(encoding='utf8'));result['summary'][target]['sed_bands']=[x.get('detector') for x in items]
    connection.close()
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    report=audit(args.package)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n',encoding='utf8')
    print(json.dumps(report['summary'],indent=2))
