"""Forum-v1.1 behaviour: lifecycle, permissions, moderation, idempotency, paging."""

from __future__ import annotations

import uuid

import psycopg
import pytest
from forum_helpers import make_token

F = "/api/forum"
TITLE = "Possible motion near Barnard Star"
BODY = "Could this change in position be motion or an image artifact?"
LINK = {"label": "The Eyes", "url": "https://example.org/the-eyes?ra=269.4521&dec=4.6934"}
SKY = {"ra": 269.4521, "dec": 4.6934, "size": 0.1, "detector": 6, "target_key": "barnard"}


@pytest.fixture
def world(users):
    admin = users("Admin one", role="admin")
    reviewer = users("Admin two", role="admin")
    author = users("Sky observer")
    other = users("Another observer")
    tag = admin.post(f"{F}/admin/hashtags", json={"slug": "#SPHEREx", "display_name": "SPHEREx"})
    assert tag.status_code == 201
    second = admin.post(f"{F}/admin/hashtags", json={"slug": "barnard", "display_name": "Barnard"})

    class World:
        pass

    w = World()
    w.admin, w.reviewer, w.author, w.other = admin, reviewer, author, other
    w.tag = tag.json()["hashtag"]
    w.tag2 = second.json()["hashtag"]
    return w


def draft(user, **fields):
    payload = {"title": TITLE, "body": BODY, "links": [LINK], "sky_context": SKY} | fields
    response = user.post(f"{F}/posts", json=payload)
    assert response.status_code == 201, response.json()
    return response.json()["workspace"]


def submit(user, ws):
    rev = ws["working_revision"]
    response = user.post(
        f"{F}/posts/{ws['post']['id']}/revisions/{rev['id']}/submission",
        json={
            "expected_revision_version": rev["version"],
            "expected_post_version": ws["post"]["version"],
        },
    )
    assert response.status_code == 200, response.json()
    return response.json()["workspace"]


def decide(admin, ws, decision="approve", **extra):
    rev = ws["working_revision"]
    return admin.post(
        f"{F}/admin/posts/{ws['post']['id']}/revisions/{rev['id']}/decision",
        json={
            "decision": decision,
            "expected_revision_version": rev["version"],
            "expected_post_version": ws["post"]["version"],
            **extra,
        },
    )


def publish(w, user=None, **fields):
    user = user or w.author
    ws = submit(user, draft(user, hashtag_ids=[w.tag["id"]], **fields))
    response = decide(w.reviewer if user is w.admin else w.admin, ws)
    assert response.status_code == 200, response.json()
    return response.json()["workspace"]


# ------------------------------------------------------------------- auth


def test_public_reads_need_no_token_but_reject_invalid_ones(app_client, world):
    assert app_client.get(f"{F}/posts").status_code == 200
    assert app_client.get(f"{F}/hashtags").status_code == 200
    assert app_client.get(f"{F}/posts", token="not-a-jwt").status_code == 401
    expired = make_token(uuid.uuid4(), exp=1)
    assert app_client.get(f"{F}/posts", token=expired).status_code == 401
    wrong_aud = make_token(uuid.uuid4(), aud="other")
    assert app_client.get(f"{F}/me", token=wrong_aud).status_code == 401
    assert app_client.get(f"{F}/me").status_code == 401
    assert app_client.post(f"{F}/posts", json={}).status_code == 401


def test_profile_completion_and_protected_role(app_client, users):
    newcomer = users(name=None)
    me = newcomer.get(f"{F}/me").json()
    assert me["profile"]["display_name"] is None and me["role"] == "user"
    blocked = newcomer.post(f"{F}/posts", json={})
    assert blocked.status_code == 403
    assert blocked.json()["error"]["details"]["reason"] == "PROFILE_REQUIRED"
    assert newcomer.patch(f"{F}/me", json={"display_name": "   "}).status_code == 400
    assert newcomer.patch(f"{F}/me", json={"display_name": "x", "role": "admin"}).status_code == 400
    updated = newcomer.patch(f"{F}/me", json={"display_name": "  Nova  "}).json()
    assert updated["profile"]["display_name"] == "Nova" and updated["role"] == "user"
    assert newcomer.post(f"{F}/posts", json={}).status_code == 201
    anonymous = make_token(uuid.uuid4(), is_anonymous=True)
    assert (
        app_client.patch(f"{F}/me", token=anonymous, json={"display_name": "Anon"}).status_code
        == 403
    )


