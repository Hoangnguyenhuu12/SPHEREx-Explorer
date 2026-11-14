"""Forum settings read from the environment (root .env via dev.mjs)."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class ForumSettings:
    # Postgres connection string of the Supabase database (session pooler or
    # direct). Never exposed to the frontend.
    database_url: str | None
    # https://<project-ref>.supabase.co; issuer is <url>/auth/v1 and asymmetric
    # signing keys come from <url>/auth/v1/.well-known/jwks.json.
    supabase_url: str | None
    # Legacy HS256 JWT secret. Optional when the project uses asymmetric keys.
    jwt_secret: str | None
    jwt_audience: str
    # HMAC key for opaque pagination cursors. Generated per process when
    # unset, which only means cursors stop working after a restart.
    cursor_secret: bytes


def _clean(name: str) -> str | None:
    value = os.getenv(name, "").strip()
    return value or None


@lru_cache(maxsize=1)
def settings() -> ForumSettings:
    cursor = _clean("FORUM_CURSOR_SECRET")
    return ForumSettings(
        database_url=_clean("FORUM_DATABASE_URL"),
        supabase_url=(_clean("FORUM_SUPABASE_URL") or "").rstrip("/") or None,
        jwt_secret=_clean("FORUM_SUPABASE_JWT_SECRET"),
        jwt_audience=_clean("FORUM_SUPABASE_JWT_AUDIENCE") or "authenticated",
        cursor_secret=cursor.encode() if cursor else secrets.token_bytes(32),
    )
