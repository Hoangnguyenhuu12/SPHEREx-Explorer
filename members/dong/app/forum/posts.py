"""Posts, immutable revisions, review and post visibility (forum-v1.1 §4-5)."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from psycopg import Connection
from psycopg.types.json import Jsonb

from . import pagination
from .common import Actor, audit, notify
from .errors import bad_param, conflict, forbidden, invalid_state, not_found, stale
from .models import (
    BODY_RANGE,
    TAG_RANGE,
    TITLE_RANGE,
    Approve,
    DraftCreate,
    DraftUpdate,
    RevisionCreate,
    Transition,
    VisibilityChange,
    clean,
)
from .tags import normalize_slug
from .views import (
    API,
    load_tag_ids,
    load_tags,
    public_posts_out,
    revision_out,
    workspace_out,
    workspaces_out,
)

# ------------------------------------------------------------------ access


def _post(conn: Connection, post_id: UUID, lock: bool = False) -> dict | None:
    sql = "select * from forum.posts where id = %s" + (" for update" if lock else "")
    return conn.execute(sql, [post_id]).fetchone()


def is_public(post: dict | None) -> bool:
    return bool(post) and post["visibility"] == "published" and post["deleted_at"] is None


def author_post(conn: Connection, actor: Actor, post_id: UUID, lock: bool = True) -> dict:
    """Post the caller may change as its author.

    Deleted or private foreign posts are 404; a foreign post the caller can
    see (public, or any post for an admin) is 403.
    """
    post = _post(conn, post_id, lock)
    if not post or post["deleted_at"] is not None:
        raise not_found()
    if post["author_id"] == actor.id:
        return post
    if actor.is_admin or post["visibility"] == "published":
        raise forbidden()
    raise not_found()


def viewer_post(conn: Connection, actor: Actor, post_id: UUID, lock: bool = False) -> dict:
    """Post whose private workspace the caller (author or admin) may read."""
    post = _post(conn, post_id, lock)
    if not post or post["deleted_at"] is not None:
        raise not_found()
    if post["author_id"] != actor.id and not actor.is_admin:
        raise not_found()
    return post


def _revision(conn: Connection, post_id: UUID, revision_id: UUID, lock: bool = False) -> dict:
    sql = "select * from forum.revisions where id = %s and post_id = %s"
    row = conn.execute(sql + (" for update" if lock else ""), [revision_id, post_id]).fetchone()
    if not row:
        raise not_found()
    return row


def _bump_post(conn: Connection, post_id: UUID, **changes: Any) -> None:
    sets = ", ".join(f"{k} = %s" for k in changes)
    sql = "update forum.posts set version = version + 1, updated_at = now()"
    conn.execute(
        sql + (", " + sets if sets else "") + " where id = %s", [*changes.values(), post_id]
    )


def _bump_revision(conn: Connection, revision_id: UUID, sql_sets: str = "", params=()) -> None:
    sql = "update forum.revisions set version = version + 1, updated_at = now()"
    conn.execute(
        sql + (", " + sql_sets if sql_sets else "") + " where id = %s", [*params, revision_id]
    )


def _workspace(conn: Connection, post_id: UUID) -> dict:
    return API | {"workspace": workspace_out(conn, _post(conn, post_id))}


# -------------------------------------------------------------- tag rules


def check_draft_tags(conn: Connection, new_ids: list[UUID], previous: list[UUID]) -> None:
    """Unknown ids are 400; newly selected inactive ids are 400.

    Inactive ids already present (copied or unchanged) may stay in a draft
    until submission, where every tag must be active.
    """
    tags = load_tags(conn, new_ids)
    unknown = [str(t) for t in new_ids if t not in tags]
    if unknown:
        raise bad_param("UNKNOWN_HASHTAG", fields=["hashtag_ids"], hashtag_ids=unknown)
    inactive = [str(t) for t in new_ids if not tags[t]["active"] and t not in previous]
    if inactive:
        raise bad_param("INACTIVE_HASHTAG", fields=["hashtag_ids"], hashtag_ids=inactive)


def _inactive(conn: Connection, ids: list[UUID]) -> list[str]:
    tags = load_tags(conn, ids)
    return [str(t) for t in ids if not tags[t]["active"]]


def _write_tags(conn: Connection, revision_id: UUID, ids: list[UUID]) -> None:
    conn.execute("delete from forum.revision_tags where revision_id = %s", [revision_id])
    for position, tag_id in enumerate(ids):
        conn.execute(
            "insert into forum.revision_tags (revision_id, hashtag_id, position) values (%s, %s, %s)",
            [revision_id, tag_id, position],
        )


# ------------------------------------------------------------ public reads


def list_public(
    conn: Connection, q: str | None, hashtag: str | None, limit: int, cursor: str | None
) -> dict:
    keyword = clean(q or "")
    slug = None
    if hashtag is not None:
        slug = normalize_slug(hashtag)
        if slug is None:
            raise bad_param("INVALID_HASHTAG", fields=["hashtag"])
    filters = {"q": keyword, "hashtag": slug}
    after = pagination.decode(cursor, "posts", filters, None)

    where = ["p.visibility = 'published'", "p.deleted_at is null"]
    params: list[Any] = []
    if keyword:
        # Literal, case-insensitive, accent-sensitive substring: strpos has no wildcards.
        where.append(
            "(strpos(lower(r.title), lower(%s)) > 0 or strpos(lower(r.body), lower(%s)) > 0)"
        )
        params += [keyword, keyword]
    if slug:
        where.append(
            "exists (select 1 from forum.revision_tags rt join forum.hashtags h on h.id = rt.hashtag_id"
            " where rt.revision_id = p.published_revision_id and h.slug = %s)"
        )
        params.append(slug)
    if after:
        where.append("(p.published_at, p.id) < (%s::timestamptz, %s::uuid)")
        params += after
    rows = conn.execute(
        "select p.* from forum.posts p join forum.revisions r on r.id = p.published_revision_id"
        f" where {' and '.join(where)} order by p.published_at desc, p.id desc limit %s",
        [*params, limit + 1],
    ).fetchall()
    rows, keys = pagination.page(rows, limit, lambda r: [r["published_at"], r["id"]])
    return API | {
        "posts": public_posts_out(conn, rows),
        "next_cursor": pagination.encode("posts", filters, None, keys) if keys else None,
    }


def get_public(conn: Connection, post_id: UUID) -> dict:
    post = _post(conn, post_id)
    if not is_public(post):
        raise not_found()
    return API | {"post": public_posts_out(conn, [post])[0]}


# ------------------------------------------------------------- author side


def create_post(conn: Connection, actor: Actor, body: DraftCreate) -> tuple[int, dict]:
    check_draft_tags(conn, body.hashtag_ids, [])
    post_id, revision_id = uuid4(), uuid4()
    conn.execute(
        "insert into forum.posts (id, author_id, working_revision_id) values (%s, %s, %s)",
        [post_id, actor.id, revision_id],
    )
    conn.execute(
        "insert into forum.revisions (id, post_id, number, title, body, links, sky_context)"
        " values (%s, %s, 1, %s, %s, %s, %s)",
        [
            revision_id,
            post_id,
            clean(body.title),
            clean(body.body),
            Jsonb([link.model_dump() for link in body.links]),
            Jsonb(body.sky_context.stored()) if body.sky_context else None,
        ],
    )
    _write_tags(conn, revision_id, body.hashtag_ids)
    return 201, _workspace(conn, post_id)


def update_draft(
    conn: Connection, actor: Actor, post_id: UUID, revision_id: UUID, body: DraftUpdate
) -> tuple[int, dict]:
    author_post(conn, actor, post_id)
    rev = _revision(conn, post_id, revision_id, lock=True)
    if rev["status"] != "draft":
        raise invalid_state()
    if rev["version"] != body.expected_version:
        raise stale()
    current_tags = load_tag_ids(conn, [revision_id])[revision_id]
    given = body.model_fields_set

    title = clean(body.title) if "title" in given else rev["title"]
    text = clean(body.body) if "body" in given else rev["body"]
    links = [link.model_dump() for link in body.links] if "links" in given else rev["links"]
    if "sky_context" in given:
        sky = body.sky_context.stored() if body.sky_context else None
    else:
        sky = rev["sky_context"]
    tags = body.hashtag_ids if "hashtag_ids" in given else current_tags
    if tags != current_tags:
        check_draft_tags(conn, tags, current_tags)

    if (title, text, links, sky, tags) == (
        rev["title"],
        rev["body"],
        rev["links"],
        rev["sky_context"],
        current_tags,
    ):
        raise bad_param("NO_CHANGE")
    _bump_revision(
        conn,
        revision_id,
        "title = %s, body = %s, links = %s, sky_context = %s",
        [title, text, Jsonb(links), Jsonb(sky) if sky is not None else None],
    )
    if tags != current_tags:
        _write_tags(conn, revision_id, tags)
    _bump_post(conn, post_id)
    return 200, _workspace(conn, post_id)


def _check_transition(post: dict, rev: dict, body: Transition, status: str) -> None:
    if rev["status"] != status or post["working_revision_id"] != rev["id"]:
        raise invalid_state()
    if (
        rev["version"] != body.expected_revision_version
        or post["version"] != body.expected_post_version
    ):
        raise stale()


def submit(
    conn: Connection, actor: Actor, post_id: UUID, revision_id: UUID, body: Transition
) -> tuple[int, dict]:
    post = author_post(conn, actor, post_id)
    rev = _revision(conn, post_id, revision_id, lock=True)
    _check_transition(post, rev, body, "draft")

    tag_ids = load_tag_ids(conn, [revision_id])[revision_id]
    problems = []
    if not TITLE_RANGE[0] <= len(rev["title"]) <= TITLE_RANGE[1]:
        problems.append("title")
    if not BODY_RANGE[0] <= len(rev["body"]) <= BODY_RANGE[1]:
        problems.append("body")
    if not TAG_RANGE[0] <= len(tag_ids) <= TAG_RANGE[1]:
        problems.append("hashtag_ids")
    if problems:
        raise bad_param("SUBMISSION_INCOMPLETE", fields=problems)
    inactive = _inactive(conn, tag_ids)
    if inactive:
        raise conflict("INACTIVE_HASHTAG", hashtag_ids=inactive)

    _bump_revision(conn, revision_id, "status = 'pending', submitted_at = now()")
    _bump_post(conn, post_id)
    notify(conn, actor.id, "submission_received", post_id, revision_id)
    audit(
        conn,
        actor,
        "revision.submit",
        post_id=post_id,
        revision_id=revision_id,
        from_state="draft",
        to_state="pending",
    )
    return 200, _workspace(conn, post_id)


def withdraw(
    conn: Connection, actor: Actor, post_id: UUID, revision_id: UUID, body: Transition
) -> tuple[int, dict]:
    post = author_post(conn, actor, post_id)
    rev = _revision(conn, post_id, revision_id, lock=True)
    _check_transition(post, rev, body, "pending")
    _bump_revision(conn, revision_id, "status = 'withdrawn', withdrawn_at = now()")
    _bump_post(conn, post_id, working_revision_id=None)
    audit(
        conn,
        actor,
        "revision.withdraw",
        post_id=post_id,
        revision_id=revision_id,
        from_state="pending",
        to_state="withdrawn",
    )
    return 200, _workspace(conn, post_id)


def create_revision(
    conn: Connection, actor: Actor, post_id: UUID, body: RevisionCreate
) -> tuple[int, dict]:
    post = author_post(conn, actor, post_id)
    if post["version"] != body.expected_post_version:
        raise stale()
    if post["working_revision_id"] is not None:
        raise conflict("INVALID_STATE", detail="ACTIVE_REVISION_EXISTS")
    base = conn.execute(
        "select * from forum.revisions where id = %s and post_id = %s",
        [body.base_revision_id, post_id],
    ).fetchone()
    if not base:
        raise bad_param("UNKNOWN_BASE_REVISION", fields=["base_revision_id"])
    if base["status"] not in ("approved", "rejected", "withdrawn"):
        raise invalid_state()
    number = conn.execute(
        "select max(number) + 1 as n from forum.revisions where post_id = %s", [post_id]
    ).fetchone()["n"]
    new_id = uuid4()
    conn.execute(
        "insert into forum.revisions (id, post_id, number, title, body, links, sky_context)"
        " values (%s, %s, %s, %s, %s, %s, %s)",
        [
            new_id,
            post_id,
            number,
            base["title"],
            base["body"],
            Jsonb(base["links"]),
            Jsonb(base["sky_context"]) if base["sky_context"] is not None else None,
        ],
    )
    _write_tags(conn, new_id, load_tag_ids(conn, [base["id"]])[base["id"]])
    _bump_post(conn, post_id, working_revision_id=new_id)
    return 201, _workspace(conn, post_id)


def delete_post(conn: Connection, actor: Actor, post_id: UUID) -> None:
    post = _post(conn, post_id, lock=True)
    if not post:
        raise not_found()
    if post["author_id"] != actor.id:
        if post["deleted_at"] is None and (actor.is_admin or post["visibility"] == "published"):
            raise forbidden()
        raise not_found()
    if post["deleted_at"] is not None:
        return  # repeated author DELETE
    working = post["working_revision_id"]
    if working:
        rev = _revision(conn, post_id, working, lock=True)
        if rev["status"] == "pending":
            _bump_revision(conn, working, "status = 'withdrawn', withdrawn_at = now()")
            audit(
                conn,
                actor,
                "revision.withdraw",
                post_id=post_id,
                revision_id=working,
                from_state="pending",
                to_state="withdrawn",
                reason="Post deleted by author.",
            )
            working = None
    conn.execute(
        "update forum.posts set deleted_at = now(), working_revision_id = %s,"
        " version = version + 1, updated_at = now() where id = %s",
        [working, post_id],
    )
    audit(
        conn,
        actor,
        "post.delete",
        post_id=post_id,
        from_state=post["visibility"],
        to_state="deleted",
    )


def list_own(
    conn: Connection,
    actor: Actor,
    visibility: str | None,
    revision_status: str | None,
    limit: int,
    cursor: str | None,
) -> dict:
    filters = {"visibility": visibility, "revision_status": revision_status}
    after = pagination.decode(cursor, "me/posts", filters, actor.id)
    where = ["p.author_id = %s", "p.deleted_at is null"]
    params: list[Any] = [actor.id]
    if visibility:
        where.append("p.visibility = %s")
        params.append(visibility)
    if revision_status:
        where.append(
            "(select r.status from forum.revisions r where r.post_id = p.id"
            " order by r.number desc limit 1) = %s"
        )
        params.append(revision_status)
    if after:
        where.append("(p.updated_at, p.id) < (%s::timestamptz, %s::uuid)")
        params += after
    rows = conn.execute(
        f"select p.* from forum.posts p where {' and '.join(where)}"
        " order by p.updated_at desc, p.id desc limit %s",
        [*params, limit + 1],
    ).fetchall()
    rows, keys = pagination.page(rows, limit, lambda r: [r["updated_at"], r["id"]])
    return API | {
        "items": workspaces_out(conn, rows),
        "next_cursor": pagination.encode("me/posts", filters, actor.id, keys) if keys else None,
    }


def get_workspace(conn: Connection, actor: Actor, post_id: UUID) -> dict:
    return API | {"workspace": workspace_out(conn, viewer_post(conn, actor, post_id))}


def list_revisions(
    conn: Connection, actor: Actor, post_id: UUID, limit: int, cursor: str | None
) -> dict:
    viewer_post(conn, actor, post_id)
    scope = f"posts/{post_id}/revisions"
    after = pagination.decode(cursor, scope, {}, actor.id)
    params: list[Any] = [post_id]
    where = "post_id = %s"
    if after:
        where += " and (number, id) < (%s::integer, %s::uuid)"
        params += after
    rows = conn.execute(
        f"select * from forum.revisions where {where} order by number desc, id desc limit %s",
        [*params, limit + 1],
    ).fetchall()
    rows, keys = pagination.page(rows, limit, lambda r: [r["number"], r["id"]])
    tags = load_tag_ids(conn, [r["id"] for r in rows])
    return API | {
        "revisions": [revision_out(r, tags[r["id"]]) for r in rows],
        "next_cursor": pagination.encode(scope, {}, actor.id, keys) if keys else None,
    }


def get_revision(conn: Connection, actor: Actor, post_id: UUID, revision_id: UUID) -> dict:
    viewer_post(conn, actor, post_id)
    rev = _revision(conn, post_id, revision_id)
    return API | {"revision": revision_out(rev, load_tag_ids(conn, [revision_id])[revision_id])}


# --------------------------------------------------------------- admin side


def list_reviews(conn: Connection, actor: Actor, limit: int, cursor: str | None) -> dict:
    after = pagination.decode(cursor, "admin/reviews", {}, actor.id)
    where = ["r.status = 'pending'", "p.deleted_at is null", "p.author_id <> %s"]
    params: list[Any] = [actor.id]
    if after:
        where.append("(r.submitted_at, r.id) > (%s::timestamptz, %s::uuid)")
        params += after
    rows = conn.execute(
        "select r.id as rev_id, r.submitted_at as rev_submitted_at, p.* from forum.revisions r"
        f" join forum.posts p on p.id = r.post_id where {' and '.join(where)}"
        " order by r.submitted_at asc, r.id asc limit %s",
        [*params, limit + 1],
    ).fetchall()
    rows, keys = pagination.page(rows, limit, lambda r: [r["rev_submitted_at"], r["rev_id"]])
    items = []
    for ws, row in zip(workspaces_out(conn, rows), rows):
        # A pending revision is always the working revision of its post.
        items.append(
            {
                "post": ws["post"],
                "submitted_revision": ws["working_revision"],
                "published_revision": ws["published_revision"],
                "hashtags": ws["hashtags"],
            }
        )
    return API | {
        "items": items,
        "next_cursor": pagination.encode("admin/reviews", {}, actor.id, keys) if keys else None,
    }


def review(
    conn: Connection, actor: Actor, post_id: UUID, revision_id: UUID, body: Any
) -> tuple[int, dict]:
    post = _post(conn, post_id, lock=True)
    if not post or post["deleted_at"] is not None:
        raise not_found()
    rev = _revision(conn, post_id, revision_id, lock=True)
    if post["author_id"] == actor.id:
        raise forbidden("SELF_REVIEW")
    _check_transition(post, rev, body, "pending")

    if isinstance(body, Approve):
        inactive = _inactive(conn, load_tag_ids(conn, [revision_id])[revision_id])
        if inactive:
            raise conflict("INACTIVE_HASHTAG", hashtag_ids=inactive)
        _bump_revision(
            conn,
            revision_id,
            "status = 'approved', reviewed_at = now(), reviewed_by = %s",
            [actor.id],
        )
        if post["visibility"] == "unpublished":
            conn.execute(
                "update forum.posts set visibility = 'published', published_at = now(),"
                " published_revision_id = %s, working_revision_id = null,"
                " version = version + 1, updated_at = now() where id = %s",
                [revision_id, post_id],
            )
        else:  # replacement keeps published_at and, if hidden, stays hidden
            conn.execute(
                "update forum.posts set edited_at = now(), published_revision_id = %s,"
                " working_revision_id = null, version = version + 1, updated_at = now()"
                " where id = %s",
                [revision_id, post_id],
            )
        notify(conn, post["author_id"], "revision_approved", post_id, revision_id)
        audit(
            conn,
            actor,
            "revision.approve",
            post_id=post_id,
            revision_id=revision_id,
            from_state="pending",
            to_state="approved",
        )
    else:
        _bump_revision(
            conn,
            revision_id,
            "status = 'rejected', reviewed_at = now(), reviewed_by = %s,"
            " rejection_reason_code = %s, rejection_reason = %s",
            [actor.id, body.reason_code, body.reason],
        )
        _bump_post(conn, post_id, working_revision_id=None)
        notify(conn, post["author_id"], "revision_rejected", post_id, revision_id)
        audit(
            conn,
            actor,
            "revision.reject",
            post_id=post_id,
            revision_id=revision_id,
            reason=body.reason,
            from_state="pending",
            to_state="rejected",
        )
    return 200, _workspace(conn, post_id)


def change_visibility(
    conn: Connection, actor: Actor, post_id: UUID, body: VisibilityChange
) -> tuple[int, dict]:
    post = _post(conn, post_id, lock=True)
    if not post or post["deleted_at"] is not None:
        raise not_found()
    if post["version"] != body.expected_version:
        raise stale()
    if body.action == "hide":
        if post["visibility"] != "published":
            raise invalid_state()
        target, kind = "hidden", "post_hidden"
    else:
        if post["visibility"] != "hidden" or post["published_revision_id"] is None:
            raise invalid_state()
        target, kind = "published", "post_restored"
    conn.execute(
        "update forum.posts set visibility = %s, visibility_action = %s, visibility_reason = %s,"
        " visibility_actor_id = %s, visibility_at = now(), version = version + 1,"
        " updated_at = now() where id = %s",
        [target, body.action, body.reason, actor.id, post_id],
    )
    notify(conn, post["author_id"], kind, post_id)
    audit(
        conn,
        actor,
        f"post.{body.action}",
        post_id=post_id,
        reason=body.reason,
        from_state=post["visibility"],
        to_state=target,
    )
    return 200, _workspace(conn, post_id)