def test_metadata_display_name_seeds_profile_but_not_role(app_client):
    token = make_token(
        uuid.uuid4(),
        user_metadata={"display_name": " Vega ", "role": "admin"},
        app_metadata={"role": "admin"},
    )
    me = app_client.get(f"{F}/me", token=token).json()
    assert me["profile"]["display_name"] == "Vega" and me["role"] == "user"


# ------------------------------------------------------------------- tags


def test_hashtag_catalog_management(world):
    assert world.tag["slug"] == "spherex" and world.tag["active"] is True
    assert (
        world.author.post(
            f"{F}/admin/hashtags", json={"slug": "x", "display_name": "X"}
        ).status_code
        == 403
    )
    dup = world.admin.post(f"{F}/admin/hashtags", json={"slug": " Spherex", "display_name": "S"})
    assert dup.status_code == 409 and dup.json()["error"]["details"]["reason"] == "DUPLICATE_SLUG"
    bad = world.admin.post(f"{F}/admin/hashtags", json={"slug": "no spaces", "display_name": "S"})
    assert bad.status_code == 400
    path = f"{F}/admin/hashtags/{world.tag['id']}"
    assert world.admin.patch(path, json={"expected_version": 1}).status_code == 400
    assert world.admin.patch(path, json={"expected_version": 1, "slug": "new"}).status_code == 400
    assert (
        world.admin.patch(path, json={"expected_version": 1, "display_name": "SPHEREx"}).status_code
        == 400
    )
    assert world.admin.patch(path, json={"expected_version": 9, "active": False}).status_code == 409
    off = world.admin.patch(path, json={"expected_version": 1, "active": False}).json()["hashtag"]
    assert off["active"] is False and off["version"] == 2 and off["slug"] == "spherex"
    listed = world.admin.get(f"{F}/hashtags", params={"active": "false"}).json()["hashtags"]
    assert [t["tag"]["slug"] for t in listed] == ["spherex"]


# -------------------------------------------------------------- lifecycle


def test_draft_submit_approve_publish_flow(app_client, world):
    empty = world.author.post(f"{F}/posts", json={}).json()["workspace"]
    assert empty["post"]["visibility"] == "unpublished"
    assert empty["working_revision"]["status"] == "draft"
    early = world.author.post(
        f"{F}/posts/{empty['post']['id']}/revisions/{empty['working_revision']['id']}/submission",
        json={"expected_revision_version": 1, "expected_post_version": 1},
    )
    assert early.status_code == 400
    assert set(early.json()["error"]["details"]["fields"]) == {"title", "body", "hashtag_ids"}

    ws = draft(world.author, hashtag_ids=[world.tag["id"]])
    post_id, rev = ws["post"]["id"], ws["working_revision"]
    edit = world.author.patch(
        f"{F}/posts/{post_id}/revisions/{rev['id']}",
        json={"expected_version": 1, "body": BODY + " More context."},
    )
    assert edit.status_code == 200
    ws = edit.json()["workspace"]
    assert ws["working_revision"]["version"] == 2 and ws["post"]["version"] == 2
    noop = world.author.patch(
        f"{F}/posts/{post_id}/revisions/{rev['id']}",
        json={"expected_version": 2, "body": BODY + " More context."},
    )
    assert noop.status_code == 400
    stale = world.author.patch(
        f"{F}/posts/{post_id}/revisions/{rev['id']}",
        json={"expected_version": 1, "title": "Another title here"},
    )
    assert stale.status_code == 409

    ws = submit(world.author, ws)
    assert ws["working_revision"]["status"] == "pending"
    frozen = world.author.patch(
        f"{F}/posts/{post_id}/revisions/{rev['id']}",
        json={"expected_version": 3, "title": "Changed after submit"},
    )
    assert frozen.status_code == 409
    assert app_client.get(f"{F}/posts/{post_id}").status_code == 404
    assert app_client.get(f"{F}/posts").json()["posts"] == []

    queue = world.admin.get(f"{F}/admin/reviews").json()["items"]
    assert [i["submitted_revision"]["id"] for i in queue] == [rev["id"]]
    assert world.author.get(f"{F}/admin/reviews").status_code == 403

    approved = decide(world.admin, ws)
    assert approved.status_code == 200
    ws = approved.json()["workspace"]
    assert ws["post"]["visibility"] == "published" and ws["working_revision"] is None
    assert ws["published_revision"]["status"] == "approved"
    public = app_client.get(f"{F}/posts/{post_id}").json()["post"]
    assert public["title"] == TITLE and public["hashtags"][0]["slug"] == "spherex"
    assert public["links"] == [LINK] and public["sky_context"] == SKY
    counts = {
        t["tag"]["slug"]: t["published_post_count"]
        for t in app_client.get(f"{F}/hashtags").json()["hashtags"]
    }
    assert counts == {"spherex": 1, "barnard": 0}

    kinds = [n["type"] for n in world.author.get(f"{F}/me/notifications").json()["notifications"]]
    assert kinds == ["revision_approved", "submission_received"]
    assert world.other.get(f"{F}/me/notifications").json()["notifications"] == []
    actions = [e["action"] for e in world.admin.get(f"{F}/admin/audit-events").json()["events"]]
    assert actions[:2] == ["revision.approve", "revision.submit"]


