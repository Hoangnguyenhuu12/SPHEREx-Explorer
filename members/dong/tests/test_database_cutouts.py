"""Regression checks for database frame paths and detector selection."""
from types import SimpleNamespace

from members.dong.app.services import database_provider, live_cutouts


def test_database_cutouts_use_downloaded_frame_path(tmp_path, monkeypatch):
    folder = tmp_path / 'spherex' / 'wise0855'
    folder.mkdir(parents=True)
    path = folder / 'observation.fits'
    path.write_bytes(b'local FITS placeholder')
    monkeypatch.setenv('DATA_DIR', str(tmp_path))
    monkeypatch.setattr(database_provider, 'products_for_target', lambda _target: [
        {'band': 'SPHEREx-D6', 'obs_id': 'o1', 'mjd_start': 60000, 'collection': 'spherex_dr1',
         'local_file': 'data/spherex/wise0855/observation.fits', 'metadata': {}},
        {'band': 'SPHEREx-D1', 'obs_id': 'o2', 'mjd_start': 60001, 'collection': 'spherex_dr1',
         'local_file': 'data/spherex/wise0855/observation.fits', 'metadata': {}},
    ])
    rows = live_cutouts.load_database_cutouts(SimpleNamespace(target_key='wise0855', detector=6, max_frames=5))
    assert len(rows) == 1
    assert rows[0].path == path.resolve()
    assert rows[0].obs_id == 'o1'
