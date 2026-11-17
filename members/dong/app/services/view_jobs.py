"""Asynchronous progressive view-job service (POST /api/views, GET /api/views/{id}).

Publishes each finished few-MB range cutout frame immediately into `fixtures.images` and SQLite
so the browser renders and starts blinking frames as they stream instead of waiting for all visits.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import time
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import requests

from shared.pipeline.irsa import UpstreamError, UpstreamTimeout

from ..api_models import FramesQuery, Target
from . import catalog, fixtures, live_cutouts
from .observed_frames import render_cached

MAX_CONCURRENT_PER_IP = 3
NAME_CACHE_TTL_S = 30 * 24 * 3600

_db_lock = threading.Lock()
_worker_threads: dict[str, threading.Thread] = {}


class ViewJobError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


def _db_path() -> Path:
    base = Path(os.getenv("DATA_DIR", str(Path(__file__).resolve().parents[4] / "data")))
    base.mkdir(parents=True, exist_ok=True)
    return base / "view_jobs.sqlite3"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_db_path()), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS view_jobs (
            job_id TEXT PRIMARY KEY,
            idempotent_key TEXT NOT NULL,
            client_ip TEXT NOT NULL,
            status TEXT NOT NULL,
            ra REAL NOT NULL,
            dec REAL NOT NULL,
            fov_arcmin REAL NOT NULL,
            detector INTEGER NOT NULL,
            target_name TEXT,
            target_key TEXT,
            resolved_by TEXT,
            found_count INTEGER NOT NULL DEFAULT 0,
            done_count INTEGER NOT NULL DEFAULT 0,
            frames_json TEXT NOT NULL DEFAULT '[]',
            error_json TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_view_jobs_key ON view_jobs(idempotent_key);
        CREATE INDEX IF NOT EXISTS idx_view_jobs_ip ON view_jobs(client_ip, status);
        CREATE TABLE IF NOT EXISTS sesame_cache (
            name_key TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            expires_at REAL NOT NULL
        );
        """
    )
    return conn


def make_idempotent_key(ra: float, dec: float, fov_arcmin: float, detector: int) -> str:
    return f"{round(ra, 3):.3f}_{round(dec, 3):.3f}_{int(round(fov_arcmin))}_{int(detector)}"


def _sesame_query(name: str) -> dict[str, Any] | None:
    url = f"https://cdsweb.u-strasbg.fr/cgi-bin/nph-sesame/-oIx/A?{requests.utils.quote(name)}"
    resp = requests.get(url, timeout=8)
    resp.raise_for_status()
    root = ET.fromstring(resp.text)
    for resolver in root.findall(".//Resolver"):
        jradeg = resolver.findtext("jradeg")
        jdedeg = resolver.findtext("jdedeg")
        oname = resolver.findtext("oname") or name
        if jradeg and jdedeg:
            return {
                "ra": float(jradeg),
                "dec": float(jdedeg),
                "name": oname.strip(),
                "resolved_by": "SIMBAD",
            }
    return None


def resolve_target(name: str) -> dict[str, Any]:
    local = catalog.resolve_name(name)
    if local is not None:
        return {
            "ra": float(local["ra"]),
            "dec": float(local["dec"]),
            "name": local["name"],
            "target_key": local["target_key"],
            "resolved_by": "targets_table",
        }
    key = re.sub(r"\s+", " ", name.strip()).lower()
    now = time.time()
    with _db_lock, _connect() as conn:
        row = conn.execute(
            "SELECT payload_json, expires_at FROM sesame_cache WHERE name_key = ?", (key,)
        ).fetchone()
        if row and row["expires_at"] > now:
            return json.loads(row["payload_json"])
    try:
        resolved = _sesame_query(name)
    except Exception as exc:  # noqa: BLE001
        raise ViewJobError(502, "UPSTREAM_ERROR", f"Name resolver failed for {name!r}.") from exc
    if resolved is None:
        raise ViewJobError(404, "UNKNOWN_TARGET", f"Target {name!r} could not be resolved.", {"name": name})
    with _db_lock, _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO sesame_cache(name_key, payload_json, expires_at) VALUES (?, ?, ?)",
            (key, json.dumps(resolved), now + NAME_CACHE_TTL_S),
        )
        conn.commit()
    return resolved


def _publish_images(published: dict[str, tuple[bytes, bytes]]) -> None:
    if not published:
        return
    with fixtures.image_lock:
        for frame_id, content in published.items():
            fixtures.images[frame_id] = content
            fixtures.images.move_to_end(frame_id)
        while len(fixtures.images) > 1200:
            fixtures.images.popitem(last=False)


