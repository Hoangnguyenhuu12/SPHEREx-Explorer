from concurrent.futures import ThreadPoolExecutor
from threading import Event, get_ident

import pytest
import requests
from diskcache import Cache

from app.api_models import FramesQuery, PhotometryQuery, ScienceQuery
from app.services import live_cutouts


@pytest.fixture(autouse=True)
def live_cache(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DATA_MODE", "live")
    monkeypatch.setenv("SPHEREX_COLLECTION", "spherex_dr1")
    monkeypatch.setenv("SPHEREX_COLLECTION_FALLBACK", "")


def test_identical_live_results_share_one_inflight_build(monkeypatch):
    query = FramesQuery(ra=133, dec=-7)
    expected = ({"warnings": []}, {"frame": (b"png", b"diff")})
    building = Event()
    read_miss = Event()
    finish = Event()
    builds = []
    second_thread = None
    cache_get = Cache.get

    def get(cache, key, *args, **kwargs):
        value = cache_get(cache, key, *args, **kwargs)
        if get_ident() == second_thread and value is None:
            read_miss.set()
        return value

    def build():
        builds.append(True)
        building.set()
        assert finish.wait(10)
        return expected

    def second_request():
        nonlocal second_thread
        second_thread = get_ident()
        return live_cutouts.cached_result("frames", query, build)

    monkeypatch.setattr(Cache, "get", get)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(live_cutouts.cached_result, "frames", query, build)
        try:
            assert building.wait(10)
            second = pool.submit(second_request)
            assert read_miss.wait(10)
        finally:
            finish.set()
        assert first.result() == (expected, "MISS")
        assert second.result() == (expected, "HIT")
    assert len(builds) == 1


def test_live_cutouts_share_discovery_across_sizes_and_fits_across_operations(monkeypatch, tmp_path):
    discovery = []
    downloads = []
    coords = {"ra": 133, "dec": -7}
    row = {
        "access_url": "https://irsa.ipac.caltech.edu/product.fits",
        "obs_id": "product",
        "obs_publisher_did": "product-v1",
        "energy_bandpassname": "SPHEREx-D6",
        "t_min": 61000,
    }

    def find(ra, dec, collection, detector, **kwargs):
        discovery.append((ra, dec, collection, detector, kwargs["search_radius_deg"]))
        return [row]

    def download(url, ra, dec, size, path, **kwargs):
        downloads.append((url, ra, dec, size))
        path.write_bytes(f"{ra},{dec},{size}".encode())

    def load(query):
        with live_cutouts.workspace() as directory:
            cutout, = live_cutouts.load_cutouts(query, directory)
            return cutout.path.read_bytes()

    monkeypatch.setattr(live_cutouts.irsa, "find_images", find)
    monkeypatch.setattr(live_cutouts.irsa, "download_cutout", download)

    original = load(FramesQuery(**coords, size=0.1))
    assert load(PhotometryQuery(**coords, detector=6)) == original
    assert load(ScienceQuery(**coords)) == original  # All detectors searches can share D6 products.
    assert load(FramesQuery(**coords, size=0.2)) != original
    assert load(FramesQuery(ra=134, dec=-7, size=0.1)) != original
    monkeypatch.setenv("SPHEREX_COLLECTION", "spherex_qr3")
    assert load(FramesQuery(**coords, size=0.1)) == original
    assert discovery == [
        (133, -7, "spherex_dr1", 6, 1 / 3600),
        (133, -7, "spherex_dr1", None, 1 / 3600),
        (134, -7, "spherex_dr1", 6, 1 / 3600),
        (133, -7, "spherex_qr3", 6, 1 / 3600),
    ]
    assert [item[1:] for item in downloads] == [
        (133, -7, 0.1), (133, -7, 0.2), (134, -7, 0.1), (133, -7, 0.1),
    ]


def test_live_cutout_failures_remain_retryable(monkeypatch):
    rows = [{
        "access_url": "https://irsa.ipac.caltech.edu/product.fits",
        "obs_id": "product",
        "energy_bandpassname": "SPHEREx-D6",
        "t_min": 61000,
    }]
    discovery = []
    downloads = []

    def find(*args, **kwargs):
        discovery.append(True)
        if len(discovery) == 1:
            raise live_cutouts.irsa.UpstreamError("discovery failed")
        return rows

    def download(url, ra, dec, size, path, **kwargs):
        downloads.append(True)
        if len(downloads) == 1:
            path.write_bytes(b"partial download")
            raise requests.ConnectionError("download failed")
        path.write_bytes(b"test cutout")

    monkeypatch.setattr(live_cutouts.irsa, "find_images", find)
    monkeypatch.setattr(live_cutouts.irsa, "download_cutout", download)
    query = FramesQuery(ra=133, dec=-7)

    for error in ("discovery failed", "IRSA cutout requests failed"):
        with live_cutouts.workspace() as directory:
            with pytest.raises(live_cutouts.irsa.UpstreamError, match=error):
                live_cutouts.load_cutouts(query, directory)

    for _ in range(2):
        with live_cutouts.workspace() as directory:
            cutout, = live_cutouts.load_cutouts(query, directory)
            assert cutout.path.read_bytes() == b"test cutout"
    assert len(discovery) == len(downloads) == 2


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
