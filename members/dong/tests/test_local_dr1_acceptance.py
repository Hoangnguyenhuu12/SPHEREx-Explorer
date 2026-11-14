"""Optional end-to-end checks of actual local DR1 data; never use demo fixtures."""
from pathlib import Path

import pytest
import requests
from app.main import app
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
CASES = [
    ('barnard', 'barnard', 269.446268, 4.768204),
    ('wise0855', 'wise0855', 133.759765, -7.242182),
    ('epsilon_indi_b', 'epsindib', 331.096669, -56.800649),
    ('rw_aurigae', 'rwaur', 76.956587, 30.401291),
    ('r_draconis', 'rdra', 248.167233, 66.755024),
]


@pytest.mark.parametrize('folder,key,ra,dec', CASES)
def test_local_dr1_real_frame_and_png(monkeypatch, folder, key, ra, dec):
    data_dir = ROOT / 'data'
    if not (data_dir / 'spherex' / folder / 'manifest.json').is_file():
        pytest.skip('Local DR1 dataset not installed; see README_DATA.md')
    monkeypatch.setenv('DATA_MODE', 'real')
    monkeypatch.setenv('DATA_RELEASE', 'dr1')
    monkeypatch.setenv('DATA_DIR', str(data_dir))
    def reject_external(*args, **kwargs):
        raise AssertionError('Local data verification must not use the network')
    monkeypatch.setattr(requests.sessions.Session, 'request', reject_external)
    client = TestClient(app, raise_server_exceptions=False)
    result = client.get('/api/frames', params={'target_key': key, 'ra': ra, 'dec': dec, 'detector': 6})
    assert result.status_code == 200, result.text
    payload = result.json()
    assert payload['frames'] and all(f['release'] == 'dr1' for f in payload['frames'])
    for frame in payload['frames']:
        for name in ('png', 'diff_png'):
            image = client.get(frame[name])
            assert image.status_code == 200 and image.headers['content-type'] == 'image/png'
