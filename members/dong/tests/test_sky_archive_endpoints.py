"""Contract and resilience tests for sky_archive FastAPI routes."""

import json
import socket

import pytest
from app.main import app
from app.services import combined_timeline, database_provider
from fastapi.testclient import TestClient


@pytest.fixture()
def offline_client(monkeypatch):
    def fail_socket(*_args, **_kwargs):
        raise AssertionError("network socket opened during offline test")

    monkeypatch.setattr(socket, "create_connection", fail_socket)
    return TestClient(app)


def test_hips_layers_disabled_and_enabled(offline_client, monkeypatch):
    monkeypatch.setenv("DATA_MODE", "fixture")
    res = offline_client.get("/api/sky-archive/hips-layers")
    assert res.status_code == 200
    assert res.json() == {"api_version": "0.1", "source": "disabled", "layers": []}

    monkeypatch.setenv("DATA_MODE", "database")
    monkeypatch.setattr(
        database_provider,
        "_get",
        lambda table, params=None: [
            {
                "layer_id": "ivo://IPAC/P/SPHEREx/DR1/cube",
                "title": "SPHEREx DR1 Spectral Cube",
                "service_url": "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube",
                "cube": True,
                "cube_frames": 102,
            }
        ],
    )
    res_ok = offline_client.get("/api/sky-archive/hips-layers")
    assert res_ok.status_code == 200
    body = res_ok.json()
    assert body["source"] == "sky_archive.hips_layers"
    assert len(body["layers"]) == 1
    assert body["layers"][0]["layer_id"] == "ivo://IPAC/P/SPHEREx/DR1/cube"

    def raise_db(_table, _params=None):
        raise database_provider.DatabaseError("down")

    monkeypatch.setattr(database_provider, "_get", raise_db)
    res_err = offline_client.get("/api/sky-archive/hips-layers")
    assert res_err.status_code == 503
    assert res_err.json()["error"]["code"] == "DATABASE_UNAVAILABLE"


def test_gaia_paginates_and_preserves_64bit_source_ids(offline_client, monkeypatch):
    monkeypatch.setenv("DATA_MODE", "database")
    calls = []

    def fake_get(table, params=None):
        assert table == "target_gaia_dr3"
        calls.append((params.get("limit"), params.get("offset")))
        offset = int(params["offset"])
        if offset == 0:
            return [
                {
                    "source_id": 4472832130942575872 + i,
                    "gaia_dr3": {
                        "source_id": 4472832130942575872 + i,
                        "ra_deg": 269.45 + i * 1e-4,
                        "dec_deg": 4.69,
                        "g_mag": 10.0 + (i % 5),
                        "pmra_mas_yr": -801.5,
                        "pmdec_mas_yr": 10362.4,
                        "ref_epoch_jyear": 2016.0,
                    },
                }
                for i in range(1000)
            ]
        return [
            {
                "source_id": 4472832130942577000 + i,
                "gaia_dr3": {
                    "source_id": 4472832130942577000 + i,
                    "ra_deg": 269.55,
                    "dec_deg": 4.7,
                    "g_mag": 17.5,
                    "pmra_mas_yr": None,
                    "pmdec_mas_yr": None,
                    "ref_epoch_jyear": 2016.0,
                },
            }
            for i in range(250)
        ]

    monkeypatch.setattr(database_provider, "_get", fake_get)

    res = offline_client.get("/api/sky-archive/gaia", params={"target_key": "barnard"})
    assert res.status_code == 200
    body = res.json()
    assert calls == [("1000", "0"), ("1000", "1000")]
    assert body["count"] == 1250
    assert body["sources"][0]["source_id"] == "4472832130942575872"
    assert isinstance(body["sources"][0]["source_id"], str)

    res_filtered = offline_client.get(
        "/api/sky-archive/gaia", params={"target_key": "barnard", "g_max": 12.0}
    )
    assert res_filtered.status_code == 200
    assert res_filtered.json()["count"] == 400


def test_gaia_error_states(offline_client, monkeypatch):
    monkeypatch.setenv("DATA_MODE", "fixture")
    assert (
        offline_client.get("/api/sky-archive/gaia", params={"target_key": "unknown"}).status_code
        == 404
    )
    res_disabled = offline_client.get("/api/sky-archive/gaia", params={"target_key": "barnard"})
    assert res_disabled.status_code == 404
    assert res_disabled.json()["error"]["code"] == "NOT_AVAILABLE"

    monkeypatch.setenv("DATA_MODE", "database")
    monkeypatch.setattr(
        database_provider,
        "_get",
        lambda *_a, **_k: (_ for _ in ()).throw(database_provider.DatabaseError("down")),
    )
    res_err = offline_client.get("/api/sky-archive/gaia", params={"target_key": "barnard"})
    assert res_err.status_code == 503
    assert res_err.json()["error"]["code"] == "DATABASE_UNAVAILABLE"


