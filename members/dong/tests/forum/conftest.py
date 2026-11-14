"""Forum tests against a real, disposable PostgreSQL.

Uses FORUM_TEST_DATABASE_URL when set (CI / local Supabase; the database is
wiped), otherwise an embedded PostgreSQL from the pgserver package. Every
response is validated against shared/api-contract/openapi-forum-v1.yaml.
"""

from __future__ import annotations

import os
import re
import shutil
import tempfile
import uuid
from pathlib import Path

import psycopg
import pytest
import yaml
from fastapi.testclient import TestClient
from forum_helpers import SECRET, SUPABASE_URL, make_token
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[4]
# Applied in filename (timestamp) order, the same order `supabase db push` uses.
MIGRATIONS = sorted((ROOT / "supabase/migrations").glob("*.sql"))
CONTRACT = ROOT / "shared/api-contract/openapi-forum-v1.yaml"
TABLES = (
    "idempotency_keys, audit_events, notifications, reports, comments, revision_tags,"
    " revisions, posts, hashtags, profiles"
)


@pytest.fixture(scope="session")
def database_url():
    url = os.getenv("FORUM_TEST_DATABASE_URL")
    if url:
        yield url
        return
    pgserver = pytest.importorskip(
        "pgserver", reason="set FORUM_TEST_DATABASE_URL or install pgserver"
    )
    workdir = Path(tempfile.mkdtemp(prefix="forum-pg-"))
    server = pgserver.get_server(workdir / "data", cleanup_mode="stop")
    try:
        yield server.get_uri()
    finally:
        server.cleanup()
        shutil.rmtree(workdir, ignore_errors=True)


@pytest.fixture(scope="session")
def migrated(database_url):
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("drop schema if exists forum cascade")
        for migration in MIGRATIONS:
            conn.execute(migration.read_text(encoding="utf-8"))
    return database_url


@pytest.fixture
def db(migrated):
    with psycopg.connect(migrated, autocommit=True) as conn:
        conn.execute(f"truncate {', '.join('forum.' + t.strip() for t in TABLES.split(','))}")
    return migrated


@pytest.fixture
def app_client(db, monkeypatch):
    monkeypatch.setenv("FORUM_SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("FORUM_SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setenv("FORUM_CURSOR_SECRET", "cursor-test-secret")
    monkeypatch.delenv("FORUM_DATABASE_URL", raising=False)
    from app.forum import config
    from app.forum import db as forum_db
    from app.main import app

    config.settings.cache_clear()
    forum_db.configure(db)
    with TestClient(app) as client:
        yield ContractClient(client)
    forum_db.configure(None)
    config.settings.cache_clear()


# ---------------------------------------------------------------- contract


def _load_contract():
    doc = yaml.safe_load(CONTRACT.read_text(encoding="utf-8"))
    routes = []
    for template, item in doc["paths"].items():
        pattern = re.compile("^" + re.sub(r"\{[^}]+\}", "[^/]+", template) + "$")
        for method, op in item.items():
            routes.append((method.upper(), pattern, op))
    return doc, routes


CONTRACT_DOC, CONTRACT_ROUTES = _load_contract()


def response_schema(method: str, path: str, status: int) -> dict | None:
    for m, pattern, op in CONTRACT_ROUTES:
        if m == method and pattern.match(path):
            response = op["responses"].get(str(status))
            assert response is not None, f"{method} {path} returned undocumented {status}"
            if "$ref" in response:
                response = CONTRACT_DOC["components"]["responses"][response["$ref"].split("/")[-1]]
            content = response.get("content")
            return content["application/json"]["schema"] if content else None
    raise AssertionError(f"{method} {path} is not in the forum contract")


class ContractClient:
    """TestClient wrapper asserting every response matches the forum contract."""

    def __init__(self, client: TestClient):
        self.raw = client

    def request(self, method: str, path: str, *, token: str | None = None, key=None, **kwargs):
        headers = dict(kwargs.pop("headers", {}) or {})
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if method == "POST" and key is not False:
            headers.setdefault("Idempotency-Key", str(key or uuid.uuid4()))
        response = self.raw.request(method, path, headers=headers, **kwargs)
        assert response.headers.get("cache-control") == "no-store", path
        schema = response_schema(method, path.split("?")[0], response.status_code)
        if schema is None:
            assert response.content == b""
        else:
            Draft202012Validator({**schema, "components": CONTRACT_DOC["components"]}).validate(
                response.json()
            )
        if response.status_code == 401:
            assert response.headers.get("www-authenticate") == "Bearer"
        return response

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, **kw):
        return self.request("POST", path, **kw)

    def patch(self, path, **kw):
        return self.request("PATCH", path, **kw)

    def delete(self, path, **kw):
        return self.request("DELETE", path, **kw)


# ------------------------------------------------------------------ users


class User:
    def __init__(self, client: ContractClient, name: str | None, role: str = "user"):
        self.id = uuid.uuid4()
        self.token = make_token(self.id)
        self.client = client
        if name:
            assert (
                client.patch(
                    "/api/forum/me", token=self.token, json={"display_name": name}
                ).status_code
                == 200
            )
        else:
            assert client.get("/api/forum/me", token=self.token).status_code == 200
        if role == "admin":
            set_role(self.id, "admin")

    def __getattr__(self, method):
        if method not in ("get", "post", "patch", "delete"):
            raise AttributeError(method)
        return lambda path, **kw: getattr(self.client, method)(path, token=self.token, **kw)


_DB_URL: dict[str, str] = {}


def set_role(user_id, role):
    with psycopg.connect(_DB_URL["url"], autocommit=True) as conn:
        conn.execute("update forum.profiles set role = %s where id = %s", [role, user_id])


@pytest.fixture
def users(app_client, db):
    _DB_URL["url"] = db

    class Factory:
        def __call__(self, name="Sky observer", role="user"):
            return User(app_client, name, role)

    return Factory()


@pytest.fixture
def sql(db):
    def run(query, params=None):
        with psycopg.connect(db, autocommit=True) as conn:
            cur = conn.execute(query, params)
            return cur.fetchall() if cur.description else None

    return run
