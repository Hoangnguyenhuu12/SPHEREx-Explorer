"""The local API must not silently mix releases or use uncovered cutouts."""
import json
from pathlib import Path
from app.api_models import FramesQuery
from app.services import observed_frames


def test_local_release_selection_and_coverage(monkeypatch, tmp_path):
    monkeypatch.setattr(observed_frames, 'ROOT', tmp_path)
    monkeypatch.setenv('DATA_MODE', 'real')
    monkeypatch.setenv('DATA_DIR', str(tmp_path / 'data'))
    folders={'dr1':tmp_path/'data/spherex/barnard', 'qr3':tmp_path/'data/fusion_repairs/qr3/barnard'}
    for release,folder in folders.items():
        (folder/'cutouts').mkdir(parents=True)
        records=[]
        for name,inside in [('covered',True),('outside',False)]:
            path=folder/'cutouts'/f'{name}.fits';path.write_bytes(b'FITS-test-placeholder')
            records.append({'release':release,'detector':6,'obs_id':name,'mjd':60000,'file':str(path),'sha256':'recorded-sha','validation':{'valid':True,'target_in_cutout':inside}})
        (folder/'manifest.json').write_text(json.dumps({'downloads':records}),encoding='utf8')
    query=FramesQuery(ra=269,dec=4,target_key='barnard',detector=6)
    for release in ('dr1','qr3'):
        monkeypatch.setenv('DATA_RELEASE',release)
        result=observed_frames.matching_cutouts(query)
        assert len(result)==1 and result[0].obs_id=='covered'
        assert result[0].release==release and result[0].path.is_relative_to(folders[release])
