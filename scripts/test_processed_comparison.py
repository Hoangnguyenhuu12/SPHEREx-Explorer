"""Check the saved diagnostic products when local science data are available."""
import json
from pathlib import Path

import numpy as np
import pytest
from astropy.io import fits
from astropy.wcs import WCS
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]


def test_current_irsa_flag_definitions_mask_bad_pixels():
    import sys
    sys.path.insert(0, str(ROOT))
    from shared.image_processing import mask_flags
    header = {'MSKN0001': 'SOURCE', 'MSKM0001': 2,
              'MSKN0002': 'OVERFLOW', 'MSKM0002': 4}
    result = mask_flags(np.ones(3), np.array([0, 2, 4]), header)
    assert np.isfinite(result[:2]).all() and np.isnan(result[2])
    del header['MSKM0002']
    with pytest.raises(ValueError, match='Missing flag mask'):
        mask_flags(np.ones(3), np.zeros(3, dtype=int), header)


@pytest.mark.parametrize('folder', sorted({p.parent for pattern in ('*_comparison/report.json', '*_pairs/*/report.json') for p in (ROOT/'data/processed').glob(pattern)}))
def test_processed_pair_integrity(folder):
    if not (folder/'report.json').is_file():pytest.skip('Local processed DR1 products are not present')
    report=json.loads((folder/'report.json').read_text(encoding='utf8'))
    assert report['status']=='preliminary_engineering_diagnostic'
    assert len(report['inputs'])==2 and report['common_coverage_fraction']>=.5
    with fits.open(folder/'aligned_diagnostic.fits',checksum=True) as h:
        h.verify('exception')
        assert all('CHECKSUM' not in x.header or x.verify_checksum()==1 for x in h)
        common=h['COMMON'].data.astype(bool);difference=h['DIFFERENCE'].data
        assert common.shape==tuple(report['grid_shape_yx'])
        assert np.isfinite(difference[common]).all() and np.isnan(difference[~common]).all()
        np.testing.assert_allclose(difference[common],h['EPOCH2'].data[common]-h['EPOCH1'].data[common],rtol=1e-5,atol=1e-6)
        assert WCS(h['EPOCH1'].header).has_celestial
    with Image.open(folder/'blink.gif') as img:assert img.n_frames==2
    with Image.open(folder/'comparison.png') as img:img.verify()
