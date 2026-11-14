"""Token helpers shared by forum tests (synthetic HS256 Supabase-style JWTs)."""

from __future__ import annotations

import time
import uuid

import jwt

SECRET = "forum-test-secret-with-at-least-32-bytes!!"
SUPABASE_URL = "https://forum-test.supabase.co"


def make_token(user_id: uuid.UUID, **claims) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "aud": "authenticated",
        "iss": f"{SUPABASE_URL}/auth/v1",
        "iat": now,
        "exp": now + 3600,
        "role": "authenticated",
        **claims,
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")
