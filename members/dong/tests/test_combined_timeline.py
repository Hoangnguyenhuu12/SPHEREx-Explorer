import json

from fastapi.testclient import TestClient
from PIL import Image

from members.dong.app.main import app
from members.dong.app.services import fixtures


def test_combined_timeline_serves_sorted_prebuilt_images(monkeypatch, tmp_path):
    monkeypatch.setenv('WISE0855_SEQUENCE_DIR', str(tmp_path))

    def unexpected_cutout_request(*args):
        raise AssertionError('The combined timeline must never render FITS on request')

    monkeypatch.setattr(fixtures, 'archive_cutouts', unexpected_cutout_request)
    monkeypatch.setenv('DATA_MODE', 'live')
    assets = tmp_path / 'player'
    assets.mkdir()
    rows = []
    for index, mission, band, mjd in [(1, 'unWISE', 'W2', 55320), (2, 'SPHEREx', 'D6', 60800)]:
        name = f'frame_{index:03d}_{mission.lower()}.png'
        Image.new('L', (3, 3), index).save(assets / name)
        rows.append(dict(mission=mission, release='verified', source_product_id=str(index),
                         band_or_detector=band, observed_mjd=mjd, observed_utc='2010-05-04T00:00:00Z',
                         wavelength_um=4.6, quality_label='screened', predicted_x_px=1, predicted_y_png_px=1,
                         png=f'ignored/directory/{name}'))
    (tmp_path / 'sequence_manifest.json').write_text(json.dumps({
        'sequence_id': 'wise0855:unwise_w2_to_spherex_d6',
        'target_key': 'wise0855',
        'grid_wcs': dict(width=3, height=3, pixel_scale_arcsec=2.75, CRVAL1=133.8, CRVAL2=-7.2),
        'frames': rows[::-1],
    }))
    params = dict(ra=133.8, dec=-7.2, target_key='wise0855', timeline='combined')
    with TestClient(app) as client:
        result = client.get('/api/frames', params=params)
        assert result.status_code == 200
        payload = result.json()
        assert payload['api_version'] == '0.1'
        first, last = payload['frames']
        assert (first['mission'], last['mission']) == ('unWISE', 'SPHEREx')
        assert first['diff_png'] is None
        assert client.get(first['png']).content == (assets / 'frame_001_unwise.png').read_bytes()
        limited = client.get('/api/frames', params={**params, 'max_frames': 1}).json()
        assert limited['frames'] == [first]
        assert 'TRUNCATED' in limited['warnings']
        assert client.get('/api/frames', params={**params, 'detector': 5}).status_code == 400
        (assets / 'frame_001_unwise.png').unlink()
        assert client.get('/api/frames', params=params).status_code == 503
        assert client.get(first['png']).json()['error']['code'] == 'TIMELINE_UNAVAILABLE'
        fits_file = tmp_path / 'aligned_sequence.fits'
        assert client.get('/api/frames/combined/wise0855/aligned_sequence.fits').status_code == 404
        fits_file.write_bytes(b'SIMPLE  = T')
        fits_res = client.get('/api/frames/combined/wise0855/aligned_sequence.fits')
        assert fits_res.status_code == 200
        assert fits_res.content == b'SIMPLE  = T'
