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


def test_multi_target_combined_timeline_and_saturation_warning(offline_client, monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_MODE", "database")
    seq_dir = tmp_path / "data" / "processed_sequences" / "barnard_unwise_spherex_d6" / "player"
    seq_dir.mkdir(parents=True)
    png_bytes = b"\x89PNG\r\n\x1a\nfake"
    (seq_dir / "frame_001_unwise.png").write_bytes(png_bytes)
    (seq_dir / "frame_002_spherex.png").write_bytes(png_bytes)
    monkeypatch.setattr(combined_timeline, "ROOT", tmp_path)

    monkeypatch.setattr(
        database_provider,
        "combined_timeline_sequence",
        lambda seq_id: {
            "sequence_id": seq_id,
            "target_key": "barnard",
            "grid_wcs": {
                "width": 105,
                "height": 105,
                "pixel_scale_arcsec": 2.75,
                "CRVAL1": 269.45,
                "CRVAL2": 4.69,
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
                "release": "neo1",
                "source_product_id": "2688p045:e000:W2",
                "band_or_detector": "W2",
                "quality_label": "verified_coadd_e000",
                "observed_mjd": 55320.0,
                "observed_utc": "2010-05-04T00:00:00Z",
                "wavelength_um": 4.6,
                "bandwidth_um": 1.0,
                "predicted_x_px": 50.0,
                "predicted_y_png_px": 50.0,
                "local_asset_path": "data/processed_sequences/barnard_unwise_spherex_d6/frame_001_unwise.png",
            },
            {
                "frame_index": 2,
                "mission": "SPHEREx",
                "release": "spherex_dr1",
                "source_product_id": "spherex-barnard-d6",
                "band_or_detector": "D6",
                "quality_label": "dr1_target_flagged_or_saturated",
                "observed_mjd": 60902.8,
                "observed_utc": "2025-08-15T00:00:00Z",
                "wavelength_um": 4.7,
                "bandwidth_um": 0.1,
                "predicted_x_px": 52.0,
                "predicted_y_png_px": 51.0,
                "local_asset_path": "data/processed_sequences/barnard_unwise_spherex_d6/frame_002_spherex.png",
            },
        ],
    )

    res = offline_client.get(
        "/api/frames",
        params={
            "ra": 269.452,
            "dec": 4.693,
            "target_key": "barnard",
            "detector": 6,
            "timeline": "combined",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert "SATURATION_POSSIBLE" in body["warnings"]
    assert body["frames"][0]["png"] == "/api/frames/combined/barnard/frame_001_unwise.png"
    assert offline_client.get(body["frames"][0]["png"]).content == png_bytes


def test_combined_timeline_uses_storage_url_when_local_file_absent(offline_client, monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_MODE", "database")
    monkeypatch.setattr(combined_timeline, "ROOT", tmp_path)
    monkeypatch.setattr(
        database_provider,
        "combined_timeline_sequence",
        lambda seq_id: {
            "sequence_id": seq_id,
            "target_key": "wise0855",
            "upload_status": "uploaded",
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
                "local_asset_path": "data/processed_sequences/wise0855_unwise_spherex_d6/frame_001_unwise.png",
                "storage_url": "https://example.supabase.co/storage/v1/object/public/spherex-dr1-demo/combined/wise0855_unwise_spherex_d6/frame_001_unwise.png",
            }
        ],
    )
    res = offline_client.get(
        "/api/frames",
        params={"ra": 133.8189, "dec": -7.2470, "target_key": "wise0855", "detector": 6, "timeline": "combined"},
    )
    assert res.status_code == 200
    assert res.json()["frames"][0]["png"].startswith("https://example.supabase.co/storage/v1/object/public/")


def test_spherex_sequences_endpoint(offline_client, monkeypatch):
    monkeypatch.setenv("DATA_MODE", "fixture")
    res_off = offline_client.get("/api/sky-archive/spherex-sequences")
    assert res_off.status_code == 200
    assert res_off.json()["source"] == "disabled"

    monkeypatch.setenv("DATA_MODE", "database")
    assert offline_client.get("/api/sky-archive/spherex-sequences", params={"target_key": "bad"}).status_code == 404
    assert offline_client.get("/api/sky-archive/spherex-sequences", params={"release_source": "bad"}).status_code == 400

    monkeypatch.setattr(
        database_provider,
        "spherex_sequences",
        lambda target_key=None, detector=None, release_source=None: [
            {
                "sequence_id": f"{target_key or 'wise0855'}:{release_source or 'dr1'}:D{detector or 6}",
                "target_key": target_key or "wise0855",
                "release_source": release_source or "dr1",
                "detector": detector or 6,
                "frame_count": 26,
            }
        ],
    )
    res_ok = offline_client.get(
        "/api/sky-archive/spherex-sequences",
        params={"target_key": "wise0855", "detector": 6, "release_source": "dr1"},
    )
    assert res_ok.status_code == 200
    body = res_ok.json()
    assert body["source"] == "sky_archive.spherex_sequences"
    assert body["count"] == 1
    assert body["sequences"][0]["sequence_id"] == "wise0855:dr1:D6"


def test_spherex_only_all_30_target_detector_combinations_and_saturation_fallback(
    offline_client, monkeypatch, tmp_path
):
    monkeypatch.setenv("DATA_MODE", "database")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "spherex-dr1-demo")
    monkeypatch.setattr(combined_timeline, "ROOT", tmp_path)

    target_rows = {
        "barnard": {"target_key": "barnard", "name": "Barnard's Star", "ra_deg": 269.452, "dec_deg": 4.693},
        "wise0855": {"target_key": "wise0855", "name": "WISE 0855-0714", "ra_deg": 133.8189, "dec_deg": -7.2470},
        "epsindib": {"target_key": "epsindib", "name": "Epsilon Indi B", "ra_deg": 331.0441, "dec_deg": -56.7828},
        "rwaur": {"target_key": "rwaur", "name": "RW Aurigae", "ra_deg": 76.9565, "dec_deg": 30.4014},
        "rdra": {"target_key": "rdra", "name": "R Draconis", "ra_deg": 248.1676, "dec_deg": 66.7550},
    }
    monkeypatch.setattr(database_provider, "targets", lambda: target_rows)
    monkeypatch.setattr(
        database_provider,
        "find_target",
        lambda ra, dec, target_key=None: target_rows.get(target_key or "wise0855"),
    )

    def is_saturated_combo(tk: str, det: int) -> bool:
        return tk in {"barnard", "rdra"} or (tk == "rwaur" and det >= 2)

    def fake_dr1_frames(target_key=None, detector=None):
        det = int(detector or 6)
        usable = not is_saturated_combo(target_key, det)
        return [
            {
                "frame_id": f"{target_key}:2025W35_1A_0001_1:D{det}",
                "target_key": target_key,
                "product_id": f"ivo://irsa.ipac/spherex_dr1?2025W35_1A_0001_1/D{det}",
                "obs_id": "2025W35_1A_0001_1",
                "detector": det,
                "release": "dr1",
                "observed_mjd": 60914.2,
                "observed_at": "2025-08-27T04:48:00+00:00",
                "wavelength_um": 0.65 + det * 0.65,
                "bandwidth_um": 0.02,
                "download_status": "downloaded",
                "target_inside": True,
                "usable": usable,
                "bad_flags": [] if usable else ["MP_OVERFLOW", "MP_BLOOM"],
            },
            {
                "frame_id": f"{target_key}:2026W11_1A_0002_1:D{det}",
                "target_key": target_key,
                "product_id": f"ivo://irsa.ipac/spherex_dr1?2026W11_1A_0002_1/D{det}",
                "obs_id": "2026W11_1A_0002_1",
                "detector": det,
                "release": "dr1",
                "observed_mjd": 61110.1,
                "observed_at": "2026-03-11T02:24:00+00:00",
                "wavelength_um": 0.65 + det * 0.65,
                "bandwidth_um": 0.02,
                "download_status": "downloaded",
                "target_inside": True,
                "usable": usable,
                "bad_flags": [] if usable else ["MP_OVERFLOW", "MP_BLOOM"],
            },
        ]

    def fake_dr1_sequences(target_key=None, detector=None):
        det = int(detector or 6)
        usable = not is_saturated_combo(target_key, det)
        kind = "screened" if usable else "display_only"
        wave = round(0.65 + det * 0.65, 4)
        prefix = f"sequences/{target_key}/d{det}/seq_n2"
        return [
            {
                "sequence_id": f"{target_key}:D{det}:seq:n2",
                "target_key": target_key,
                "detector": det,
                "kind": kind,
                "is_primary": True,
                "frame_ids": [
                    f"{target_key}:2025W35_1A_0001_1:D{det}",
                    f"{target_key}:2026W11_1A_0002_1:D{det}",
                ],
                "frame_count": 2,
                "grid_width": 47,
                "grid_height": 47,
                "pixel_scale_arcsec": 6.15,
                "norm": {"vmin": 0.1, "vmax": 3.5, "stretch": "asinh"},
                "assets": {
                    "frames": [f"{prefix}/frame_01.png", f"{prefix}/frame_02.png"],
                    "diffs": [f"{prefix}/diff_01_minus_01.png", f"{prefix}/diff_02_minus_01.png"],
                },
                "upload_status": "uploaded",
                "report": {
                    "kind": kind,
                    "release": "dr1",
                    "inputs": [
                        {
                            "obs_id": "2025W35_1A_0001_1",
                            "mjd": 60914.2,
                            "iso_utc": "2025-08-27T04:48:00.000",
                            "wavelength_um": wave,
                            "bandwidth_um": 0.02,
                            "usable_for_candidate": usable,
                            "predicted_pixel_xy_origin_lower": [22.8, 22.6],
                        },
                        {
                            "obs_id": "2026W11_1A_0002_1",
                            "mjd": 61110.1,
                            "iso_utc": "2026-03-11T02:24:00.000",
                            "wavelength_um": wave,
                            "bandwidth_um": 0.02,
                            "usable_for_candidate": usable,
                            "predicted_pixel_xy_origin_lower": [23.2, 23.4],
                        },
                    ],
                },
            }
        ]

    monkeypatch.setattr(database_provider, "dr1_frames", fake_dr1_frames)
    monkeypatch.setattr(database_provider, "dr1_sequences", fake_dr1_sequences)
    monkeypatch.setattr(
        database_provider,
        "combined_timeline_sequence",
        lambda seq_id: {
            "sequence_id": seq_id,
            "target_key": seq_id.split(":")[0],
            "upload_status": "uploaded",
            "grid_wcs": {"width": 105, "height": 105, "pixel_scale_arcsec": 2.75, "CRVAL1": 133.8, "CRVAL2": -7.2},
        },
    )
    monkeypatch.setattr(
        database_provider,
        "combined_timeline_frames",
        lambda seq_id: [
            {
                "frame_index": 1,
                "mission": "unWISE",
                "release": "unWISE W2",
                "source_product_id": "unwise-1",
                "band_or_detector": "W2",
                "quality_label": "usable",
                "observed_mjd": 55320.0,
                "observed_utc": "2010-05-04T00:00:00Z",
                "wavelength_um": 4.6,
                "bandwidth_um": 1.0,
                "predicted_x_px": 52.0,
                "predicted_y_png_px": 52.0,
                "local_asset_path": f"data/processed_sequences/{seq_id.split(':')[0]}_unwise_spherex_d6/frame_001_unwise.png",
                "storage_url": f"https://example.supabase.co/storage/v1/object/public/spherex-dr1-demo/combined/{seq_id.split(':')[0]}/frame_001.png",
            }
        ],
    )

    combo_count = 0
    for tk, trow in target_rows.items():
        for det in range(1, 7):
            res = offline_client.get(
                "/api/frames",
                params={"ra": trow["ra_deg"], "dec": trow["dec_deg"], "target_key": tk, "detector": det},
            )
            assert res.status_code == 200
            body = res.json()
            assert body["detector"] == det
            assert len(body["frames"]) == 2
            assert body["frames"][0]["mission"] == "SPHEREx"
            assert body["frames"][0]["band_or_detector"] == f"D{det}"
            assert body["frames"][0]["png"].startswith(
                f"https://example.supabase.co/storage/v1/object/public/spherex-dr1-demo/sequences/{tk}/d{det}/"
            )
            assert body["frames"][0]["predicted_px"] == [22.8, 23.4]
            assert body["frames"][1]["predicted_px"] == [23.2, 22.6]
            if is_saturated_combo(tk, det):
                assert "SATURATION_POSSIBLE" in body["warnings"]
            else:
                assert "SATURATION_POSSIBLE" not in body["warnings"]
            combo_count += 1

        # Verify timeline=combined on D6 still works for every target
        res_comb = offline_client.get(
            "/api/frames",
            params={
                "ra": trow["ra_deg"],
                "dec": trow["dec_deg"],
                "target_key": tk,
                "detector": 6,
                "timeline": "combined",
            },
        )
        assert res_comb.status_code == 200
        assert res_comb.json()["frames"][0]["mission"] == "unWISE"

    assert combo_count == 30


