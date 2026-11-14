"""Comments, reports, notifications and audit (forum-v1.1 §6)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from psycopg import Connection

from . import pagination
from .common import Actor, audit, notify
from .errors import bad_param, conflict, forbidden, invalid_state, not_found, stale
from .models import CommentCreate, CommentUpdate, ReportCreate, ReportDecision, VisibilityChange
from .posts import is_public
from .views import (
    API,
    admin_report_out,
    audit_out,
    comments_out,
    moderated_comment_out,
    notification_out,
    report_out,
)

# ----------------------------------------------------------------- comments


def _comment(conn: Connection, comment_id: UUID, lock: bool = False) -> tuple[dict, dict] | None:
    """(comment, parent post); locking takes the post first, then the comment."""
    row = conn.execute("select post_id from forum.comments where id = %s", [comment_id]).fetchone()
    if not row:
        return None
    lock_sql = " for update" if lock else ""
    post = conn.execute(
        "select * from forum.posts where id = %s" + (" for share" if lock else ""), [row["post_id"]]
    ).fetchone()
    comment = conn.execute(
        "select * from forum.comments where id = %s" + lock_sql, [comment_id]
    ).fetchone()
    return comment, post


def publicly_visible(comment: dict, post: dict) -> bool:
    return not comment["hidden"] and comment["deleted_at"] is None and is_public(post)


def list_comments(conn: Connection, post_id: UUID, limit: int, cursor: str | None) -> dict:
    post = conn.execute("select * from forum.posts where id = %s", [post_id]).fetchone()
    if not is_public(post):
        raise not_found()
    scope = f"posts/{post_id}/comments"
    after = pagination.decode(cursor, scope, {}, None)
    where = "post_id = %s and not hidden and deleted_at is null"
    params: list[Any] = [post_id]
    if after:
        where += " and (created_at, id) > (%s::timestamptz, %s::uuid)"
        params += after
    rows = conn.execute(
        f"select * from forum.comments where {where} order by created_at, id limit %s",
        [*params, limit + 1],
    ).fetchall()
    rows, keys = pagination.page(rows, limit, lambda r: [r["created_at"], r["id"]])
    return API | {
        "comments": comments_out(conn, rows),
        "next_cursor": pagination.encode(scope, {}, None, keys) if keys else None,
    }


def create_comment(
    conn: Connection, actor: Actor, post_id: UUID, body: CommentCreate
) -> tuple[int, dict]:
    # FOR SHARE blocks a concurrent hide/delete until this insert commits.
    post = conn.execute("select * from forum.posts where id = %s for share", [post_id]).fetchone()
    if not is_public(post):
        raise not_found()
    if post["published_revision_id"] != body.observed_revision_id:
        raise conflict("STALE_REVISION", published_revision_id=str(post["published_revision_id"]))
    row = conn.execute(
        "insert into forum.comments (post_id, observed_revision_id, author_id, body)"
        " values (%s, %s, %s, %s) returning *",
        [post_id, body.observed_revision_id, actor.id, body.body],
    ).fetchone()
    return 201, API | {"comment": comments_out(conn, [row])[0]}


def update_comment(conn: Connection, actor: Actor, comment_id: UUID, body: CommentUpdate) -> dict:
    found = _comment(conn, comment_id, lock=True)
    if not found:
        raise not_found()
    comment, post = found
    visible = publicly_visible(comment, post)
    if comment["author_id"] != actor.id:
        raise forbidden() if visible else not_found()
    if not visible:
        raise not_found()
    if comment["version"] != body.expected_version:
        raise stale()
    if body.body == comment["body"]:
        raise bad_param("NO_CHANGE")
    row = conn.execute(
        "update forum.comments set body = %s, version = version + 1, updated_at = now()"
        " where id = %s returning *",
        [body.body, comment_id],
    ).fetchone()
    return API | {"comment": comments_out(conn, [row])[0]}


def delete_comment(conn: Connection, actor: Actor, comment_id: UUID) -> None:
    found = _comment(conn, comment_id, lock=True)
    if not found:
        raise not_found()
    comment, post = found
    if post["deleted_at"] is not None:
        raise not_found()
    if comment["author_id"] != actor.id:
        if comment["deleted_at"] is None and (actor.is_admin or publicly_visible(comment, post)):
            raise forbidden()
        raise not_found()
    if comment["deleted_at"] is not None:
        return  # repeated author DELETE
    conn.execute(
        "update forum.comments set deleted_at = now(), version = version + 1, updated_at = now()"
        " where id = %s",
        [comment_id],
    )


def inspect_comment(conn: Connection, actor: Actor, comment_id: UUID) -> dict:
    found = _comment(conn, comment_id)
    if not found:
        raise not_found()
    comment, post = found
    if comment["deleted_at"] is not None or post["deleted_at"] is not None:
        raise not_found()
    if comment["author_id"] != actor.id and not actor.is_admin:
        raise not_found()
    return API | {"item": moderated_comment_out(conn, comment)}


def change_comment_visibility(
    conn: Connection, actor: Actor, comment_id: UUID, body: VisibilityChange
) -> tuple[int, dict]:
    found = _comment(conn, comment_id, lock=True)
    if not found:
        raise not_found()
    comment, post = found
    if comment["deleted_at"] is not None or post["deleted_at"] is not None:
        raise not_found()
    if comment["version"] != body.expected_version:
        raise stale()
    hide = body.action == "hide"
    if comment["hidden"] == hide:
        raise invalid_state()
    row = conn.execute(
        "update forum.comments set hidden = %s, visibility_action = %s, visibility_reason = %s,"
        " visibility_actor_id = %s, visibility_at = now(), version = version + 1,"
        " updated_at = now() where id = %s returning *",
        [hide, body.action, body.reason, actor.id, comment_id],
    ).fetchone()
    notify(
        conn,
        comment["author_id"],
        "comment_hidden" if hide else "comment_restored",
        post["id"],
        comment_id=comment_id,
    )
    audit(
        conn,
        actor,
        f"comment.{body.action}",
        post_id=post["id"],
        comment_id=comment_id,
        reason=body.reason,
        from_state="hidden" if comment["hidden"] else "visible",
        to_state="hidden" if hide else "visible",
    )
    return 200, API | {"item": moderated_comment_out(conn, row)}


# ------------------------------------------------------------------ reports


def _target_public(conn: Connection, target_type: str, target_id: UUID) -> bool:
    if target_type == "post":
        post = conn.execute("select * from forum.posts where id = %s", [target_id]).fetchone()
        return is_public(post)
    found = _comment(conn, target_id)
    return bool(found) and publicly_visible(*found)


def create_report(conn: Connection, actor: Actor, body: ReportCreate) -> tuple[int, dict]:
    if not _target_public(conn, body.target_type, body.target_id):
        raise not_found()
    row = conn.execute(
        "insert into forum.reports (reporter_id, target_type, target_id, reason_code, description)"
        " values (%s, %s, %s, %s, %s)"
        " on conflict (reporter_id, target_type, target_id) where status = 'open' do nothing"
        " returning *",
        [actor.id, body.target_type, body.target_id, body.reason_code, body.description],
    ).fetchone()
    if row is not None:
        return 201, API | {"report": report_out(row)}
    existing = conn.execute(
        "select * from forum.reports where reporter_id = %s and target_type = %s"
        " and target_id = %s and status = 'open'",
        [actor.id, body.target_type, body.target_id],
    ).fetchone()
    return 200, API | {"report": report_out(existing)}


def list_reports(
    conn: Connection, actor: Actor, status: str, limit: int, cursor: str | None
) -> dict:
    filters = {"status": status}
    after = pagination.decode(cursor, "admin/reports", filters, actor.id)
    where, params = "status = %s", [status]
    if after:
        where += " and (created_at, id) > (%s::timestamptz, %s::uuid)"
        params += after
    rows = conn.execute(
        f"select * from forum.reports where {where} order by created_at, id limit %s",
        [*params, limit + 1],
    ).fetchall()
    rows, keys = pagination.page(rows, limit, lambda r: [r["created_at"], r["id"]])
    return API | {
        "items": [admin_report_out(r) for r in rows],
        "next_cursor": pagination.encode("admin/reports", filters, actor.id, keys)
        if keys
        else None,
    }


def resolve_report(
    conn: Connection, actor: Actor, report_id: UUID, body: ReportDecision
) -> tuple[int, dict]:
    report = conn.execute(
        "select * from forum.reports where id = %s for update", [report_id]
    ).fetchone()
    if not report:
        raise not_found()
    if report["status"] != "open":
        raise invalid_state()
    if report["version"] != body.expected_version:
        raise stale()
    row = conn.execute(
        "update forum.reports set status = %s, resolution_reason = %s, resolved_by = %s,"
        " resolved_at = now(), version = version + 1, updated_at = now()"
        " where id = %s returning *",
        [body.decision, body.reason, actor.id, report_id],
    ).fetchone()
    post_id = comment_id = None
    if report["target_type"] == "post":
        post_id = report["target_id"]
    else:
        comment_id = report["target_id"]
        found = conn.execute(
            "select post_id from forum.comments where id = %s", [comment_id]
        ).fetchone()
        post_id = found["post_id"] if found else None
    audit(
        conn,
        actor,
        f"report.{body.decision}",
        report_id=report_id,
        post_id=post_id,
        comment_id=comment_id,
        reason=body.reason,
        from_state="open",
        to_state=body.decision,
    )
    return 200, API | {"item": admin_report_out(row)}


# ------------------------------------------------------------ notifications


def list_notifications(
    conn: Connection, actor: Actor, unread: bool | None, limit: int, cursor: str | None
) -> dict:
    filters = {"unread": unread}
    after = pagination.decode(cursor, "me/notifications", filters, actor.id)
    where, params = ["recipient_id = %s"], [actor.id]
    if unread is not None:
        where.append("read_at is null" if unread else "read_at is not null")
    if after:
        where.append("(created_at, id) < (%s::timestamptz, %s::uuid)")
        params += after
    rows = conn.execute(
        f"select * from forum.notifications where {' and '.join(where)}"
        " order by created_at desc, id desc limit %s",
        [*params, limit + 1],
    ).fetchall()
    rows, keys = pagination.page(rows, limit, lambda r: [r["created_at"], r["id"]])
    return API | {
        "notifications": [notification_out(r) for r in rows],
        "next_cursor": pagination.encode("me/notifications", filters, actor.id, keys)
        if keys
        else None,
    }


def read_notification(conn: Connection, actor: Actor, notification_id: UUID) -> dict:
    row = conn.execute(
        "update forum.notifications set read_at = coalesce(read_at, now())"
        " where id = %s and recipient_id = %s returning *",
        [notification_id, actor.id],
    ).fetchone()
    if not row:
        raise not_found()
    return API | {"notification": notification_out(row)}


# -------------------------------------------------------------------- audit


def list_audit(conn: Connection, actor: Actor, limit: int, cursor: str | None) -> dict:
    after = pagination.decode(cursor, "admin/audit-events", {}, actor.id)
    where, params = "true", []
    if after:
        where = "(created_at, id) < (%s::timestamptz, %s::uuid)"
        params = after
    rows = conn.execute(
        f"select * from forum.audit_events where {where} order by created_at desc, id desc"
        " limit %s",
        [*params, limit + 1],
    ).fetchall()
    rows, keys = pagination.page(rows, limit, lambda r: [r["created_at"], r["id"]])
    return API | {
        "events": [audit_out(r) for r in rows],
        "next_cursor": pagination.encode("admin/audit-events", {}, actor.id, keys)
        if keys
        else None,
    }