def _update_job(
    job_id: str,
    *,
    status: str | None = None,
    found_count: int | None = None,
    done_count: int | None = None,
    frames: list[dict[str, Any]] | None = None,
    error: dict[str, Any] | None = None,
) -> None:
    sets: list[str] = ["updated_at = ?"]
    vals: list[Any] = [time.time()]
    if status is not None:
        sets.append("status = ?")
        vals.append(status)
    if found_count is not None:
        sets.append("found_count = ?")
        vals.append(found_count)
    if done_count is not None:
        sets.append("done_count = ?")
        vals.append(done_count)
    if frames is not None:
        sets.append("frames_json = ?")
        vals.append(json.dumps(frames))
    if error is not None:
        sets.append("error_json = ?")
        vals.append(json.dumps(error))
    vals.append(job_id)
    with _db_lock, _connect() as conn:
        conn.execute(f"UPDATE view_jobs SET {', '.join(sets)} WHERE job_id = ?", vals)
        conn.commit()


def _run_job(job_id: str) -> None:
    with _db_lock, _connect() as conn:
        row = conn.execute("SELECT * FROM view_jobs WHERE job_id = ?", (job_id,)).fetchone()
        if row is None:
            return
        ra = float(row["ra"])
        dec = float(row["dec"])
        fov_arcmin = float(row["fov_arcmin"])
        detector = int(row["detector"])
        target_key = row["target_key"]

    _update_job(job_id, status="searching")

    try:
        size_deg = max(0.02, min(0.3, fov_arcmin / 60.0))
        q = FramesQuery(
            ra=ra,
            dec=dec,
            detector=detector,
            size=size_deg,
            max_frames=60,
            target_key=target_key,
        )
        requested_target = Target.model_validate(fixtures.target(q))
        use_streaming_live = fixtures.live_mode() and not live_cutouts.harvest_mode() and not live_cutouts.uses_database_cutouts(q)

        if use_streaming_live:
            _update_job(job_id, status="fetching")
            rendered_frames: list[dict[str, Any]] = []

            def on_progress(cutouts, done_count: int, total_tasks: int) -> None:
                nonlocal rendered_frames
                if not cutouts:
                    return
                try:
                    frames_model, published = render_cached(
                        q.model_dump_json(),
                        requested_target.model_dump_json(),
                        cutouts,
                    )
                    _publish_images(published)
                    rendered_frames = frames_model.model_dump(mode="json", exclude_unset=True).get("frames", [])
                    _update_job(
                        job_id,
                        status="fetching",
                        found_count=max(total_tasks, len(rendered_frames)),
                        done_count=len(rendered_frames),
                        frames=rendered_frames,
                    )
                except Exception:  # noqa: BLE001 - continue streaming remaining visits
                    pass

            with live_cutouts.workspace() as directory:
                cutouts = live_cutouts.load_irsa_cutouts(q, directory, on_progress=on_progress)
            if not cutouts:
                raise fixtures.FixtureError(404, "NO_FRAMES", "No SPHEREx images cover this sky grid.", {"ra": ra, "dec": dec})
            frames_model, published = render_cached(q.model_dump_json(), requested_target.model_dump_json(), cutouts)
            _publish_images(published)
            final_frames = frames_model.model_dump(mode="json", exclude_unset=True).get("frames", [])
            _update_job(
                job_id,
                status="ready",
                found_count=len(final_frames),
                done_count=len(final_frames),
                frames=final_frames,
            )
            return

        payload = fixtures.frames(q)
        dumped = payload.model_dump(mode="json", exclude_unset=True) if hasattr(payload, "model_dump") else payload
        frames = dumped.get("frames", [])
        _update_job(
            job_id,
            status="ready",
            found_count=len(frames),
            done_count=len(frames),
            frames=frames,
        )
    except fixtures.FixtureError as exc:
        _update_job(job_id, status="failed", error={"code": exc.code, "message": exc.message, "details": exc.details})
    except UpstreamTimeout:
        _update_job(job_id, status="failed", error={"code": "UPSTREAM_TIMEOUT", "message": "IRSA did not respond before the deadline.", "details": {}})
    except UpstreamError:
        _update_job(job_id, status="failed", error={"code": "UPSTREAM_ERROR", "message": "Unable to retrieve SPHEREx data from IRSA.", "details": {}})
    except Exception as exc:  # noqa: BLE001
        _update_job(job_id, status="failed", error={"code": "PROCESSING_ERROR", "message": f"View job failed ({type(exc).__name__}).", "details": {}})


def _serialize_job(row: sqlite3.Row, queue_position: int = 0) -> dict[str, Any]:
    frames = json.loads(row["frames_json"] or "[]")
    err = json.loads(row["error_json"]) if row["error_json"] else None
    return {
        "job_id": row["job_id"],
        "status": row["status"],
        "progress": {
            "found": int(row["found_count"]),
            "done": int(row["done_count"]),
        },
        "queue_position": queue_position,
        "target": {
            "ra": float(row["ra"]),
            "dec": float(row["dec"]),
            "name": row["target_name"],
            "target_key": row["target_key"],
            "resolved_by": row["resolved_by"],
        },
        "detector": int(row["detector"]),
        "fov_arcmin": float(row["fov_arcmin"]),
        "frames": frames,
        "error": err,
    }


