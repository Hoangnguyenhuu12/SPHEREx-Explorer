"""Report pre-processing readiness without claiming a scientific detection."""
import json
import warnings
from collections import Counter

import numpy as np
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS
from photutils.detection import DAOStarFinder

from download_spherex import ROOT, save_json


def detect_peaks(image, common, target_xy):
    yy,xx=np.indices(image.shape)
    excluded=(~common) | (~np.isfinite(image)) | (np.hypot(xx-target_xy[0],yy-target_xy[1])<5)
    excluded |= (xx<3)|(yy<3)|(xx>=image.shape[1]-3)|(yy>=image.shape[0]-3)
    _,median,std=sigma_clipped_stats(image,mask=excluded,sigma=3)
    if not np.isfinite(std) or std<=0:return []
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        stars=DAOStarFinder(fwhm=2.0,threshold=5*std)(image-median,mask=excluded)
    if stars is None:return []
    return [(float(s['x_centroid']),float(s['y_centroid'])) for s in stars if np.isfinite(s['x_centroid']) and np.isfinite(s['y_centroid'])]


def audit_processed(target, detector=6):
    folder=ROOT/'data/processed'/f'{target}_d{detector}_comparison'
    meta=json.loads((folder/'report.json').read_text(encoding='utf8'))
    with fits.open(folder/'aligned_diagnostic.fits',memmap=False,checksum=True) as h:
        h.verify('exception')
        if not all('CHECKSUM' not in x.header or x.verify_checksum()==1 for x in h):raise ValueError('output FITS checksum mismatch')
        a=np.asarray(h['EPOCH1'].data,dtype=float);b=np.asarray(h['EPOCH2'].data,dtype=float);common=h['COMMON'].data.astype(bool)
        w=WCS(h['EPOCH1'].header).celestial
        sample_x=np.array([3.,a.shape[1]/2.,a.shape[1]-4.]);sample_y=np.array([3.,a.shape[0]/2.,a.shape[0]-4.])
        ra,dec=w.pixel_to_world_values(sample_x,sample_y);rx,ry=w.world_to_pixel_values(ra,dec)
        roundtrip=float(np.max(np.hypot(rx-sample_x,ry-sample_y)))
        first=detect_peaks(a,common,meta['inputs'][0]['predicted_pixel_xy_origin_lower'])
        second=detect_peaks(b,common,meta['inputs'][1]['predicted_pixel_xy_origin_lower'])
        distances=sorted((float(np.hypot(x1-x2,y1-y2)),i,j) for i,(x1,y1) in enumerate(first) for j,(x2,y2) in enumerate(second) if np.hypot(x1-x2,y1-y2)<=1.5)
        used_a=set();used_b=set();matches=[]
        for dist,i,j in distances:
            if i in used_a or j in used_b:continue
            used_a.add(i);used_b.add(j);matches.append({'epoch1_xy':list(first[i]),'epoch2_xy':list(second[j]),'distance_pixels':dist})
    return {'fits_integrity':'passed','wcs_roundtrip_max_pixels':roundtrip,'common_coverage_fraction':meta['common_coverage_fraction'],'spectral_match_fraction_of_common':meta['spectral_match_fraction_of_geometric_common'],'background_peaks_epoch1':len(first),'background_peaks_epoch2':len(second),'matched_background_candidates':matches,'independent_alignment_verified':False,'reason':'Fewer than three matched candidates' if len(matches)<3 else 'Candidate matches not identified or reviewed against an independent catalog', 'visual_preprocessing_ready':True,'science_interpretation_ready':False,'limitations':['Peak matching is a diagnostic heuristic; not source identity.','No Gaia cross-match, confirmed source centroid, PSF matching, background matching, parallax or uncertainty propagation.']}


def main():
    screen=json.loads((ROOT/'data/reports/comparison_candidates.json').read_text(encoding='utf8'))
    report={'status':'partial','scope':'preliminary technical preflight only','targets':{},'criteria':screen['rules']}
    for target,entry in screen['targets'].items():
        counts=Counter(reason for image in entry['images'] for reason in image.get('reasons',[]))
        pairs=entry['candidate_pairs']
        result={'images_screened':len(entry['images']),'eligible_images':sum(image['usable_for_candidate'] for image in entry['images']),'candidate_pair_count':len(pairs),'reasons':dict(counts),'ready_for_visual_preprocessing':bool(pairs),'ready_for_scientific_interpretation':False}
        if target in ('wise0855','epsilon_indi_b'):
            result['diagnostic']=audit_processed(target)
        else:
            result['next_step']='Review target flags and position; select additional observations or a method approved by the science owner. Do not fabricate pixels or relax criteria solely to produce a pair.'
        report['targets'][target]=result
        print(target,'images',result['images_screened'],'pairs',len(pairs),'visual',result['ready_for_visual_preprocessing'], 'background_matches',len(result.get('diagnostic',{}).get('matched_background_candidates',[])),flush=True)
    extra=ROOT/'data/processed/wise0855_d3_comparison/report.json'
    if extra.is_file():
        report['extra_diagnostics']={'wise0855_d3':audit_processed('wise0855',3)}
        print('wise0855 D3 background_matches',len(report['extra_diagnostics']['wise0855_d3']['matched_background_candidates']),flush=True)
    out=ROOT/'data/reports/comparison_readiness.json';save_json(out,report)
    print('Saved',out)

if __name__=='__main__':main()
