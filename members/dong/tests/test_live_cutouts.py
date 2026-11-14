from app.api_models import FramesQuery
from app.services import live_cutouts


def test_live_cutouts_keep_completed_visit_when_another_times_out(monkeypatch, tmp_path):
    rows = [
        {
            "access_url": f"https://irsa.ipac.caltech.edu/{obs_id}.fits",
            "obs_id": obs_id,
            "energy_bandpassname": "SPHEREx-D6",
            "t_min": mjd,
        }
        for obs_id, mjd in [("available", 61000), ("slow", 61100)]
    ]
    monkeypatch.setattr(live_cutouts.irsa, "find_images", lambda *args, **kwargs: rows)

    def download(url, ra, dec, size, path, **kwargs):
        if url.endswith("/slow.fits"):
            raise live_cutouts.irsa.UpstreamTimeout("deadline reached")
        path.write_bytes(b"test cutout")

    monkeypatch.setattr(live_cutouts.irsa, "download_cutout", download)
    cutouts = live_cutouts.load_cutouts(FramesQuery(ra=133, dec=-7, detector=6), tmp_path)
    assert [cutout.obs_id for cutout in cutouts] == ["available"]


def test_frames_select_one_exposure_from_each_of_first_six_visits(monkeypatch, tmp_path):
    rows = [
        {
            "access_url": f"https://irsa.ipac.caltech.edu/{visit}-{index}.fits",
            "obs_id": f"{visit}-{index}",
            "energy_bandpassname": "SPHEREx-D6",
            "t_min": 61000 + visit * 61 + offset,
        }
        for visit in range(7)
        for index, offset in enumerate((0, 30))
    ]
    monkeypatch.setattr(live_cutouts.irsa, "find_images", lambda *args, **kwargs: rows)
    attempts = []

    def download(url, ra, dec, size, path, **kwargs):
        obs_id = kwargs["expected_obs_id"]
        attempts.append(obs_id)
        if obs_id == "0-0":
            raise ValueError("HTTP 422: missing coverage")
        path.write_bytes(b"test cutout")

    monkeypatch.setattr(live_cutouts.irsa, "download_cutout", download)
    result = live_cutouts.load_cutouts(FramesQuery(ra=133, dec=-7), tmp_path)
    assert [item.obs_id for item in result] == ["0-1", "1-0", "2-0", "3-0", "4-0", "5-0"]
    assert sorted(attempts) == ["0-0", "0-1", "1-0", "2-0", "3-0", "4-0", "5-0"]
