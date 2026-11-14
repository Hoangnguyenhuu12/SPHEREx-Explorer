"""Real mode never substitutes old demo data when the new dataset is missing."""
from app.main import app
from app.services import fixtures
from fastapi.testclient import TestClient


def test_real_mode_missing_data_never_uses_samples(monkeypatch, tmp_path):
    monkeypatch.setenv('DATA_MODE', 'real')
    monkeypatch.setenv('DATA_DIR', str(tmp_path))
    def forbidden(*args, **kwargs):
        raise AssertionError('demo data was used')
    monkeypatch.setattr(fixtures, 'sample_frames', forbidden)
    client = TestClient(app, raise_server_exceptions=False)
    health = client.get('/api/health')
    assert health.status_code == 200 and health.json()['mode'] == 'local'
    result = client.get('/api/frames', params={'ra': 269.446, 'dec': 4.768, 'target_key': 'barnard', 'detector': 6})
    assert result.status_code == 404 and result.json()['error']['code'] == 'NO_FRAMES'
    science = client.get('/api/photometry', params={'ra': 269.446, 'dec': 4.768, 'target_key': 'barnard'})
    assert science.status_code == 503
