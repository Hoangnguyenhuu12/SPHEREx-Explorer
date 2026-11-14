"""Opaque keyset cursors bound to endpoint, filters, order and identity."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import Request

from .config import settings
from .errors import bad_param

CURSOR_TTL_SECONDS = 24 * 3600


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _scope(endpoint: str, filters: dict[str, Any], identity: UUID | None) -> str:
    canonical = json.dumps(
        {"e": endpoint, "f": filters, "u": str(identity) if identity else ""},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()[:32]


def _key_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value


def encode(endpoint: str, filters: dict, identity: UUID | None, keys: list[Any]) -> str:
    payload = json.dumps(
        {
            "s": _scope(endpoint, filters, identity),
            "k": [_key_value(k) for k in keys],
            "t": int(time.time()),
        },
        separators=(",", ":"),
    ).encode()
    sig = hmac.new(settings().cursor_secret, payload, hashlib.sha256).digest()[:16]
    return f"{_b64(payload)}.{_b64(sig)}"


def decode(
    cursor: str | None, endpoint: str, filters: dict, identity: UUID | None
) -> list[Any] | None:
    if cursor is None:
        return None
    try:
        payload_text, sig_text = cursor.split(".")
        payload = _unb64(payload_text)
        expected = hmac.new(settings().cursor_secret, payload, hashlib.sha256).digest()[:16]
        if not hmac.compare_digest(expected, _unb64(sig_text)):
            raise ValueError
        data = json.loads(payload)
        if data["s"] != _scope(endpoint, filters, identity):
            raise ValueError
        if not 0 <= time.time() - data["t"] <= CURSOR_TTL_SECONDS:
            raise ValueError
        keys = data["k"]
        if not isinstance(keys, list):
            raise TypeError
        return keys
    except (ValueError, KeyError, TypeError):
        raise bad_param("INVALID_CURSOR", fields=["cursor"]) from None


def page(rows: list[dict], limit: int, key_of) -> tuple[list[dict], list[Any] | None]:
    """Split a limit+1 fetch into the page and the keys for the next cursor."""
    if len(rows) > limit:
        rows = rows[:limit]
        return rows, key_of(rows[-1])
    return rows, None


def strict_query(*allowed: str):
    """Dependency: unknown or repeated query parameters are 400."""
    allowed_set = set(allowed)

    def check(request: Request) -> None:
        params = request.query_params
        unknown = sorted(set(params.keys()) - allowed_set)
        repeated = sorted({k for k in params if len(params.getlist(k)) > 1})
        if unknown or repeated:
            raise bad_param("UNKNOWN_OR_REPEATED_PARAMETER", fields=unknown + repeated)

    return check
