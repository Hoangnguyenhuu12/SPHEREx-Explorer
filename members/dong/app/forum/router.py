"""HTTP routes for /api/forum (32 operations of openapi-forum-v1.yaml).

Routes stay out of the runtime /openapi.json: the forum contract is
published separately in shared/api-contract/openapi-forum-v1.yaml.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, Request, Response
from fastapi.responses import JSONResponse

from . import community, posts, tags
from .common import admin, contributor, idempotent, resolve_actor
from .db import transaction
from .errors import bad_param, forbidden
from .identity import Principal, optional_principal, require_principal
from .models import (
    CommentCreate,
    CommentUpdate,
    DraftCreate,
    DraftUpdate,
    NotificationRead,
    ProfileUpdate,
    ReportCreate,
    ReportDecision,
    ReviewDecision,
    RevisionCreate,
    TagCreate,
    TagUpdate,
    Transition,
    VisibilityChange,
)
from .pagination import strict_query

router = APIRouter(prefix="/api/forum", include_in_schema=False)

User = Annotated[Principal, Depends(require_principal)]
Guest = Annotated[Principal | None, Depends(optional_principal)]
Limit = Annotated[int, Query(ge=1, le=50)]
Cursor = Annotated[str | None, Query(min_length=1, max_length=2048)]
PAGE = ("limit", "cursor")


def Q(*names: str):
    """Annotated dependency: only these query parameters, each at most once."""
    return Annotated[None, Depends(strict_query(*names))]


def idempotency_key(request: Request) -> UUID:
    value = request.headers.get("idempotency-key")
    try:
        return UUID(value or "")
    except ValueError:
        raise bad_param("IDEMPOTENCY_KEY_REQUIRED", fields=["Idempotency-Key"]) from None


Key = Annotated[UUID, Depends(idempotency_key)]


def ok(body: dict, status: int = 200) -> JSONResponse:
    return JSONResponse(body, status_code=status)


def no_content() -> Response:
    return Response(status_code=204)


def run_post(
    principal: Principal,
    key: UUID,
    operation: str,
    resource: str,
    payload,
    action: Callable,
    *,
    role: Callable = contributor,
    recheck: Callable | None = None,
) -> JSONResponse:
    """Resolve the actor, then run action(conn, actor) once per idempotency key."""
    with transaction() as conn:
        actor = role(conn, principal)
        status, body = idempotent(
            conn,
            actor,
            operation,
            resource,
            key,
            payload,
            lambda: action(conn, actor),
            (lambda: recheck(conn, actor)) if recheck else None,
        )
    return ok(body, status)


def dump(model) -> dict:
    return model.model_dump(mode="json", exclude_unset=True)


# --------------------------------------------------------------- profile


@router.get("/me")
def get_me(principal: User, _: Q()):
    with transaction() as conn:
        return ok(tags.me_out(resolve_actor(conn, principal)))


@router.patch("/me")
def update_me(principal: User, body: ProfileUpdate, _: Q()):
    with transaction() as conn:
        actor = resolve_actor(conn, principal)
        if actor.is_anonymous:
            raise forbidden("CONFIRMED_ACCOUNT_REQUIRED")
        return ok(tags.update_profile(conn, actor, body))


# -------------------------------------------------------------- taxonomy


@router.get("/hashtags")
def list_hashtags(
    _p: Guest,
    _: Q("active", *PAGE),
    active: bool | None = None,
    limit: Limit = 20,
    cursor: Cursor = None,
):
    with transaction() as conn:
        return ok(tags.list_tags(conn, active, limit, cursor))


@router.post("/admin/hashtags")
def create_hashtag(principal: User, key: Key, body: TagCreate, _: Q()):
    return run_post(
        principal,
        key,
        "hashtag.create",
        "hashtags",
        dump(body),
        lambda conn, actor: tags.create_tag(conn, actor, body),
        role=admin,
    )


@router.patch("/admin/hashtags/{tag_id}")
def update_hashtag(principal: User, tag_id: UUID, body: TagUpdate, _: Q()):
    with transaction() as conn:
        return ok(tags.update_tag(conn, admin(conn, principal), tag_id, body))


# ------------------------------------------------------------ public posts


@router.get("/posts")
def list_posts(
    _p: Guest,
    _: Q("q", "hashtag", *PAGE),
    q: Annotated[str | None, Query(max_length=200)] = None,
    hashtag: Annotated[str | None, Query(min_length=1, max_length=40)] = None,
    limit: Limit = 20,
    cursor: Cursor = None,
):
    with transaction() as conn:
        return ok(posts.list_public(conn, q, hashtag, limit, cursor))


@router.get("/posts/{post_id}")
def get_post(_p: Guest, post_id: UUID, _: Q()):
    with transaction() as conn:
        return ok(posts.get_public(conn, post_id))


# ------------------------------------------------------------ author posts


@router.post("/posts")
def create_post(principal: User, key: Key, body: Annotated[DraftCreate, Body()], _: Q()):
    return run_post(
        principal,
        key,
        "post.create",
        "posts",
        dump(body),
        lambda conn, actor: posts.create_post(conn, actor, body),
    )


@router.delete("/posts/{post_id}")
def delete_post(principal: User, post_id: UUID, _: Q()):
    with transaction() as conn:
        posts.delete_post(conn, resolve_actor(conn, principal), post_id)
    return no_content()


@router.get("/me/posts")
def list_my_posts(
    principal: User,
    _: Q("visibility", "revision_status", *PAGE),
    visibility: Literal["unpublished", "published", "hidden"] | None = None,
    revision_status: Literal["draft", "pending", "rejected", "withdrawn"] | None = None,
    limit: Limit = 20,
    cursor: Cursor = None,
):
    with transaction() as conn:
        actor = resolve_actor(conn, principal)
        return ok(posts.list_own(conn, actor, visibility, revision_status, limit, cursor))


@router.get("/posts/{post_id}/workspace")
def get_workspace(principal: User, post_id: UUID, _: Q()):
    with transaction() as conn:
        return ok(posts.get_workspace(conn, resolve_actor(conn, principal), post_id))


# --------------------------------------------------------------- revisions


def _author_recheck(post_id: UUID):
    return lambda conn, actor: posts.author_post(conn, actor, post_id, lock=False)


@router.get("/posts/{post_id}/revisions")
def list_revisions(
    principal: User, post_id: UUID, _: Q(*PAGE), limit: Limit = 20, cursor: Cursor = None
):
    with transaction() as conn:
        actor = resolve_actor(conn, principal)
        return ok(posts.list_revisions(conn, actor, post_id, limit, cursor))


@router.post("/posts/{post_id}/revisions")
def create_revision(principal: User, post_id: UUID, key: Key, body: RevisionCreate, _: Q()):
    return run_post(
        principal,
        key,
        "revision.create",
        f"post:{post_id}",
        dump(body),
        lambda conn, actor: posts.create_revision(conn, actor, post_id, body),
        recheck=_author_recheck(post_id),
    )


@router.get("/posts/{post_id}/revisions/{revision_id}")
def get_revision(principal: User, post_id: UUID, revision_id: UUID, _: Q()):
    with transaction() as conn:
        actor = resolve_actor(conn, principal)
        return ok(posts.get_revision(conn, actor, post_id, revision_id))


@router.patch("/posts/{post_id}/revisions/{revision_id}")
def update_draft(principal: User, post_id: UUID, revision_id: UUID, body: DraftUpdate, _: Q()):
    with transaction() as conn:
        actor = contributor(conn, principal)
        status, result = posts.update_draft(conn, actor, post_id, revision_id, body)
    return ok(result, status)


@router.post("/posts/{post_id}/revisions/{revision_id}/submission")
def submit_revision(
    principal: User, post_id: UUID, revision_id: UUID, key: Key, body: Transition, _: Q()
):
    return run_post(
        principal,
        key,
        "revision.submit",
        f"revision:{revision_id}",
        dump(body),
        lambda conn, actor: posts.submit(conn, actor, post_id, revision_id, body),
        recheck=_author_recheck(post_id),
    )


@router.post("/posts/{post_id}/revisions/{revision_id}/withdrawal")
def withdraw_revision(
    principal: User, post_id: UUID, revision_id: UUID, key: Key, body: Transition, _: Q()
):
    return run_post(
        principal,
        key,
        "revision.withdraw",
        f"revision:{revision_id}",
        dump(body),
        lambda conn, actor: posts.withdraw(conn, actor, post_id, revision_id, body),
        recheck=_author_recheck(post_id),
    )


# ------------------------------------------------------------------ review


def _post_exists(post_id: UUID):
    def check(conn, actor):
        posts.viewer_post(conn, actor, post_id)

    return check


@router.get("/admin/reviews")
def list_reviews(principal: User, _: Q(*PAGE), limit: Limit = 20, cursor: Cursor = None):
    with transaction() as conn:
        return ok(posts.list_reviews(conn, admin(conn, principal), limit, cursor))


@router.post("/admin/posts/{post_id}/revisions/{revision_id}/decision")
def review_revision(
    principal: User,
    post_id: UUID,
    revision_id: UUID,
    key: Key,
    body: Annotated[ReviewDecision, Body()],
    _: Q(),
):
    return run_post(
        principal,
        key,
        "revision.review",
        f"revision:{revision_id}",
        dump(body),
        lambda conn, actor: posts.review(conn, actor, post_id, revision_id, body),
        role=admin,
        recheck=_post_exists(post_id),
    )


@router.post("/admin/posts/{post_id}/visibility")
def change_post_visibility(
    principal: User, post_id: UUID, key: Key, body: VisibilityChange, _: Q()
):
    return run_post(
        principal,
        key,
        "post.visibility",
        f"post:{post_id}",
        dump(body),
        lambda conn, actor: posts.change_visibility(conn, actor, post_id, body),
        role=admin,
        recheck=_post_exists(post_id),
    )


# ---------------------------------------------------------------- comments


@router.get("/posts/{post_id}/comments")
def list_comments(_p: Guest, post_id: UUID, _: Q(*PAGE), limit: Limit = 20, cursor: Cursor = None):
    with transaction() as conn:
        return ok(community.list_comments(conn, post_id, limit, cursor))


@router.post("/posts/{post_id}/comments")
def create_comment(principal: User, post_id: UUID, key: Key, body: CommentCreate, _: Q()):
    return run_post(
        principal,
        key,
        "comment.create",
        f"post:{post_id}",
        dump(body),
        lambda conn, actor: community.create_comment(conn, actor, post_id, body),
    )


@router.patch("/comments/{comment_id}")
def update_comment(principal: User, comment_id: UUID, body: CommentUpdate, _: Q()):
    with transaction() as conn:
        actor = contributor(conn, principal)
        return ok(community.update_comment(conn, actor, comment_id, body))


@router.delete("/comments/{comment_id}")
def delete_comment(principal: User, comment_id: UUID, _: Q()):
    with transaction() as conn:
        community.delete_comment(conn, resolve_actor(conn, principal), comment_id)
    return no_content()


@router.get("/comments/{comment_id}/workspace")
def inspect_comment(principal: User, comment_id: UUID, _: Q()):
    with transaction() as conn:
        actor = resolve_actor(conn, principal)
        return ok(community.inspect_comment(conn, actor, comment_id))


@router.post("/admin/comments/{comment_id}/visibility")
def change_comment_visibility(
    principal: User, comment_id: UUID, key: Key, body: VisibilityChange, _: Q()
):
    return run_post(
        principal,
        key,
        "comment.visibility",
        f"comment:{comment_id}",
        dump(body),
        lambda conn, actor: community.change_comment_visibility(conn, actor, comment_id, body),
        role=admin,
    )


# ----------------------------------------------------------------- reports


@router.post("/reports")
def create_report(principal: User, key: Key, body: ReportCreate, _: Q()):
    return run_post(
        principal,
        key,
        "report.create",
        f"{body.target_type}:{body.target_id}",
        dump(body),
        lambda conn, actor: community.create_report(conn, actor, body),
    )


@router.get("/admin/reports")
def list_reports(
    principal: User,
    _: Q("status", *PAGE),
    status: Literal["open", "resolved", "dismissed"] = "open",
    limit: Limit = 20,
    cursor: Cursor = None,
):
    with transaction() as conn:
        actor = admin(conn, principal)
        return ok(community.list_reports(conn, actor, status, limit, cursor))


@router.post("/admin/reports/{report_id}/decision")
def resolve_report(principal: User, report_id: UUID, key: Key, body: ReportDecision, _: Q()):
    return run_post(
        principal,
        key,
        "report.decision",
        f"report:{report_id}",
        dump(body),
        lambda conn, actor: community.resolve_report(conn, actor, report_id, body),
        role=admin,
    )


# ----------------------------------------------------------- notifications


@router.get("/me/notifications")
def list_notifications(
    principal: User,
    _: Q("unread", *PAGE),
    unread: bool | None = None,
    limit: Limit = 20,
    cursor: Cursor = None,
):
    with transaction() as conn:
        actor = resolve_actor(conn, principal)
        return ok(community.list_notifications(conn, actor, unread, limit, cursor))


@router.patch("/me/notifications/{notification_id}")
def read_notification(principal: User, notification_id: UUID, body: NotificationRead, _: Q()):
    with transaction() as conn:
        actor = resolve_actor(conn, principal)
        return ok(community.read_notification(conn, actor, notification_id))


# ------------------------------------------------------------------- audit


@router.get("/admin/audit-events")
def list_audit(principal: User, _: Q(*PAGE), limit: Limit = 20, cursor: Cursor = None):
    with transaction() as conn:
        return ok(community.list_audit(conn, admin(conn, principal), limit, cursor))
