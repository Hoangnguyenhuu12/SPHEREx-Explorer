"""Create transparent QA records, not scientific photometry or detections."""
import hashlib
import json
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from download_spherex import ROOT, coordinate, save_json

BASE=ROOT/'data/fusion_repairs'
PACKAGE=ROOT/'data/imports/full_harvest_fusion'
FLAG_BITS={1:'OVERFLOW',2:'SUR_ERROR',21:'SOURCE',26:'BLOOM'}


def inspect(path,target,release,expected_sha=None):
    with path.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
    if expected_sha and digest!=expected_sha: raise ValueError(f'SHA256 mismatch: {path}')
    with fits.open(path,memmap=False) as h:
        header=h['IMAGE'].header;image=h['IMAGE'].data;flags=h['FLAGS'].data
        mjd=float(header['MJD-BEG']);pos=coordinate(target,Time(mjd,format='mjd',scale='utc'))
        x,y=WCS(header,fobj=h).celestial.world_to_pixel(pos);x,y=float(x),float(y)
        inside=bool(np.isfinite(x) and np.isfinite(y) and -.5<=x<image.shape[1]-.5 and -.5<=y<image.shape[0]-.5)
        result={'file':str(path.relative_to(ROOT)),'sha256':digest,'release':release,'obs_id':header['OBSID'],'detector':int(header['DETECTOR']),'mjd':mjd,'iso_utc':Time(mjd,format='mjd',scale='utc').isot,'target_ra_deg':float(pos.ra.deg),'target_dec_deg':float(pos.dec.deg),'inside':inside,'predicted_pixel_xy':[x,y] if np.isfinite(x) and np.isfinite(y) else None,'bunit':header.get('BUNIT')}
        if inside:
            ix,iy=int(np.floor(x+.5)),int(np.floor(y+.5));value=float(image[iy,ix]);flag=int(flags[iy,ix]);area=image[max(0,iy-5):min(image.shape[0],iy+6),max(0,ix-5):min(image.shape[1],ix+6)]
            result.update(target_pixel_value=value if np.isfinite(value) else None,target_pixel_finite=bool(np.isfinite(value)),target_pixel_flags=flag,known_flag_names=[name for bit,name in FLAG_BITS.items() if flag&(1<<bit)],finite_pixels_11x11=int(np.isfinite(area).sum()),pixels_11x11=int(area.size))
            spectral=header.copy()
            for k in list(spectral):
                if k.startswith(('A_','B_','AP_','BP_')):del spectral[k]
            try:
                wave,width=WCS(spectral,fobj=h,key='W').pixel_to_world_values(x,y)
                if np.isfinite(wave) and np.isfinite(width):result.update(wavelength_um=float(wave),bandwidth_um=float(width))
            except Exception as exc: result['spectral_wcs_error']=f'{type(exc).__name__}: {exc}'
        return result


def main():
    BASE.mkdir(parents=True,exist_ok=True)
    rd=[]
    data=json.loads((ROOT/'data/spherex/r_draconis/manifest.json').read_text(encoding='utf8'))
    for d in data['downloads']:
        path=Path(d['file']);path=path if path.is_absolute() else ROOT/path
        rd.append(inspect(path,'r_draconis','dr1',d.get('sha256')))
    audit=json.loads((PACKAGE/'audit.json').read_text(encoding='utf8'))
    for d in audit['observations']:
        if d['target']=='rdra' and d['mission']=='SPHEREx':
            rd.append(inspect(PACKAGE/d['file'],'r_draconis','qr3'))
    save_json(BASE/'r_draconis_quality.json',{'target':'r_draconis','flag_source':'https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html','warning':'Predicted-position pixel status is not source identification; do not fill missing pixels or treat nearby signal as a measurement.','observations':rd})
    wise=[]
    for path in [ROOT/'data/spherex/wise0855/manifest.json',BASE/'qr3/wise0855/manifest.json']:
        if not path.exists():continue
        data=json.loads(path.read_text(encoding='utf8'))
        for d in data.get('downloads',[]):
            if d['detector'] not in (1,6):continue
            f=Path(d['file']);f=f if f.is_absolute() else ROOT/f
            wise.append(inspect(f,'wise0855',d['release'],d.get('sha256')))
    save_json(BASE/'wise0855_pixel_samples.json',{'target':'wise0855','status':'diagnostic_only_not_sed','warning':'Raw individual predicted-position IMAGE pixels, not background-subtracted or PSF/aperture corrected source flux and not detection claims. Values of MJy/sr must not be labeled mJy.','observations':wise})
    products=[]
    for target in ('barnard','wise0855','epsindib','rwaur','rdra'):
        manifest_path=PACKAGE/'data/fusion_products'/target/'manifest.json'
        manifest=json.loads(manifest_path.read_text(encoding='utf8'))
        obs=[]
        for band in ('W1','W2'):
            f=PACKAGE/'data/harvest'/target/'wise'/f'{target}_wise_{band}.fits'
            if f.exists():
                hdr=fits.getheader(f);obs.append({'band':band,'file':str(f.relative_to(ROOT)),'bunit':hdr.get('BUNIT'),'dateobs1':hdr.get('DATEOBS1'),'dateobs2':hdr.get('DATEOBS2'),'magzp':hdr.get('MAGZP')})
        products.append({'target':target,'has_legacy_difference':bool(manifest.get('difference_image')),'legacy_claimed_epochs':(manifest.get('difference_image') or {}).get('epochs'),'status':'not_for_scientific_or_mvp_display_until_inputs_and_calibration_verified','reason':'Exact SPHEREx input and generation procedure are not identified by product manifest; AllWISE W1 and SPHEREx D6 differ in band/instrument and units. Do not label an observation 2025 or 2010 without tracing the source and its observation interval.','allwise_inputs':obs})
    save_json(BASE/'cross_mission_difference_review.json',{'source':'legacy fusion package','products':products})
    print('R Dra observations',len(rd),'NaN target pixels',sum(not r.get('target_pixel_finite',False) for r in rd),'WISE D1/D6 diagnostic samples',len(wise),'difference manifests reviewed',len(products))

if __name__=='__main__':main()