def test_edit_keeps_old_snapshot_public_until_approval(app_client, world):
    ws = publish(world)
    post_id, first = ws["post"]["id"], ws["published_revision"]
    published_at = ws["post"]["published_at"]
    created = world.author.post(
        f"{F}/posts/{post_id}/revisions",
        json={"base_revision_id": first["id"], "expected_post_version": ws["post"]["version"]},
    )
    assert created.status_code == 201
    ws = created.json()["workspace"]
    assert ws["working_revision"]["number"] == 2 and ws["working_revision"]["version"] == 1
    again = world.author.post(
        f"{F}/posts/{post_id}/revisions",
        json={"base_revision_id": first["id"], "expected_post_version": ws["post"]["version"]},
    )
    assert again.status_code == 409

    edit = world.author.patch(
        f"{F}/posts/{post_id}/revisions/{ws['working_revision']['id']}",
        json={"expected_version": 1, "title": "Updated: motion near Barnard Star"},
    ).json()["workspace"]
    ws = submit(world.author, edit)
    assert app_client.get(f"{F}/posts/{post_id}").json()["post"]["title"] == TITLE
    assert app_client.get(f"{F}/posts", params={"q": "Updated"}).json()["posts"] == []

    ws = decide(world.admin, ws).json()["workspace"]
    public = app_client.get(f"{F}/posts/{post_id}").json()["post"]
    assert public["title"] == "Updated: motion near Barnard Star"
    assert public["published_at"] == published_at and public["edited_at"] is not None
    history = world.author.get(f"{F}/posts/{post_id}/revisions").json()["revisions"]
    assert [(r["number"], r["status"]) for r in history] == [(2, "approved"), (1, "approved")]
    assert history[1]["title"] == TITLE


def test_reject_withdraw_and_clone(app_client, world):
    ws = submit(world.author, draft(world.author, hashtag_ids=[world.tag["id"]]))
    post_id = ws["post"]["id"]
    assert decide(world.admin, ws, "reject").status_code == 400  # reason required
    assert (
        decide(world.admin, ws, "reject", reason_code="needs_context", reason="   ").status_code
        == 400
    )
    rejected = decide(
        world.admin, ws, "reject", reason_code="needs_context", reason="Add observation times."
    )
    assert rejected.status_code == 200
    ws = rejected.json()["workspace"]
    assert ws["post"]["visibility"] == "unpublished" and ws["working_revision"] is None
    old = world.author.get(f"{F}/posts/{post_id}/revisions").json()["revisions"][0]
    assert old["status"] == "rejected" and old["rejection_reason"] == "Add observation times."
    note = world.author.get(f"{F}/me/notifications").json()["notifications"][0]
    assert note["type"] == "revision_rejected" and note["revision_id"] == old["id"]

    ws = world.author.post(
        f"{F}/posts/{post_id}/revisions",
        json={"base_revision_id": old["id"], "expected_post_version": ws["post"]["version"]},
    ).json()["workspace"]
    ws = submit(world.author, ws)
    rev = ws["working_revision"]
    withdrawn = world.author.post(
        f"{F}/posts/{post_id}/revisions/{rev['id']}/withdrawal",
        json={
            "expected_revision_version": rev["version"],
            "expected_post_version": ws["post"]["version"],
        },
    )
    assert withdrawn.status_code == 200
    # The admin still holds the old versions: the stale decision must fail.
    late = decide(world.admin, ws)
    assert late.status_code == 409
    assert world.admin.get(f"{F}/admin/reviews").json()["items"] == []
    mine = world.author.get(f"{F}/me/posts", params={"revision_status": "withdrawn"}).json()
    assert [i["post"]["id"] for i in mine["items"]] == [post_id]


