"""Row loaders and serializers producing forum-v1.1 response shapes."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from psycopg import Connection

API = {"api_version": "0.1"}


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def sid(value: UUID | None) -> str | None:
    return None if value is None else str(value)


# ---------------------------------------------------------------- loaders


def load_authors(conn: Connection, ids: Iterable[UUID]) -> dict[UUID, dict]:
    ids = list(set(ids))
    if not ids:
        return {}
    rows = conn.execute(
        "select id, display_name from forum.profiles where id = any(%s)", [ids]
    ).fetchall()
    return {
        r["id"]: {"id": str(r["id"]), "display_name": r["display_name"] or "Observer"} for r in rows
    }


def load_revisions(conn: Connection, ids: Iterable[UUID | None]) -> dict[UUID, dict]:
    ids = [i for i in set(ids) if i is not None]
    if not ids:
        return {}
    rows = conn.execute("select * from forum.revisions where id = any(%s)", [ids]).fetchall()
    return {r["id"]: r for r in rows}


def load_tag_ids(conn: Connection, revision_ids: Iterable[UUID]) -> dict[UUID, list[UUID]]:
    ids = list(set(revision_ids))
    result: dict[UUID, list[UUID]] = {i: [] for i in ids}
    if not ids:
        return result
    rows = conn.execute(
        "select revision_id, hashtag_id from forum.revision_tags"
        " where revision_id = any(%s) order by revision_id, position",
        [ids],
    ).fetchall()
    for r in rows:
        result[r["revision_id"]].append(r["hashtag_id"])
    return result


def load_tags(conn: Connection, ids: Iterable[UUID]) -> dict[UUID, dict]:
    ids = list(set(ids))
    if not ids:
        return {}
    rows = conn.execute("select * from forum.hashtags where id = any(%s)", [ids]).fetchall()
    return {r["id"]: r for r in rows}


# ------------------------------------------------------------ serializers


def tag_out(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "slug": row["slug"],
        "display_name": row["display_name"],
        "active": row["active"],
        "version": row["version"],
    }


def revision_out(row: dict, tag_ids: list[UUID]) -> dict:
    return {
        "id": str(row["id"]),
        "post_id": str(row["post_id"]),
        "number": row["number"],
        "status": row["status"],
        "version": row["version"],
        "title": row["title"],
        "body": row["body"],
        "hashtag_ids": [str(t) for t in tag_ids],
        "links": row["links"],
        "sky_context": row["sky_context"],
        "created_at": iso(row["created_at"]),
        "updated_at": iso(row["updated_at"]),
        "submitted_at": iso(row["submitted_at"]),
        "reviewed_at": iso(row["reviewed_at"]),
        "reviewed_by": sid(row["reviewed_by"]),
        "rejection_reason": row["rejection_reason"],
        "withdrawn_at": iso(row["withdrawn_at"]),
    }


def visibility_reason_out(row: dict) -> dict | None:
    if row["visibility_action"] is None:
        return None
    return {
        "action": row["visibility_action"],
        "reason": row["visibility_reason"],
        "actor_id": str(row["visibility_actor_id"]),
        "at": iso(row["visibility_at"]),
    }


def post_state_out(row: dict, author: dict) -> dict:
    return {
        "id": str(row["id"]),
        "author": author,
        "visibility": row["visibility"],
        "version": row["version"],
        "published_revision_id": sid(row["published_revision_id"]),
        "working_revision_id": sid(row["working_revision_id"]),
        "published_at": iso(row["published_at"]),
        "edited_at": iso(row["edited_at"]),
        "created_at": iso(row["created_at"]),
        "updated_at": iso(row["updated_at"]),
        "visibility_reason": visibility_reason_out(row),
    }


def workspaces_out(conn: Connection, posts: list[dict]) -> list[dict]:
    """Workspace objects for posts, loading related rows in bulk."""
    authors = load_authors(conn, (p["author_id"] for p in posts))
    revisions = load_revisions(
        conn,
        [p["published_revision_id"] for p in posts] + [p["working_revision_id"] for p in posts],
    )
    tag_ids = load_tag_ids(conn, revisions.keys())
    tags = load_tags(conn, (t for ids in tag_ids.values() for t in ids))
    result = []
    for p in posts:
        published = revisions.get(p["published_revision_id"])
        working = revisions.get(p["working_revision_id"])
        referenced = _ordered_unique(t for r in (published, working) if r for t in tag_ids[r["id"]])
        result.append(
            {
                "post": post_state_out(p, authors[p["author_id"]]),
                "published_revision": revision_out(published, tag_ids[published["id"]])
                if published
                else None,
                "working_revision": revision_out(working, tag_ids[working["id"]])
                if working
                else None,
                "hashtags": [tag_out(tags[t]) for t in referenced],
            }
        )
    return result


def workspace_out(conn: Connection, post: dict) -> dict:
    return workspaces_out(conn, [post])[0]


def public_posts_out(conn: Connection, posts: list[dict]) -> list[dict]:
    authors = load_authors(conn, (p["author_id"] for p in posts))
    revisions = load_revisions(conn, (p["published_revision_id"] for p in posts))
    tag_ids = load_tag_ids(conn, revisions.keys())
    tags = load_tags(conn, (t for ids in tag_ids.values() for t in ids))
    out = []
    for p in posts:
        r = revisions[p["published_revision_id"]]
        out.append(
            {
                "id": str(p["id"]),
                "author": authors[p["author_id"]],
                "published_revision_id": str(r["id"]),
                "title": r["title"],
                "body": r["body"],
                "hashtags": [tag_out(tags[t]) for t in tag_ids[r["id"]]],
                "links": r["links"],
                "sky_context": r["sky_context"],
                "published_at": iso(p["published_at"]),
                "edited_at": iso(p["edited_at"]),
            }
        )
    return out


def comments_out(conn: Connection, rows: list[dict]) -> list[dict]:
    authors = load_authors(conn, (c["author_id"] for c in rows))
    return [
        {
            "id": str(c["id"]),
            "post_id": str(c["post_id"]),
            "observed_revision_id": str(c["observed_revision_id"]),
            "author": authors[c["author_id"]],
            "body": c["body"],
            "version": c["version"],
            "created_at": iso(c["created_at"]),
            "updated_at": iso(c["updated_at"]),
        }
        for c in rows
    ]


def moderated_comment_out(conn: Connection, row: dict) -> dict:
    return {
        "comment": comments_out(conn, [row])[0],
        "visibility": "hidden" if row["hidden"] else "visible",
        "visibility_reason": visibility_reason_out(row),
    }


def report_out(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "target_type": row["target_type"],
        "target_id": str(row["target_id"]),
        "reason_code": row["reason_code"],
        "description": row["description"],
        "status": row["status"],
        "version": row["version"],
        "created_at": iso(row["created_at"]),
        "updated_at": iso(row["updated_at"]),
    }


def admin_report_out(row: dict) -> dict:
    return {
        "report": report_out(row),
        "reporter_id": str(row["reporter_id"]),
        "resolution_reason": row["resolution_reason"],
        "resolved_by": sid(row["resolved_by"]),
        "resolved_at": iso(row["resolved_at"]),
    }


def notification_out(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "type": row["type"],
        "post_id": str(row["post_id"]),
        "revision_id": sid(row["revision_id"]),
        "comment_id": sid(row["comment_id"]),
        "created_at": iso(row["created_at"]),
        "read_at": iso(row["read_at"]),
    }


def audit_out(row: dict) -> dict:
    return {
        key: (sid(row[key]) if key == "id" or key.endswith("_id") else row[key])
        for key in (
            "id",
            "actor_id",
            "action",
            "post_id",
            "revision_id",
            "comment_id",
            "report_id",
            "hashtag_id",
            "reason",
            "from_state",
            "to_state",
        )
    } | {"created_at": iso(row["created_at"])}


def _ordered_unique(values: Iterable[Any]) -> list[Any]:
    seen: dict[Any, None] = {}
    for v in values:
        seen.setdefault(v, None)
    return list(seen)
