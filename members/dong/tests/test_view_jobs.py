"""Tests for asynchronous progressive /api/views jobs and idempotency."""

from fastapi.testclient import TestClient

from app.main import app
from app.services import fixtures, view_jobs


def test_create_and_get_view_job_idempotent(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DATA_MODE", "fixture")
    view_jobs._worker_threads.clear()

    client = TestClient(app)
    res1 = client.post("/api/views", json={"ra": 269.4521, "dec": 4.6934, "fov_arcmin": 8, "detector": 6})
    assert res1.status_code == 200, res1.text
    job = res1.json()
    job_id = job["job_id"]
    assert job["detector"] == 6

    thread = view_jobs._worker_threads.get(job_id)
    if thread is not None:
        thread.join(timeout=10)

    res2 = client.get(f"/api/views/{job_id}")
    assert res2.status_code == 200
    done = res2.json()
    assert done["status"] == "ready"
    assert len(done["frames"]) >= 3

    # Rounded idempotent key reuses the same job_id instead of duplicating work
    res3 = client.post("/api/views", json={"ra": 269.45214, "dec": 4.69344, "fov_arcmin": 8, "detector": 6})
    assert res3.status_code == 200
    assert res3.json()["job_id"] == job_id


def test_create_view_job_validates_bounds(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    client = TestClient(app)
    bad = client.post("/api/views", json={"ra": 269.45, "dec": 4.69, "fov_arcmin": 80, "detector": 6})
    assert bad.status_code == 422 or bad.status_code == 400


def test_explorer_openapi_exposes_views(monkeypatch):
    client = TestClient(app)
    schema = client.get("/api/explorer-openapi.json").json()
    assert "/api/views" in schema["paths"]
    assert "/api/views/{job_id}" in schema["paths"]
    # Keep MVP OpenAPI contract unchanged at /openapi.json
    mvp = client.get("/openapi.json").json()
    assert "/api/views" not in mvp["paths"]