def test_concurrent_decisions_first_wins_and_no_self_review(world):
    ws = submit(world.author, draft(world.author, hashtag_ids=[world.tag["id"]]))
    assert decide(world.admin, ws).status_code == 200
    second = decide(world.reviewer, ws, "reject", reason_code="spam", reason="Spam")
    assert second.status_code == 409

    own = submit(world.admin, draft(world.admin, hashtag_ids=[world.tag["id"]]))
    selfie = decide(world.admin, own)
    assert selfie.status_code == 403
    assert all(
        i["post"]["id"] != own["post"]["id"]
        for i in world.admin.get(f"{F}/admin/reviews").json()["items"]
    )
    assert decide(world.reviewer, own).status_code == 200


def test_inactive_tags_block_submission_and_approval(world):
    ws = submit(world.author, draft(world.author, hashtag_ids=[world.tag["id"]]))
    world.admin.patch(
        f"{F}/admin/hashtags/{world.tag['id']}", json={"expected_version": 1, "active": False}
    )
    blocked = decide(world.admin, ws)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["details"]["reason"] == "INACTIVE_HASHTAG"

    fresh = draft(world.author)
    rev = fresh["working_revision"]
    picked = world.author.patch(
        f"{F}/posts/{fresh['post']['id']}/revisions/{rev['id']}",
        json={"expected_version": 1, "hashtag_ids": [world.tag["id"]]},
    )
    assert picked.status_code == 400
    unknown = world.author.patch(
        f"{F}/posts/{fresh['post']['id']}/revisions/{rev['id']}",
        json={"expected_version": 1, "hashtag_ids": [str(uuid.uuid4())]},
    )
    assert unknown.status_code == 400


def test_validation_of_links_and_sky_context(world):
    for bad in (
        {"links": [{"label": "x", "url": "javascript:alert(1)"}]},
        {"links": [{"label": "x", "url": "https://user:pw@example.org/"}]},
        {"links": [{"label": "x", "url": "https:///nohost"}]},
        {"links": [{"label": " ", "url": "https://example.org/"}]},
        {"sky_context": {"ra": 360, "dec": 0, "size": 0.1, "detector": 1}},
        {"sky_context": {"ra": 1, "dec": 0, "size": 0.1, "detector": 1, "t_min_mjd": 5}},
        {"hashtag_ids": [world.tag["id"], world.tag["id"]]},
        {"unknown": 1},
    ):
        response = world.author.post(f"{F}/posts", json=bad)
        assert response.status_code == 400, bad
        assert response.json()["error"]["code"] == "BAD_PARAM"


# ------------------------------------------------------------- visibility


def test_hide_restore_and_approval_never_unhides(app_client, world):
    ws = publish(world)
    post_id = ws["post"]["id"]
    hide = {"action": "hide", "expected_version": ws["post"]["version"], "reason": "Check."}
    assert world.author.post(f"{F}/admin/posts/{post_id}/visibility", json=hide).status_code == 403
    hidden = world.admin.post(f"{F}/admin/posts/{post_id}/visibility", json=hide)
    assert hidden.status_code == 200
    ws = hidden.json()["workspace"]
    assert ws["post"]["visibility"] == "hidden"
    assert ws["post"]["visibility_reason"]["reason"] == "Check."
    assert app_client.get(f"{F}/posts/{post_id}").status_code == 404
    assert app_client.get(f"{F}/posts/{post_id}/comments").status_code == 404
    assert app_client.get(f"{F}/hashtags").json()["hashtags"][1]["published_post_count"] == 0
    again = world.admin.post(
        f"{F}/admin/posts/{post_id}/visibility",
        json=hide | {"expected_version": ws["post"]["version"]},
    )
    assert again.status_code == 409

    ws = world.author.post(
        f"{F}/posts/{post_id}/revisions",
        json={
            "base_revision_id": ws["published_revision"]["id"],
            "expected_post_version": ws["post"]["version"],
        },
    ).json()["workspace"]
    ws = submit(world.author, ws)
    ws = decide(world.admin, ws).json()["workspace"]
    assert ws["post"]["visibility"] == "hidden"

    restored = world.admin.post(
        f"{F}/admin/posts/{post_id}/visibility",
        json={
            "action": "restore",
            "expected_version": ws["post"]["version"],
            "reason": "Context added.",
        },
    )
    assert restored.status_code == 200
    assert app_client.get(f"{F}/posts/{post_id}").status_code == 200
    kinds = [n["type"] for n in world.author.get(f"{F}/me/notifications").json()["notifications"]]
    assert kinds[:3] == ["post_restored", "revision_approved", "submission_received"]


