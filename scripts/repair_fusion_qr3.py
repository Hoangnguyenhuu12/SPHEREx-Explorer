"""Download small QR3 repair samples using epoch-specific coordinates and checkpoints."""
import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path
from urllib.parse import urlencode
from collections import Counter

from astropy.table import Table
from astropy.time import Time
from astropy.coordinates import SkyCoord
import astropy.units as u
from matplotlib.path import Path as PolygonPath
from download_spherex import ROOT, coordinate, save_json
from validate_fits import validate

BASE=ROOT/'data'/'fusion_repairs'/'qr3'
TARGETS={'barnard':[6], 'epsilon_indi_b':[6], 'wise0855':[1,6]}


def footprint_contains(region, position):
    """Check the small SIA footprint in the target's tangent frame."""
    parts=str(region).split()
    if len(parts)<8 or parts[0].upper()!='POLYGON' or parts[1].upper()!='ICRS' or (len(parts)-2)%2:
        raise ValueError(f'Unsupported SIA footprint: {region}')
    values=[float(value) for value in parts[2:]]
    vertices=SkyCoord(ra=values[0::2]*u.deg,dec=values[1::2]*u.deg,frame='icrs')
    offset=vertices.transform_to(position.skyoffset_frame())
    polygon=PolygonPath(list(zip(offset.lon.deg,offset.lat.deg)))
    return bool(polygon.contains_point((0.0,0.0)))


def download(url, path):
    end=time.monotonic()+180
    attempt=0
    error='not attempted'
    while time.monotonic()<end:
        attempt+=1
        tmp=path.with_suffix(path.suffix+'.part')
        remaining=end-time.monotonic()
        try:
            run=subprocess.run(['curl.exe','-f','-L','-sS','--max-time',str(max(1,int(min(30,remaining)))),'-o',str(tmp),url],capture_output=True,text=True,timeout=max(2,remaining))
            if run.returncode: raise RuntimeError(run.stderr.strip() or f'curl exit {run.returncode}')
            return tmp,attempt
        except (OSError,RuntimeError,subprocess.SubprocessError) as exc:
            error=f'{type(exc).__name__}: {exc}';tmp.unlink(missing_ok=True)
            print(f'attempt {attempt}: {error}',flush=True)
            remaining=end-time.monotonic()
            if remaining>0:time.sleep(min(10,remaining))
    raise TimeoutError(f'failed after 180s ({attempt} attempts): {error}')


