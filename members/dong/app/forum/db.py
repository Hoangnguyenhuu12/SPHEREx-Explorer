"""Postgres access. One request = one transaction; failure rolls everything back."""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

from .config import settings
from .errors import unavailable

_lock = threading.Lock()
_pool: ConnectionPool | None = None
_pool_url: str | None = None


def configure(url: str | None) -> None:
    """Replace the pool (tests, or after settings change)."""
    global _pool, _pool_url
    with _lock:
        if _pool is not None:
            _pool.close()
        _pool, _pool_url = None, url


def _get_pool() -> ConnectionPool:
    global _pool, _pool_url
    with _lock:
        if _pool is None:
            url = _pool_url or settings().database_url
            if not url:
                raise unavailable()
            _pool_url = url
            _pool = ConnectionPool(
                url,
                min_size=1,
                max_size=10,
                timeout=10,
                open=True,
                # prepare_threshold=None keeps the Supabase transaction pooler working.
                kwargs={"row_factory": dict_row, "prepare_threshold": None},
            )
        return _pool


@contextmanager
def transaction() -> Iterator[psycopg.Connection]:
    """Commit when the block succeeds; roll back on any exception."""
    try:
        pool = _get_pool()
        with pool.connection() as conn, conn.transaction():
            yield conn
    except (psycopg.OperationalError, PoolTimeout):
        raise unavailable() from None