# ---------------------------------------------------------------- comments


def test_comments_lifecycle_and_moderation(app_client, world):
    ws = publish(world)
    post_id, rev_id = ws["post"]["id"], ws["published_revision"]["id"]
    path = f"{F}/posts/{post_id}/comments"
    stale = world.other.post(path, json={"body": "Hi", "observed_revision_id": str(uuid.uuid4())})
    assert stale.status_code == 409
    created = world.other.post(
        path, json={"body": " Compare detectors. ", "observed_revision_id": rev_id}
    )
    assert created.status_code == 201
    comment = created.json()["comment"]
    assert comment["body"] == "Compare detectors." and comment["version"] == 1
    cpath = f"{F}/comments/{comment['id']}"

    assert world.author.patch(cpath, json={"body": "x", "expected_version": 1}).status_code == 403
    assert (
        world.other.patch(
            cpath, json={"body": "Compare detectors.", "expected_version": 1}
        ).status_code
        == 400
    )
    edited = world.other.patch(cpath, json={"body": "Compare detector 6.", "expected_version": 1})
    assert edited.json()["comment"]["version"] == 2
    assert edited.json()["comment"]["observed_revision_id"] == rev_id

    hidden = world.admin.post(
        f"{F}/admin/comments/{comment['id']}/visibility",
        json={"action": "hide", "expected_version": 2, "reason": "Off"},
    )
    assert hidden.status_code == 200 and hidden.json()["item"]["visibility"] == "hidden"
    assert app_client.get(path).json()["comments"] == []
    assert world.other.patch(cpath, json={"body": "New", "expected_version": 3}).status_code == 404
    inspect = world.other.get(f"{cpath}/workspace").json()["item"]
    assert inspect["visibility_reason"]["reason"] == "Off"
    assert world.author.get(f"{cpath}/workspace").status_code == 404
    assert world.author.delete(cpath).status_code == 404

    world.admin.post(
        f"{F}/admin/comments/{comment['id']}/visibility",
        json={"action": "restore", "expected_version": 3, "reason": "Ok"},
    )
    assert len(app_client.get(path).json()["comments"]) == 1
    assert world.admin.delete(cpath).status_code == 403
    assert world.other.delete(cpath).status_code == 204
    assert world.other.delete(cpath).status_code == 204
    assert app_client.get(path).json()["comments"] == []
    assert world.other.get(f"{cpath}/workspace").status_code == 404
    kinds = [n["type"] for n in world.other.get(f"{F}/me/notifications").json()["notifications"]]
    assert kinds == ["comment_restored", "comment_hidden"]


def test_restoring_comment_under_hidden_parent_stays_private(app_client, world):
    ws = publish(world)
    post_id = ws["post"]["id"]
    c = world.other.post(
        f"{F}/posts/{post_id}/comments",
        json={"body": "Nice", "observed_revision_id": ws["published_revision"]["id"]},
    ).json()["comment"]
    world.admin.post(
        f"{F}/admin/comments/{c['id']}/visibility",
        json={"action": "hide", "expected_version": 1, "reason": "x"},
    )
    world.admin.post(
        f"{F}/admin/posts/{post_id}/visibility",
        json={"action": "hide", "expected_version": ws["post"]["version"], "reason": "y"},
    )
    world.admin.post(
        f"{F}/admin/comments/{c['id']}/visibility",
        json={"action": "restore", "expected_version": 2, "reason": "z"},
    )
    assert app_client.get(f"{F}/posts/{post_id}/comments").status_code == 404
    # Author may still delete their own comment under the hidden parent.
    assert world.other.delete(f"{F}/comments/{c['id']}").status_code == 204