def create_view_job(
    *,
    ra: float | None = None,
    dec: float | None = None,
    name: str | None = None,
    fov_arcmin: float = 8.0,
    detector: int = 6,
    client_ip: str = "127.0.0.1",
    run_async: bool = True,
) -> dict[str, Any]:
    if fov_arcmin <= 0 or fov_arcmin > 30:
        raise ViewJobError(400, "BAD_PARAM", "fov_arcmin must be between 0 and 30.", {"fields": ["fov_arcmin"]})
    if detector < 1 or detector > 6:
        raise ViewJobError(400, "BAD_PARAM", "detector must be between 1 and 6.", {"fields": ["detector"]})

    target_name = name.strip() if name else None
    target_key: str | None = None
    resolved_by: str | None = None

    if ra is None or dec is None:
        if not target_name:
            raise ViewJobError(400, "BAD_PARAM", "Provide either (ra, dec) or name.", {"fields": ["ra", "dec", "name"]})
        resolved = resolve_target(target_name)
        ra = float(resolved["ra"])
        dec = float(resolved["dec"])
        target_name = resolved.get("name", target_name)
        target_key = resolved.get("target_key")
        resolved_by = resolved.get("resolved_by")

    key = make_idempotent_key(ra, dec, fov_arcmin, detector)
    now = time.time()

    with _db_lock, _connect() as conn:
        existing = conn.execute(
            "SELECT * FROM view_jobs WHERE idempotent_key = ? AND status != 'failed' ORDER BY created_at DESC LIMIT 1",
            (key,),
        ).fetchone()
        if existing is not None:
            ahead = conn.execute(
                "SELECT COUNT(*) AS n FROM view_jobs WHERE status IN ('queued', 'searching', 'fetching') AND created_at < ?",
                (existing["created_at"],),
            ).fetchone()["n"]
            return _serialize_job(existing, int(ahead) if existing["status"] != "ready" else 0)

        active_for_ip = conn.execute(
            "SELECT COUNT(*) AS n FROM view_jobs WHERE client_ip = ? AND status IN ('queued', 'searching', 'fetching')",
            (client_ip,),
        ).fetchone()["n"]
        if int(active_for_ip) >= MAX_CONCURRENT_PER_IP:
            raise ViewJobError(
                429,
                "TOO_MANY_JOBS",
                f"At most {MAX_CONCURRENT_PER_IP} concurrent view jobs per IP.",
                {"limit": MAX_CONCURRENT_PER_IP},
            )

        ahead_all = conn.execute(
            "SELECT COUNT(*) AS n FROM view_jobs WHERE status IN ('queued', 'searching', 'fetching')"
        ).fetchone()["n"]
        job_id = uuid.uuid4().hex[:16]
        conn.execute(
            """
            INSERT INTO view_jobs(
                job_id, idempotent_key, client_ip, status, ra, dec, fov_arcmin, detector,
                target_name, target_key, resolved_by, found_count, done_count, frames_json, created_at, updated_at
            ) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, 0, 0, '[]', ?, ?)
            """,
            (job_id, key, client_ip, ra, dec, fov_arcmin, detector, target_name, target_key, resolved_by, now, now),
        )
        conn.commit()
        created = conn.execute("SELECT * FROM view_jobs WHERE job_id = ?", (job_id,)).fetchone()

    if run_async:
        t = threading.Thread(target=_run_job, args=(job_id,), name=f"view-job-{job_id}", daemon=True)
        _worker_threads[job_id] = t
        t.start()
        return _serialize_job(created, int(ahead_all))

    _run_job(job_id)
    with _db_lock, _connect() as conn:
        done = conn.execute("SELECT * FROM view_jobs WHERE job_id = ?", (job_id,)).fetchone()
        return _serialize_job(done, 0)


def get_view_job(job_id: str) -> dict[str, Any]:
    with _db_lock, _connect() as conn:
        row = conn.execute("SELECT * FROM view_jobs WHERE job_id = ?", (job_id,)).fetchone()
        if row is None:
            raise ViewJobError(404, "JOB_NOT_FOUND", f"View job {job_id!r} not found.")
        ahead = 0
        if row["status"] in {"queued", "searching", "fetching"}:
            ahead = conn.execute(
                "SELECT COUNT(*) AS n FROM view_jobs WHERE status IN ('queued', 'searching', 'fetching') AND created_at < ?",
                (row["created_at"],),
            ).fetchone()["n"]
        return _serialize_job(row, int(ahead))
