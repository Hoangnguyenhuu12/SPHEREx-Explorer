"""Shared transaction helpers: actor resolution, audit, notifications, idempotency."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg.types.json import Jsonb

from .errors import conflict, forbidden
from .identity import Principal


@dataclass(frozen=True)
class Actor:
    id: UUID
    display_name: str | None
    role: str
    is_anonymous: bool

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def resolve_actor(conn: Connection, principal: Principal) -> Actor:
    """Load (creating on first sight) the caller's profile; role comes from the DB only."""
    conn.execute(
        "insert into forum.profiles (id, display_name) values (%s, %s) on conflict (id) do nothing",
        [principal.user_id, principal.metadata_display_name],
    )
    row = conn.execute(
        "select id, display_name, role from forum.profiles where id = %s", [principal.user_id]
    ).fetchone()
    return Actor(row["id"], row["display_name"], row["role"], principal.is_anonymous)


def contributor(conn: Connection, principal: Principal) -> Actor:
    actor = resolve_actor(conn, principal)
    if actor.is_anonymous:
        raise forbidden("CONFIRMED_ACCOUNT_REQUIRED")
    if not actor.display_name:
        raise forbidden("PROFILE_REQUIRED")
    return actor


def admin(conn: Connection, principal: Principal) -> Actor:
    actor = resolve_actor(conn, principal)
    if not actor.is_admin or actor.is_anonymous:
        raise forbidden()
    return actor


def audit(
    conn: Connection,
    actor: Actor,
    action: str,
    *,
    post_id: UUID | None = None,
    revision_id: UUID | None = None,
    comment_id: UUID | None = None,
    report_id: UUID | None = None,
    hashtag_id: UUID | None = None,
    reason: str | None = None,
    from_state: str | None = None,
    to_state: str | None = None,
) -> None:
    conn.execute(
        "insert into forum.audit_events (actor_id, action, post_id, revision_id, comment_id,"
        " report_id, hashtag_id, reason, from_state, to_state)"
        " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        [
            actor.id,
            action,
            post_id,
            revision_id,
            comment_id,
            report_id,
            hashtag_id,
            reason,
            from_state,
            to_state,
        ],
    )


def notify(
    conn: Connection,
    recipient: UUID,
    kind: str,
    post_id: UUID,
    revision_id: UUID | None = None,
    comment_id: UUID | None = None,
) -> None:
    conn.execute(
        "insert into forum.notifications (recipient_id, type, post_id, revision_id, comment_id)"
        " values (%s, %s, %s, %s, %s)",
        [recipient, kind, post_id, revision_id, comment_id],
    )


def request_hash(payload: Any) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


Result = tuple[int, dict | None]


def idempotent(
    conn: Connection,
    actor: Actor,
    operation: str,
    resource: str,
    key: UUID,
    payload: Any,
    action: Callable[[], Result],
    recheck: Callable[[], None] | None = None,
) -> Result:
    """Run a POST once per (actor, operation, resource, key).

    The record is written in the caller's transaction, so it exists exactly
    when the business change committed. A concurrent request holding the same
    key gets 409 instead of waiting; a completed one replays its response.
    """
    digest = request_hash(payload)
    lock_name = f"{actor.id}|{operation}|{resource}|{key}"
    got = conn.execute(
        "select pg_try_advisory_xact_lock(hashtextextended(%s, 0)) as ok", [lock_name]
    ).fetchone()["ok"]
    if not got:
        raise conflict("IDEMPOTENCY_CONFLICT", state="in_flight")
    row = conn.execute(
        "select request_hash, response_status, response_body from forum.idempotency_keys"
        " where actor_id = %s and operation = %s and resource = %s and key = %s",
        [actor.id, operation, resource, key],
    ).fetchone()
    if row:
        if row["request_hash"] != digest:
            raise conflict("IDEMPOTENCY_CONFLICT", state="payload_mismatch")
        if recheck:
            recheck()  # replay only while the caller may still access the resource
        return row["response_status"], row["response_body"]
    status, body = action()
    conn.execute(
        "insert into forum.idempotency_keys"
        " (actor_id, operation, resource, key, request_hash, response_status, response_body)"
        " values (%s, %s, %s, %s, %s, %s, %s)",
        [actor.id, operation, resource, key, digest, status, Jsonb(body)],
    )
    return status, body
