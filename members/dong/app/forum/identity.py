"""Supabase access-token verification.

The token proves who the caller is. Whether the caller is an admin is read
from forum.profiles.role, never from token metadata the user can edit.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any
from uuid import UUID

import jwt
from fastapi import Request

from .config import settings
from .errors import unauthorized, unavailable

ASYMMETRIC = ("RS256", "ES256")


@dataclass(frozen=True)
class Principal:
    user_id: UUID
    is_anonymous: bool
    metadata_display_name: str | None = field(default=None, compare=False)


@lru_cache(maxsize=4)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=600, timeout=5)


def verify_token(token: str) -> Principal:
    config = settings()
    if not config.supabase_url and not config.jwt_secret:
        raise unavailable()
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise unauthorized() from None
    alg = header.get("alg")
    if alg == "HS256":
        if not config.jwt_secret:
            raise unauthorized()
        key: Any = config.jwt_secret
    elif alg in ASYMMETRIC:
        if not config.supabase_url:
            raise unauthorized()
        try:
            key = _jwks_client(f"{config.supabase_url}/auth/v1/.well-known/jwks.json")
            key = key.get_signing_key_from_jwt(token).key
        except jwt.PyJWKClientConnectionError:
            raise unavailable() from None
        except jwt.PyJWTError:
            raise unauthorized() from None
    else:
        raise unauthorized()

    options = {"require": ["exp", "sub", "aud"]}
    issuer = f"{config.supabase_url}/auth/v1" if config.supabase_url else None
    if issuer:
        options["require"].append("iss")
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience=config.jwt_audience,
            issuer=issuer,
            options=options,
            leeway=10,
        )
        user_id = UUID(str(claims["sub"]))
    except (jwt.PyJWTError, ValueError):
        raise unauthorized() from None
    if claims.get("role") not in (None, "authenticated"):
        raise unauthorized()
    metadata = claims.get("user_metadata")
    name = metadata.get("display_name") if isinstance(metadata, dict) else None
    return Principal(
        user_id=user_id,
        is_anonymous=bool(claims.get("is_anonymous", False)),
        metadata_display_name=clean_display_name(name) if isinstance(name, str) else None,
    )


def clean_display_name(value: str) -> str | None:
    name = unicodedata.normalize("NFC", value).strip()
    return name if 1 <= len(name) <= 80 else None


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if header is None:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise unauthorized()
    return token.strip()


def optional_principal(request: Request) -> Principal | None:
    """Public reads accept no token, but a supplied invalid token is 401."""
    token = _bearer(request)
    return verify_token(token) if token else None


def require_principal(request: Request) -> Principal:
    token = _bearer(request)
    if not token:
        raise unauthorized()
    return verify_token(token)
