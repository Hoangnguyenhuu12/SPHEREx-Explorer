"""Contract checks for the measured band-flux endpoint."""

from fastapi.testclient import TestClient

from app.main import app
from app.services import fixtures, spectrum_service


def test_spectrum_uses_all_detectors_and_aperture_measurement(monkeypatch):
    seen = {}

    def measured(query, operation, aperture):
        seen.update(detector=query.detector, operation=operation, aperture=aperture)
        return {
            "points": [
                {"detector": 1, "wavelength_um": 0.92, "flux_mjy": 1.2, "err_mjy": 0.1, "flagged": False},
                {"detector": 6, "wavelength_um": 4.71, "flux_mjy": 4.2, "err_mjy": 0.2, "flagged": False},
            ]
        }

    monkeypatch.setenv("DATA_MODE", "hybrid")
    monkeypatch.setattr(fixtures, "cached_result", lambda operation, query, build: (build(), "MISS"))
    monkeypatch.setattr(spectrum_service, "read", lambda query: measured(query, "photometry", 12.3) | {
        "api_version": "0.1", "mode": "hybrid", "position": {"ra": query.ra, "dec": query.dec},
        "flux_unit": "mJy", "sample_kind": "band_flux", "wavelength_source": "test",
        "is_continuous_spectrum": False, "warnings": ["APERTURE_PHOTOMETRY"],
    })
    response = TestClient(app).get(
        "/api/spectrum",
        params={"ra": 269.452, "dec": 4.693, "target_key": "barnard"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert seen == {"detector": None, "operation": "photometry", "aperture": 12.3}
    assert body["sample_kind"] == "band_flux"
    assert body["is_continuous_spectrum"] is False
    assert [point["detector"] for point in body["points"]] == [1, 6]
    assert "APERTURE_PHOTOMETRY" in body["warnings"]


def test_spectrum_reports_no_measurements_without_fabricating_points(monkeypatch):
    monkeypatch.setenv("DATA_MODE", "hybrid")
    monkeypatch.setattr(fixtures, "cached_result", lambda operation, query, build: (build(), "MISS"))
    monkeypatch.setattr(spectrum_service, "read", lambda *args, **kwargs: (_ for _ in ()).throw(
        spectrum_service.SpectrumError(404, "NO_SPECTRUM", "No usable aperture measurements", mode="hybrid")
    ))
    response = TestClient(app).get(
        "/api/spectrum",
        params={"ra": 269.452, "dec": 4.693, "target_key": "barnard"},
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NO_SPECTRUM"
