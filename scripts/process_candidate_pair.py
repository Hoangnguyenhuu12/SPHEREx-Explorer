"""Build a diagnostic common-grid blink from a screened WISE 0855 D6 pair."""
import argparse
import hashlib
import json
import sys
from importlib import import_module

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from PIL import Image, ImageDraw
from reproject import reproject_interp

from download_spherex import ROOT, coordinate, save_json

sys.path.insert(0, str(ROOT))
imaging=import_module('members.huu-hoang.tan_pipeline')
def main(target,detector):
    out=ROOT/'data/processed'/f'{target}_d{detector}_comparison'
    screening=json.loads((ROOT/'data/reports/comparison_candidates.json').read_text(encoding='utf8'))
    pairs=[p for p in screening['targets'][target]['candidate_pairs'] if p['detector']==detector]
    if not pairs:raise ValueError('No pair passes the recorded preliminary screening')
    pair=max(pairs,key=lambda p:p['time_gap_days'])
    center=coordinate(target,Time(sum(pair['mjd'])/2,format='mjd',scale='utc'))
    grid,shape=imaging.tan_grid(float(center.ra.deg),float(center.dec.deg),0.08,scale=6.15)
    data=[];predicted=[];inputs=[];wave_maps=[];width_maps=[]
    for path_str,obs,expected,mjd in zip(pair['file_paths'],pair['observations'],pair['sha256'],pair['mjd'],strict=True):
        path=ROOT/path_str
        with path.open('rb') as h:digest=hashlib.file_digest(h,'sha256').hexdigest()
        if digest!=expected:raise ValueError('Input checksum mismatch '+obs)
        pos=coordinate(target,Time(mjd,format='mjd',scale='utc'))
        image,native,meta=imaging.load_cutout(path,float(pos.ra.deg),float(pos.dec.deg))
        if meta['obs_id']!=obs or meta['detector']!=detector or meta['bunit'].replace(' ','')!='MJy/sr':raise ValueError('Unexpected source identity or units')
        reproj,foot=reproject_interp((image,native),grid,shape_out=shape,order='bilinear')
        data.append(np.where((foot>0)&np.isfinite(reproj),reproj,np.nan))
        yy,xx=np.indices(shape)
        native_x,native_y=native.world_to_pixel(grid.pixel_to_world(xx,yy))
        with fits.open(path,memmap=False) as hdul:
            spectral=hdul['IMAGE'].header.copy()
            for key in list(spectral):
                if key.startswith(('A_','B_','AP_','BP_')):del spectral[key]
            wavelength,bandwidth=WCS(spectral,fobj=hdul,key='W').pixel_to_world_values(native_x,native_y)
            wave_maps.append(np.asarray(wavelength,dtype=float));width_maps.append(np.asarray(bandwidth,dtype=float))
        x,y=grid.world_to_pixel(pos);predicted.append([float(x),float(y)])
        inputs.append({'obs_id':obs,'mjd':mjd,'iso_utc':Time(mjd,format='mjd',scale='utc').isot,'file':path_str,'sha256':digest,'wavelength_um':meta['wave_um'],'bandwidth_um':meta['bandwidth_um'],'predicted_pixel_xy_origin_lower':predicted[-1]})
    geometric_common=np.isfinite(data[0]) & np.isfinite(data[1])
    spectral_ok=(np.isfinite(wave_maps[0]) & np.isfinite(wave_maps[1]) & np.isfinite(width_maps[0]) & np.isfinite(width_maps[1]) & (np.minimum(width_maps[0],width_maps[1])>0) & (np.abs(wave_maps[0]-wave_maps[1])<=.5*np.minimum(width_maps[0],width_maps[1])))
    common=geometric_common & spectral_ok;coverage=float(common.mean())
    if coverage<0.5:raise ValueError(f'Insufficient common valid coverage: {coverage:.3f}')
    difference=np.where(common,data[1]-data[0],np.nan)
    values=np.concatenate([d[common] for d in data]);lo,hi=np.percentile(values,[2,99.5]);diff_limit=float(np.percentile(np.abs(difference[common]),99)) or 1.0
    out.mkdir(parents=True,exist_ok=True)
    hdr=grid.to_header();hdr['BUNIT']='MJy/sr';hdr['COMMENT']='Diagnostic only; no PSF matching or source detection.'
    hdus=fits.HDUList([fits.PrimaryHDU(),fits.ImageHDU(data[0].astype('float32'),header=hdr,name='EPOCH1'),fits.ImageHDU(data[1].astype('float32'),header=hdr,name='EPOCH2'),fits.ImageHDU(common.astype('uint8'),header=grid.to_header(),name='COMMON'),fits.ImageHDU(spectral_ok.astype('uint8'),header=grid.to_header(),name='SPECTRAL_MATCH'),fits.ImageHDU(difference.astype('float32'),header=hdr,name='DIFFERENCE')])
    hdus.writeto(out/'aligned_diagnostic.fits',overwrite=True,checksum=True)
    fig,axes=plt.subplots(1,3,figsize=(12,4.4),layout='constrained')
    gray_cmap=plt.get_cmap('gray').copy();gray_cmap.set_bad('magenta')
    diff_cmap=plt.get_cmap('coolwarm').copy();diff_cmap.set_bad('magenta')
    for idx in range(2):
        im=axes[idx].imshow(np.ma.masked_invalid(np.where(common,data[idx],np.nan)),origin='lower',cmap=gray_cmap,vmin=lo,vmax=hi)
        axes[idx].scatter(*predicted[idx],marker='+',c='deepskyblue',s=120,linewidths=1.5)
        axes[idx].set_title(inputs[idx]['iso_utc'][:10]+' UTC\n'+f"{inputs[idx]['wavelength_um']:.4f} µm")
    axes[2].imshow(np.ma.masked_invalid(difference),origin='lower',cmap=diff_cmap,vmin=-diff_limit,vmax=diff_limit)
    axes[2].set_title('Epoch 2 − epoch 1\nDiagnostic only')
    for ax in axes:ax.set_xlabel('x (pixel)');ax.set_ylabel('y (pixel)')
    fig.suptitle(f'{target} D{detector} · DR1 · predicted position marked + · magenta = masked\nNot a confirmed detection; no PSF matching',fontsize=10)
    fig.colorbar(im,ax=axes[:2],label='MJy/sr')
    fig.savefig(out/'comparison.png',dpi=150);plt.close(fig)
    images=[]
    for idx,d in enumerate(data):
        scaled=np.where(common,np.clip((d-lo)/(hi-lo),0,1),0)
        pixels=np.uint8(np.nan_to_num(scaled,nan=0)*255)
        rgb=np.repeat(pixels[::-1,:,None],3,axis=2);rgb[~common[::-1]]=[255,0,255]
        img=Image.fromarray(rgb).resize((470,470),resample=Image.Resampling.NEAREST)
        draw=ImageDraw.Draw(img);draw.rectangle((0,0,470,28),fill='black');draw.text((6,6),inputs[idx]['iso_utc'][:10]+' UTC - diagnostic',fill='white')
        px=(predicted[idx][0]+.5)*470/shape[1];py=(shape[0]-.5-predicted[idx][1])*470/shape[0]
        draw.line((px-8,py,px+8,py),fill='cyan',width=2);draw.line((px,py-8,px,py+8),fill='cyan',width=2);images.append(img)
    images[0].save(out/'blink.gif',save_all=True,append_images=images[1:],duration=900,loop=0)
    report={'target':target,'detector':detector,'release':'dr1','status':'preliminary_engineering_diagnostic','screening_rules':screening['rules'],'inputs':inputs,'geometric_common_fraction':float(geometric_common.mean()),'common_coverage_fraction':coverage,'common_valid_pixels':int(common.sum()),'spectral_match_fraction_of_geometric_common':float(common.sum()/geometric_common.sum()) if geometric_common.any() else 0.0,'grid_shape_yx':list(shape),'pixel_scale_arcsec':6.15,'difference_definition':'epoch2 minus epoch1 in MJy/sr where both are finite and approximate per-pixel wavelengths meet the recorded screening threshold','warnings':['Wavelength and bandwidth are approximate; threshold is an engineering heuristic, not a response-function equivalence.','No independent source identification; markers are predicted positions.','No parallax or binary orbit in prediction.','No PSF matching, astrometric registration against background sources, background matching, or uncertainty propagation.','Do not interpret difference or blink as proof of motion or variability.'],'outputs':['aligned_diagnostic.fits','comparison.png','blink.gif']}
    save_json(out/'report.json',report)
    print(json.dumps({'saved_to':str(out),'common_coverage':coverage,'common_pixels':int(common.sum()),'grid':list(shape),'observations':pair['observations']},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target',choices=['wise0855','epsilon_indi_b','barnard','rw_aurigae','r_draconis'],default='wise0855')
    parser.add_argument('--detector',type=int,choices=range(1,7),default=6)
    args=parser.parse_args()
    main(args.target,args.detector)