# ----------------------------------------------------------------- reports


def test_reports_unique_open_and_resolution(world):
    ws = publish(world)
    target = {"target_type": "post", "target_id": ws["post"]["id"], "reason_code": "off_topic"}
    first = world.other.post(f"{F}/reports", json=target)
    assert first.status_code == 201
    repeat = world.other.post(f"{F}/reports", json=target | {"description": "again"})
    assert repeat.status_code == 200 and repeat.json() == first.json()
    assert (
        world.other.post(f"{F}/reports", json=target | {"reason_code": "other"}).status_code == 400
    )
    missing = target | {"target_id": str(uuid.uuid4())}
    assert world.other.post(f"{F}/reports", json=missing).status_code == 404

    queue = world.admin.get(f"{F}/admin/reports").json()["items"]
    assert len(queue) == 1 and queue[0]["reporter_id"] == str(world.other.id)
    report = queue[0]["report"]
    assert world.other.get(f"{F}/admin/reports").status_code == 403
    path = f"{F}/admin/reports/{report['id']}/decision"
    done = world.admin.post(
        path, json={"decision": "dismissed", "expected_version": 1, "reason": "Fine."}
    )
    assert done.status_code == 200 and done.json()["item"]["resolved_by"] == str(world.admin.id)
    assert (
        world.admin.post(
            path, json={"decision": "resolved", "expected_version": 2, "reason": "x"}
        ).status_code
        == 409
    )
    assert world.admin.get(f"{F}/admin/reports").json()["items"] == []
    assert (
        len(world.admin.get(f"{F}/admin/reports", params={"status": "dismissed"}).json()["items"])
        == 1
    )
    # Reports never hide content.
    assert world.other.get(f"{F}/posts/{ws['post']['id']}").status_code == 200
    assert world.other.post(f"{F}/reports", json=target).status_code == 201


# ------------------------------------------------------------ idempotency


def test_idempotent_post_replays_and_rejects_mismatch(world, sql):
    key = uuid.uuid4()
    first = world.author.post(f"{F}/posts", json={"title": "One"}, key=key)
    replay = world.author.post(f"{F}/posts", json={"title": "One"}, key=key)
    assert first.status_code == replay.status_code == 201 and first.json() == replay.json()
    assert sql("select count(*) as n from forum.posts")[0][0] == 1
    other = world.author.post(f"{F}/posts", json={"title": "Two"}, key=key)
    assert other.status_code == 409
    assert other.json()["error"]["details"]["reason"] == "IDEMPOTENCY_CONFLICT"
    # Scoped per actor: the same key from another user is a new request.
    assert world.other.post(f"{F}/posts", json={"title": "One"}, key=key).status_code == 201
    assert world.author.post(f"{F}/posts", json={}, key=False).status_code == 400

    ws = submit(world.author, draft(world.author, hashtag_ids=[world.tag["id"]]))
    rev = ws["working_revision"]
    body = {
        "decision": "approve",
        "expected_revision_version": rev["version"],
        "expected_post_version": ws["post"]["version"],
    }
    url = f"{F}/admin/posts/{ws['post']['id']}/revisions/{rev['id']}/decision"
    k = uuid.uuid4()
    a = world.admin.post(url, json=body, key=k)
    b = world.admin.post(url, json=body, key=k)
    assert a.status_code == b.status_code == 200 and a.json() == b.json()
    notes = world.author.get(f"{F}/me/notifications").json()["notifications"]
    assert [n["type"] for n in notes].count("revision_approved") == 1


# ------------------------------------------------------- privacy & deletion


