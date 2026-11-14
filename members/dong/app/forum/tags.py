"""Profile and managed hashtag catalog (forum-v1.1 §2, §7)."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from psycopg import Connection

from . import pagination
from .common import Actor, audit
from .errors import bad_param, conflict, not_found, stale
from .models import ProfileUpdate, TagCreate, TagUpdate
from .views import API, tag_out

SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def normalize_slug(value: str) -> str | None:
    """Trim, lowercase and drop one leading '#'; None when the result is invalid."""
    slug = value.strip().lower().removeprefix("#")
    return slug if 1 <= len(slug) <= 40 and SLUG.fullmatch(slug) and slug.isascii() else None


# ----------------------------------------------------------------- profile


def me_out(actor: Actor) -> dict:
    return API | {
        "profile": {"id": str(actor.id), "display_name": actor.display_name},
        "role": actor.role,
    }


def update_profile(conn: Connection, actor: Actor, body: ProfileUpdate) -> dict:
    if body.display_name != actor.display_name:
        conn.execute(
            "update forum.profiles set display_name = %s, updated_at = now() where id = %s",
            [body.display_name, actor.id],
        )
    return me_out(Actor(actor.id, body.display_name, actor.role, actor.is_anonymous))


# ----------------------------------------------------------------- catalog


def list_tags(conn: Connection, active: bool | None, limit: int, cursor: str | None) -> dict:
    filters = {"active": active}
    after = pagination.decode(cursor, "hashtags", filters, None)
    where, params = ["true"], []
    if active is not None:
        where.append("h.active = %s")
        params.append(active)
    if after:
        where.append("(h.slug, h.id) > (%s, %s::uuid)")
        params += after
    rows = conn.execute(
        "select h.*, (select count(distinct p.id) from forum.posts p"
        "   join forum.revision_tags rt on rt.revision_id = p.published_revision_id"
        "   where rt.hashtag_id = h.id and p.visibility = 'published' and p.deleted_at is null"
        " ) as published_post_count"
        f" from forum.hashtags h where {' and '.join(where)} order by h.slug, h.id limit %s",
        [*params, limit + 1],
    ).fetchall()
    rows, keys = pagination.page(rows, limit, lambda r: [r["slug"], r["id"]])
    return API | {
        "hashtags": [
            {"tag": tag_out(r), "published_post_count": r["published_post_count"]} for r in rows
        ],
        "next_cursor": pagination.encode("hashtags", filters, None, keys) if keys else None,
    }


def create_tag(conn: Connection, actor: Actor, body: TagCreate) -> tuple[int, dict[str, Any]]:
    slug = normalize_slug(body.slug)
    if slug is None:
        raise bad_param("INVALID_SLUG", fields=["slug"])
    row = conn.execute(
        "insert into forum.hashtags (slug, display_name) values (%s, %s)"
        " on conflict (slug) do nothing returning *",
        [slug, body.display_name],
    ).fetchone()
    if row is None:
        raise conflict("DUPLICATE_SLUG", slug=slug)
    audit(conn, actor, "hashtag.create", hashtag_id=row["id"], to_state="active")
    return 201, API | {"hashtag": tag_out(row)}


def update_tag(conn: Connection, actor: Actor, tag_id: UUID, body: TagUpdate) -> dict:
    row = conn.execute("select * from forum.hashtags where id = %s for update", [tag_id]).fetchone()
    if row is None:
        raise not_found()
    if row["version"] != body.expected_version:
        raise stale()
    name = body.display_name if body.display_name is not None else row["display_name"]
    active = body.active if body.active is not None else row["active"]
    if (name, active) == (row["display_name"], row["active"]):
        raise bad_param("NO_CHANGE")
    updated = conn.execute(
        "update forum.hashtags set display_name = %s, active = %s, version = version + 1,"
        " updated_at = now() where id = %s returning *",
        [name, active, tag_id],
    ).fetchone()

    def state(r):
        return "active" if r["active"] else "inactive"

    audit(
        conn,
        actor,
        "hashtag.update",
        hashtag_id=tag_id,
        from_state=state(row),
        to_state=state(updated),
    )
    return API | {"hashtag": tag_out(updated)}
