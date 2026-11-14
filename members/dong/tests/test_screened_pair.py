"""DATA_MODE=real serves the screened DR1 pair when a processed report names it."""
import json
from pathlib import Path

import pytest
from app.main import app
from app.services.observed_frames import Cutout, screened_pair
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]


def cutout(name, sha):
    return Cutout(Path(name), name, 6, 60000.0, "dr1", sha, 1, 1)


def write_report(data_dir, shas, detector=6, release="dr1"):
    folder = data_dir / "processed" / "wise0855_d6_comparison"
    folder.mkdir(parents=True)
    report = {"release": release, "detector": detector, "inputs": [{"sha256": s} for s in shas]}
    (folder / "report.json").write_text(json.dumps(report), encoding="utf-8")


def test_pair_report_selects_only_its_inputs(tmp_path, monkeypatch):
    monkeypatch.delenv("REAL_SELECTION", raising=False)
    rows = [cutout("a", "1"), cutout("b", "2"), cutout("c", "3")]
    write_report(tmp_path, ["1", "3"])
    assert [r.sha256 for r in screened_pair(tmp_path, "wise0855", 6, "dr1", rows)] == ["1", "3"]


def test_stale_or_absent_report_keeps_all_validated_cutouts(tmp_path, monkeypatch):
    monkeypatch.delenv("REAL_SELECTION", raising=False)
    rows = [cutout("a", "1"), cutout("b", "2")]
    assert screened_pair(tmp_path, "wise0855", 6, "dr1", rows) == rows
    write_report(tmp_path, ["1", "missing"])
    assert screened_pair(tmp_path, "wise0855", 6, "dr1", rows) == rows
    assert screened_pair(tmp_path, "wise0855", 3, "dr1", rows) == rows


def test_real_selection_all_disables_pair_filter(tmp_path, monkeypatch):
    monkeypatch.setenv("REAL_SELECTION", "all")
    rows = [cutout("a", "1"), cutout("b", "2"), cutout("c", "3")]
    write_report(tmp_path, ["1", "3"])
    assert screened_pair(tmp_path, "wise0855", 6, "dr1", rows) == rows


PAIRS = [
    ("wise0855", "wise0855", 133.759765, -7.242182, 6),
    ("wise0855", "wise0855", 133.759765, -7.242182, 3),
    ("epsilon_indi_b", "epsindib", 331.096669, -56.800649, 6),
    ("rw_aurigae", "rwaur", 76.956587, 30.401291, 1),
]


@pytest.mark.parametrize("folder,key,ra,dec,detector", PAIRS)
def test_local_screened_pairs_are_served(monkeypatch, folder, key, ra, dec, detector):
    report = ROOT / "data" / "processed" / f"{folder}_d{detector}_comparison" / "report.json"
    if not report.is_file():
        pytest.skip("Processed DR1 pair not installed; see AGENT_HANDOFF_DATA.md")
    monkeypatch.setenv("DATA_MODE", "real")
    monkeypatch.setenv("DATA_RELEASE", "dr1")
    monkeypatch.setenv("DATA_DIR", str(ROOT / "data"))
    monkeypatch.delenv("REAL_SELECTION", raising=False)
    # Frames carry no obs_id; the two inputs are months apart, so MJD identifies them.
    inputs = json.loads(report.read_text(encoding="utf-8"))["inputs"]
    expected = sorted(round(row["mjd"], 3) for row in inputs)
    client = TestClient(app, raise_server_exceptions=False)
    result = client.get("/api/frames", params={"target_key": key, "ra": ra, "dec": dec, "detector": detector})
    assert result.status_code == 200, result.text
    frames = result.json()["frames"]
    assert sorted(round(f["mjd"], 3) for f in frames) == expected
    assert all(f["release"] == "dr1" for f in frames)