def test_private_access_rules(app_client, world):
    ws = draft(world.author)
    post_id, rev_id = ws["post"]["id"], ws["working_revision"]["id"]
    assert world.other.get(f"{F}/posts/{post_id}/workspace").status_code == 404
    assert world.other.get(f"{F}/posts/{post_id}/revisions/{rev_id}").status_code == 404
    assert (
        world.other.patch(
            f"{F}/posts/{post_id}/revisions/{rev_id}",
            json={"expected_version": 1, "title": "Mine now"},
        ).status_code
        == 404
    )
    assert world.admin.get(f"{F}/posts/{post_id}/workspace").status_code == 200
    assert (
        world.admin.patch(
            f"{F}/posts/{post_id}/revisions/{rev_id}",
            json={"expected_version": 1, "title": "Admin edit"},
        ).status_code
        == 403
    )
    assert world.other.delete(f"{F}/posts/{post_id}").status_code == 404

    public = publish(world)
    pid = public["post"]["id"]
    assert world.other.delete(f"{F}/posts/{pid}").status_code == 403
    assert world.admin.delete(f"{F}/posts/{pid}").status_code == 403
    assert (
        world.other.post(
            f"{F}/posts/{pid}/revisions",
            json={
                "base_revision_id": public["published_revision"]["id"],
                "expected_post_version": public["post"]["version"],
            },
        ).status_code
        == 403
    )
    assert world.other.get(f"{F}/me/posts").json()["items"] == []
    mine = world.author.get(f"{F}/me/posts").json()["items"]
    assert {i["post"]["id"] for i in mine} == {post_id, pid}


def test_author_delete_withdraws_pending_and_hides_everything(app_client, world):
    ws = publish(world)
    post_id = ws["post"]["id"]
    comment = world.other.post(
        f"{F}/posts/{post_id}/comments",
        json={"body": "Hi", "observed_revision_id": ws["published_revision"]["id"]},
    ).json()["comment"]
    ws = world.author.post(
        f"{F}/posts/{post_id}/revisions",
        json={
            "base_revision_id": ws["published_revision"]["id"],
            "expected_post_version": ws["post"]["version"],
        },
    ).json()["workspace"]
    ws = submit(world.author, ws)
    assert world.author.delete(f"{F}/posts/{post_id}").status_code == 204
    assert world.author.delete(f"{F}/posts/{post_id}").status_code == 204
    assert app_client.get(f"{F}/posts/{post_id}").status_code == 404
    assert world.author.get(f"{F}/posts/{post_id}/workspace").status_code == 404
    assert world.admin.get(f"{F}/posts/{post_id}/workspace").status_code == 404
    assert decide(world.admin, ws).status_code == 404
    assert world.admin.get(f"{F}/admin/reviews").json()["items"] == []
    assert world.other.delete(f"{F}/comments/{comment['id']}").status_code == 404
    assert app_client.get(f"{F}/hashtags").json()["hashtags"][1]["published_post_count"] == 0
    assert world.author.get(f"{F}/me/posts").json()["items"] == []


# ------------------------------------------------------- search & paging


def test_search_literal_and_hashtag_filter(app_client, world):
    a = publish(world, title="Barnard 100% motion check", body="Underscore_test body text here.")
    b = publish(world, title="Wise 0855 brown dwarf look", body="Another body with enough text.")
    world.admin.patch(
        f"{F}/admin/hashtags/{world.tag2['id']}",
        json={"expected_version": 1, "display_name": "Barnard's"},
    )
    ids = lambda r: [p["id"] for p in r.json()["posts"]]
    assert ids(app_client.get(f"{F}/posts", params={"q": "100%"})) == [a["post"]["id"]]
    assert ids(app_client.get(f"{F}/posts", params={"q": "%"})) == [a["post"]["id"]]
    assert ids(app_client.get(f"{F}/posts", params={"q": "_"})) == [a["post"]["id"]]
    assert ids(app_client.get(f"{F}/posts", params={"q": "BROWN"})) == [b["post"]["id"]]
    assert len(ids(app_client.get(f"{F}/posts", params={"q": "  "}))) == 2
    assert len(ids(app_client.get(f"{F}/posts", params={"hashtag": "#SPHEREX"}))) == 2
    assert ids(app_client.get(f"{F}/posts", params={"hashtag": "barnard"})) == []
    assert ids(app_client.get(f"{F}/posts", params={"hashtag": "unknown-tag"})) == []
    assert app_client.get(f"{F}/posts", params={"hashtag": "bad tag"}).status_code == 400
    assert ids(app_client.get(f"{F}/posts", params={"q": "dwarf", "hashtag": "spherex"})) == [
        b["post"]["id"]
    ]
    # Newest first.
    assert ids(app_client.get(f"{F}/posts")) == [b["post"]["id"], a["post"]["id"]]