def run(target,limit):
    folder=BASE/target;folder.mkdir(parents=True,exist_ok=True);(folder/'cutouts').mkdir(exist_ok=True)
    manifest_path=folder/'manifest.json'; report_path=folder/'report.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf8')) if manifest_path.exists() else {'target':target,'release':'qr3','downloads':[],'query_status':'pending'}
    report=json.loads(report_path.read_text(encoding='utf8')) if report_path.exists() else {'target':target,'files':{},'query_error':None}
    position=coordinate(target,Time('J2026'))
    query='https://irsa.ipac.caltech.edu/SIA?'+urlencode({'POS':f'CIRCLE {position.ra.deg} {position.dec.deg} 0.01','COLLECTION':'spherex_qr3'})
    cache=folder/'sia.xml'
    if not cache.exists():
        try:
            tmp,_=download(query,cache)
            data=tmp.read_bytes()
            if b'value="OVERFLOW"' in data or b'value="ERROR"' in data: raise ValueError('IRSA SIA response indicates overflow or error')
            Table.read(tmp,format='votable',use_names_over_ids=True)
            tmp.replace(cache)
        except Exception as exc:
            report['query_error']=f'{type(exc).__name__}: {exc}';manifest['query_status']='error';save_json(report_path,report);save_json(manifest_path,manifest);print(target,report['query_error'],flush=True);return False
    table=Table.read(cache,format='votable',use_names_over_ids=True)
    rows=[]
    overlapping=Counter()
    for r in table:
        url=str(r['access_url']);band=str(r['energy_bandpassname'])
        if str(r['obs_collection']).lower()!='spherex_qr3' or not url.startswith('https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/'):continue
        if band not in {f'SPHEREx-D{i}' for i in TARGETS[target]}:continue
        overlapping[band]+=1
        epoch_pos=coordinate(target,Time(float(r['t_min']),format='mjd',scale='utc'))
        if not footprint_contains(r['s_region'],epoch_pos):continue
        rows.append({'url':url,'detector':int(band[-1]),'obs_id':str(r['obs_id']),'mjd':float(r['t_min'])})
    rows.sort(key=lambda r:r['mjd'])
    manifest.update(query_status='ok',query_url=query,query_epoch='J2026',query_radius_deg=.01,selection='up to 3 time-spaced observations per requested detector; SIA polygon checked at each observation epoch and cutout WCS checked after download',overlapping_counts=dict(overlapping),counts=dict(Counter(str(r['detector']) for r in rows)))
    report['query_error']=None;save_json(manifest_path,manifest)
    print(target,'candidates',manifest['counts'],flush=True)
    success=True
    for detector in TARGETS[target]:
        options=[r for r in rows if r['detector']==detector]
        if not options:
            report['files'][f'D{detector}']={'status':'no_candidates'};save_json(report_path,report);success=False;continue
        indexes=sorted({round(i*(len(options)-1)/(min(limit,len(options))-1)) for i in range(min(limit,len(options)))}) if min(limit,len(options))>1 else [0]
        for index in indexes:
            row=options[index];key=row['obs_id']+'_D'+str(detector);dest=folder/'cutouts'/(key+'.fits')
            existing=next((r for r in manifest['downloads'] if r['obs_id']==row['obs_id'] and r['detector']==detector),None)
            if dest.exists():
                with dest.open('rb') as handle: digest=hashlib.file_digest(handle,'sha256').hexdigest()
                if existing and digest==existing.get('sha256'):
                    print(target,key,'already downloaded; skip',flush=True);continue
                report['files'][key]={'status':'error','error':'existing file differs or lacks provenance; preserved'};save_json(report_path,report);success=False;continue
            epoch=Time(row['mjd'],format='mjd',scale='utc');coord=coordinate(target,epoch)
            url=row['url']+'?'+urlencode({'center':f'{coord.ra.deg:.10f},{coord.dec.deg:.10f}','size':'0.1'},safe=',')
            try:
                tmp,attempts=download(url,dest)
                with __import__('astropy.io.fits',fromlist=['open']).open(tmp,memmap=False) as hdul:
                    actual_mjd=float(hdul['IMAGE'].header.get('MJD-BEG',row['mjd']))
                actual=coordinate(target,Time(actual_mjd,format='mjd',scale='utc'))
                valid=validate(tmp,float(actual.ra.deg),float(actual.dec.deg),detector,row['obs_id'])
                if not valid['valid']:raise ValueError('FITS check: '+str(valid['errors']))
                tmp.replace(dest);valid['path']=str(dest.relative_to(ROOT))
                with dest.open('rb') as handle:digest=hashlib.file_digest(handle,'sha256').hexdigest()
                record={'obs_id':row['obs_id'],'detector':detector,'release':'qr3','mjd':actual_mjd,'iso_utc':Time(actual_mjd,format='mjd',scale='utc').isot,'source_url':row['url'],'cutout_url':url,'search_mjd':row['mjd'],'target_ra_deg':float(actual.ra.deg),'target_dec_deg':float(actual.dec.deg),'file':str(dest.relative_to(ROOT)),'sha256':digest,'size_bytes':dest.stat().st_size,'validation':valid}
                manifest['downloads'].append(record);save_json(manifest_path,manifest)
                report['files'][key]={'status':'downloaded','attempts':attempts,'warnings':valid['warnings']};save_json(report_path,report)
                print(target,key,'saved','inside',valid.get('target_in_cutout'),'target_finite',valid.get('target_pixel_finite'),flush=True)
            except Exception as exc:
                if 'tmp' in locals() and tmp.exists(): tmp.unlink()
                report['files'][key]={'status':'error','error':f'{type(exc).__name__}: {exc}'};save_json(report_path,report);success=False;print(target,key,report['files'][key]['error'],flush=True)
    return success


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--target',choices=[*TARGETS,'all'],default='barnard');parser.add_argument('--limit',type=int,default=3,choices=[1,2,3]);args=parser.parse_args()
    targets=list(TARGETS) if args.target=='all' else [args.target]
    results=[run(target,args.limit) for target in targets]
    raise SystemExit(0 if all(results) else 1)
