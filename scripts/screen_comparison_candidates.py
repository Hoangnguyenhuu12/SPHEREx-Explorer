"""Screen local DR1 image pairs; engineering triage, not scientific validation."""
import itertools
import json
import math
import sys
from pathlib import Path
from importlib import import_module

from astropy.io import fits
from build_fusion_quality_review import inspect
from download_spherex import ROOT, save_json

sys.path.insert(0,str(ROOT))
imaging=import_module('members.huu-hoang.tan_pipeline')
TARGETS=['barnard','wise0855','epsilon_indi_b','rw_aurigae','r_draconis']


def pair_metrics(a, b):
    """Apply the explicitly documented screening heuristic, not science approval."""
    if (a.get('release') != 'dr1' or b.get('release') != 'dr1' or
        a['detector'] != b['detector'] or not a['usable_for_candidate'] or not b['usable_for_candidate']):
        return None
    numeric = (a['mjd'], b['mjd'], a['wavelength_um'], b['wavelength_um'], a['bandwidth_um'], b['bandwidth_um'])
    if not all(math.isfinite(value) for value in numeric) or min(a['wavelength_um'], b['wavelength_um'], a['bandwidth_um'], b['bandwidth_um']) <= 0:
        return None
    gap = abs(a['mjd'] - b['mjd'])
    difference = abs(a['wavelength_um'] - b['wavelength_um'])
    tolerance = .5 * min(a['bandwidth_um'], b['bandwidth_um'])
    if gap < 30 or difference > tolerance:
        return None
    return gap, difference, tolerance


def screening(entry, target):
    if entry.get('release') != 'dr1':
        raise ValueError('Only explicit DR1 entries are accepted by this screen')
    path=Path(entry['file']);path=path if path.is_absolute() else ROOT/path
    r=inspect(path,target,'dr1',entry['sha256'])
    r['usable_for_candidate']=False
    r['reasons']=[]
    if not r.get('inside'):r['reasons'].append('predicted target outside cutout')
    if not r.get('target_pixel_finite'):r['reasons'].append('target pixel non-finite or unavailable')
    if r.get('inside'):
        with fits.open(path,memmap=False) as h:
            planes=imaging.flag_planes(h['FLAGS'].header)
            mask=sum(1<<bit for bit in {bit for name,bit in planes.items() if name not in {'MP_SOURCE','MP_FULLSAMPLE'}})
            flag=r['target_pixel_flags']
            r['bad_flags_at_target']=[name for name,bit in planes.items() if name not in {'MP_SOURCE','MP_FULLSAMPLE'} and flag&(1<<bit)]
            if flag&mask:r['reasons'].append('quality flag at predicted target pixel')
    if not all(math.isfinite(r.get(key, float('nan'))) and r.get(key, 0) > 0 for key in ('wavelength_um', 'bandwidth_um')):
        r['reasons'].append('spectral WCS missing or invalid')
    r['usable_for_candidate']=not r['reasons']
    return r


def main():
    result={'rules':{'release':'same DR1','detector':'same detector','time_gap_days_min':30,'spectral_rule':'abs(lambda1-lambda2) <= 0.5 * min(bandwidth1, bandwidth2), approximate spectral WCS at predicted target positions','quality':'finite target pixel and no quality flags except SOURCE/FULLSAMPLE','limitations':'Preliminary engineering screening only. Bandpass response, PSF, background, positional uncertainty, centroid/source detection, parallax, aperture and calibration require independent review.'},'targets':{}}
    for target in TARGETS:
        manifest=json.loads((ROOT/'data/spherex'/target/'manifest.json').read_text(encoding='utf8')); imgs=[]
        for entry in manifest['downloads']:
            try:imgs.append(screening(entry,target))
            except Exception as exc:imgs.append({'obs_id':entry['obs_id'],'detector':entry['detector'],'usable_for_candidate':False,'reasons':[type(exc).__name__+': '+str(exc)]})
        pairs=[]
        for a,b in itertools.combinations(imgs,2):
            metrics=pair_metrics(a,b)
            if metrics:
                gap,diff,tol=metrics
                pairs.append({'detector':a['detector'],'observations':[a['obs_id'],b['obs_id']],'file_paths':[a['file'],b['file']],'sha256':[a['sha256'],b['sha256']],'mjd':[a['mjd'],b['mjd']],'time_gap_days':gap,'wavelength_um':[a['wavelength_um'],b['wavelength_um']],'bandwidth_um':[a['bandwidth_um'],b['bandwidth_um']],'wavelength_delta_um':diff,'tolerance_um':tol})
        result['targets'][target]={'images':imgs,'candidate_pairs':pairs}
        print(target,'screened',len(imgs),'eligible',sum(i['usable_for_candidate'] for i in imgs),'pairs',len(pairs),'detectors',sorted({p['detector'] for p in pairs}),flush=True)
    path=ROOT/'data/reports/comparison_candidates.json';path.parent.mkdir(parents=True,exist_ok=True);save_json(path,result)

if __name__=='__main__':main()