def test_pagination_and_strict_query(app_client, world):
    for i in range(5):
        world.admin.post(f"{F}/admin/hashtags", json={"slug": f"tag-{i}", "display_name": f"T{i}"})
    seen, cursor = [], None
    while True:
        params = {"limit": 3} | ({"cursor": cursor} if cursor else {})
        page = app_client.get(f"{F}/hashtags", params=params).json()
        seen += [t["tag"]["slug"] for t in page["hashtags"]]
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert seen == sorted(seen) and len(seen) == 7
    first = app_client.get(f"{F}/hashtags", params={"limit": 3}).json()["next_cursor"]
    mismatch = app_client.get(
        f"{F}/hashtags", params={"limit": 3, "active": "true", "cursor": first}
    )
    assert mismatch.status_code == 400
    assert app_client.get(f"{F}/hashtags", params={"cursor": first + "x"}).status_code == 400
    assert app_client.get(f"{F}/hashtags", params={"limit": 51}).status_code == 400
    assert app_client.get(f"{F}/hashtags", params={"foo": 1}).status_code == 400
    assert app_client.get(f"{F}/hashtags?limit=2&limit=3").status_code == 400
    assert app_client.get(f"{F}/posts/not-a-uuid").status_code == 400


def test_notifications_read_is_repeat_safe(world):
    publish(world)
    notes = world.author.get(f"{F}/me/notifications", params={"unread": "true"}).json()
    note = notes["notifications"][0]
    path = f"{F}/me/notifications/{note['id']}"
    assert world.other.patch(path, json={"read": True}).status_code == 404
    first = world.author.patch(path, json={"read": True}).json()["notification"]
    second = world.author.patch(path, json={"read": True}).json()["notification"]
    assert first["read_at"] is not None and first["read_at"] == second["read_at"]
    assert world.author.patch(path, json={"read": False}).status_code == 400
    unread = world.author.get(f"{F}/me/notifications", params={"unread": "true"}).json()
    assert note["id"] not in [n["id"] for n in unread["notifications"]]


# ------------------------------------------------------ database guarantees


def test_database_guards_hold_without_the_api(world, sql):
    ws = publish(world)
    rev_id = ws["published_revision"]["id"]
    with pytest.raises(psycopg.errors.CheckViolation):
        sql(
            "update forum.revisions set title = 'rewritten', version = version + 1 where id = %s",
            [rev_id],
        )
    with pytest.raises(psycopg.errors.CheckViolation):
        sql("delete from forum.revision_tags where revision_id = %s", [rev_id])
    with pytest.raises(psycopg.errors.CheckViolation):
        sql("update forum.audit_events set reason = 'x'")
    with pytest.raises(psycopg.errors.CheckViolation):
        sql("update forum.hashtags set slug = 'renamed' where id = %s", [world.tag["id"]])
    with pytest.raises(psycopg.errors.UniqueViolation):
        sql(
            "insert into forum.revisions (post_id, number) values (%s, 2), (%s, 3)",
            [ws["post"]["id"], ws["post"]["id"]],
        )
    roles = sql("select rolname from pg_roles where rolname in ('anon', 'authenticated')")
    for (role,) in roles:
        assert sql("select has_schema_privilege(%s, 'forum', 'usage')", [role])[0][0] is False


def test_simultaneous_decisions_serialize(world):
    from concurrent.futures import ThreadPoolExecutor

    ws = submit(world.author, draft(world.author, hashtag_ids=[world.tag["id"]]))
    with ThreadPoolExecutor(max_workers=2) as pool:
        approve = pool.submit(decide, world.admin, ws)
        reject = pool.submit(
            decide, world.reviewer, ws, "reject", reason_code="spam", reason="Spam"
        )
        statuses = sorted([approve.result().status_code, reject.result().status_code])
    assert statuses == [200, 409]
    history = world.author.get(f"{F}/posts/{ws['post']['id']}/revisions").json()["revisions"]
    assert history[0]["status"] in ("approved", "rejected")


def test_cors_preflight_allows_forum_writes(app_client):
    response = app_client.raw.options(
        f"{F}/posts",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
        },
    )
    assert response.status_code == 200
    assert "PATCH" in response.headers["access-control-allow-methods"]
    assert "idempotency-key" in response.headers["access-control-allow-headers"].lower()