def test_combined_timeline_uses_db_in_database_mode_and_falls_back(offline_client, monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_MODE", "database")
    monkeypatch.setenv("WISE0855_SEQUENCE_DIR", str(tmp_path))
    player = tmp_path / "player"
    player.mkdir()
    # The real timeline lives under gitignored data/. Keep this offline test
    # self-contained on a fresh CI checkout as well as on a developer's machine.
    (player / "frame_001_unwise.png").write_bytes(b"test image")
    local_rows = [
        {
            "frame_index": i,
            "mission": "unWISE" if i < 24 else "SPHEREx",
            "release": "unWISE W2" if i < 24 else "DR1",
            "source_product_id": f"fixture-{i}",
            "band_or_detector": "W2" if i < 24 else "D6",
            "quality_label": "fixture",
            "observed_mjd": 55320.0 + i,
            "observed_utc": "2010-05-04T00:00:00Z",
            "wavelength_um": 4.6,
            "predicted_x_px": 124.5,
            "predicted_y_png_px": 124.5,
            "png": f"frame_{i:03d}_{'unwise' if i < 24 else 'spherex'}.png",
        }
        for i in range(1, 28)
    ]
    (tmp_path / "sequence_manifest.json").write_text(json.dumps({
        "sequence_id": combined_timeline.SEQUENCE_ID,
        "target_key": "wise0855",
        "grid_wcs": {"width": 250, "height": 250, "pixel_scale_arcsec": 2.75,
                     "CRVAL1": 133.81890825, "CRVAL2": -7.247048},
        "frames": local_rows,
    }), encoding="utf-8")
    monkeypatch.setattr(
        database_provider,
        "combined_timeline_sequence",
        lambda _seq: {
            "target_key": "wise0855",
            "grid_wcs": {
                "width": 250,
                "height": 250,
                "pixel_scale_arcsec": 2.75,
                "CRVAL1": 133.81890825,
                "CRVAL2": -7.247048,
            },
        },
    )
    monkeypatch.setattr(
        database_provider,
        "combined_timeline_frames",
        lambda _seq: [
            {
                "frame_index": 1,
                "mission": "unWISE",
                "release": "unWISE W2",
                "source_product_id": "unwise-e001",
                "band_or_detector": "W2",
                "quality_label": "usable",
                "observed_mjd": 55320.0,
                "observed_utc": "2010-05-04T00:00:00Z",
                "wavelength_um": 4.6,
                "bandwidth_um": 1.0,
                "predicted_x_px": 124.5,
                "predicted_y_png_px": 124.5,
                "local_asset_path": "data/processed_sequences/wise0855_unwise_spherex_d6/player/frame_001_unwise.png",
            },
            {
                "frame_index": 27,
                "mission": "SPHEREx",
                "release": "DR1",
                "source_product_id": "spherex-d6-001",
                "band_or_detector": "D6",
                "quality_label": "usable",
                "observed_mjd": 60900.0,
                "observed_utc": "2025-08-13T00:00:00Z",
                "wavelength_um": 4.7,
                "bandwidth_um": 0.1,
                "predicted_x_px": 95.0,
                "predicted_y_png_px": 120.0,
                "local_asset_path": "data/processed_sequences/wise0855_unwise_spherex_d6/player/frame_027_spherex.png",
            },
        ],
    )

    res = offline_client.get(
        "/api/frames",
        params={
            "ra": 133.8189,
            "dec": -7.2470,
            "target_key": "wise0855",
            "detector": 6,
            "timeline": "combined",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["frames"]) == 2
    assert body["frames"][0]["mission"] == "unWISE"
    assert body["frames"][0]["png"] == "/api/frames/wise0855/frame_001_unwise.png"

    # DB failure gracefully falls back to local sequence_manifest.json when present
    monkeypatch.setattr(
        database_provider,
        "combined_timeline_sequence",
        lambda _seq: (_ for _ in ()).throw(database_provider.DatabaseError("down")),
    )
    res_fallback = offline_client.get(
        "/api/frames",
        params={
            "ra": 133.8189,
            "dec": -7.2470,
            "target_key": "wise0855",
            "detector": 6,
            "timeline": "combined",
        },
    )
    assert res_fallback.status_code == 200
    assert len(res_fallback.json()["frames"]) == 27


def test_combined_gaia_overlays_endpoint(offline_client, monkeypatch):
    monkeypatch.setenv("DATA_MODE", "fixture")
    res_off = offline_client.get("/api/sky-archive/combined-timeline/gaia-overlays")
    assert res_off.status_code == 404
    assert res_off.json()["error"]["code"] == "NOT_AVAILABLE"

    monkeypatch.setenv("DATA_MODE", "database")
    monkeypatch.setattr(
        database_provider,
        "combined_timeline_sequence",
        lambda _seq: {
            "sequence_id": combined_timeline.SEQUENCE_ID,
            "gaia_propagation_model": "angular_proper_motion_only",
            "annual_parallax_included": False,
            "observer_ephemeris_included": False,
            "target_astrometry_source": "Kirkpatrick et al. 2019",
        },
    )
    monkeypatch.setattr(
        database_provider,
        "gaia_frame_overlays",
        lambda _seq, frame_index=None, in_frame_only=False: [
            {
                "sequence_id": combined_timeline.SEQUENCE_ID,
                "frame_index": frame_index or 1,
                "source_id": "573885000000000000",
                "observed_mjd": 55320.0,
                "catalog_ra_deg": 133.81,
                "catalog_dec_deg": -7.24,
                "propagated_ra_deg": 133.81,
                "propagated_dec_deg": -7.24,
                "pixel_x": 120.5,
                "pixel_y_png": 130.25,
                "in_frame": True,
                "has_proper_motion": True,
                "motion_status": "propagated_pm",
                "g_mag": 16.4,
            }
        ],
    )
    res = offline_client.get(
        "/api/sky-archive/combined-timeline/gaia-overlays", params={"frame_index": 1}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "sky_archive.gaia_frame_overlays"
    assert body["gaia_propagation_model"] == "angular_proper_motion_only"
    assert body["annual_parallax_included"] is False
    assert body["observer_ephemeris_included"] is False
    assert isinstance(body["overlays"][0]["source_id"], str)

    monkeypatch.setattr(database_provider, "combined_timeline_sequence", lambda _seq: None)
    res_missing = offline_client.get("/api/sky-archive/combined-timeline/gaia-overlays")
    assert res_missing.status_code == 404
    assert res_missing.json()["error"]["code"] == "TIMELINE_UNAVAILABLE"
