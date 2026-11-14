"""Forum request models (forum-v1.1). Unknown fields are rejected with 400."""

from __future__ import annotations

import math
import unicodedata
from typing import Annotated, Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TITLE_RANGE = (10, 150)
BODY_RANGE = (20, 20000)
TAG_RANGE = (1, 5)

ReasonText = Annotated[str, Field(min_length=1, max_length=1000)]
Version = Annotated[int, Field(ge=1, strict=True)]


def nfc(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def clean(value: str) -> str:
    """Normalize user text: NFC and trimmed."""
    return nfc(value).strip()


def nonblank(value: str) -> str:
    text = clean(value)
    if not text:
        raise ValueError("must not be blank")
    return text


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ProfileUpdate(Strict):
    display_name: Annotated[str, Field(min_length=1, max_length=80)]

    _name = field_validator("display_name")(nonblank)


class TagCreate(Strict):
    slug: Annotated[str, Field(min_length=1, max_length=40)]
    display_name: Annotated[str, Field(min_length=1, max_length=80)]

    _name = field_validator("display_name")(nonblank)


class TagUpdate(Strict):
    expected_version: Version
    display_name: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    active: Annotated[bool, Field(strict=True)] | None = None

    _name = field_validator("display_name")(lambda v: None if v is None else nonblank(v))

    @model_validator(mode="after")
    def _one_change(self):
        if "display_name" not in self.model_fields_set and "active" not in self.model_fields_set:
            raise ValueError("display_name or active is required")
        if self.display_name is None and self.active is None:
            raise ValueError("display_name or active must not be null")
        return self


class Link(Strict):
    label: Annotated[str, Field(min_length=1, max_length=120)]
    url: Annotated[str, Field(min_length=1, max_length=2048)]

    _label = field_validator("label")(nonblank)

    @field_validator("url")
    @classmethod
    def _safe_url(cls, value: str) -> str:
        if value != value.strip() or any(ord(c) < 33 or ord(c) == 127 for c in value):
            raise ValueError("url must not contain whitespace or control characters")
        if not value.startswith(("http://", "https://")):
            raise ValueError("only http(s) URLs are allowed")
        try:
            parts = urlsplit(value)
            parts.port  # noqa: B018 - raises on an invalid port
        except ValueError:
            raise ValueError("invalid URL") from None
        if parts.scheme not in ("http", "https") or not parts.hostname:
            raise ValueError("URL needs an http(s) scheme and host")
        if parts.username is not None or parts.password is not None or "@" in parts.netloc:
            raise ValueError("URL credentials are not allowed")
        return value


class SkyContext(Strict):
    ra: Annotated[float, Field(ge=0, lt=360)]
    dec: Annotated[float, Field(ge=-90, le=90)]
    size: Annotated[float, Field(ge=0.02, le=0.3)]
    detector: Annotated[int, Field(ge=1, le=6, strict=True)]
    target_key: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    collection: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    t_min_mjd: float | None = None
    t_max_mjd: float | None = None
    product_ids: (
        Annotated[list[Annotated[str, Field(min_length=1, max_length=200)]], Field(max_length=100)]
        | None
    ) = None

    @model_validator(mode="after")
    def _consistent(self):
        if (self.t_min_mjd is None) != (self.t_max_mjd is None):
            raise ValueError("t_min_mjd and t_max_mjd must be given together")
        if self.t_min_mjd is not None and not self.t_min_mjd <= self.t_max_mjd:
            raise ValueError("t_min_mjd must not exceed t_max_mjd")
        if self.product_ids is not None and len(set(self.product_ids)) != len(self.product_ids):
            raise ValueError("product_ids must be unique")
        for value in (self.ra, self.dec, self.size, self.t_min_mjd, self.t_max_mjd):
            if value is not None and not math.isfinite(value):
                raise ValueError("numbers must be finite")
        return self

    def stored(self) -> dict:
        return self.model_dump(mode="json", exclude_none=True)


TagIds = Annotated[list[UUID], Field(max_length=5)]
Links = Annotated[list[Link], Field(max_length=10)]


def _unique_ids(value: list[UUID] | None) -> list[UUID] | None:
    if value is not None and len(set(value)) != len(value):
        raise ValueError("hashtag_ids must be unique")
    return value


class DraftCreate(Strict):
    title: Annotated[str, Field(max_length=150)] = ""
    body: Annotated[str, Field(max_length=20000)] = ""
    hashtag_ids: TagIds = []
    links: Links = []
    sky_context: SkyContext | None = None

    _ids = field_validator("hashtag_ids")(_unique_ids)


DRAFT_FIELDS = ("title", "body", "hashtag_ids", "links", "sky_context")


class DraftUpdate(Strict):
    expected_version: Version
    title: Annotated[str, Field(max_length=150)] | None = None
    body: Annotated[str, Field(max_length=20000)] | None = None
    hashtag_ids: TagIds | None = None
    links: Links | None = None
    sky_context: SkyContext | None = None

    _ids = field_validator("hashtag_ids")(_unique_ids)

    @model_validator(mode="after")
    def _some_field(self):
        given = self.model_fields_set.intersection(DRAFT_FIELDS)
        if not given:
            raise ValueError("at least one draft field is required")
        for name in ("title", "body", "hashtag_ids", "links"):
            if name in given and getattr(self, name) is None:
                raise ValueError(f"{name} must not be null")
        return self


class RevisionCreate(Strict):
    base_revision_id: UUID
    expected_post_version: Version


class Transition(Strict):
    expected_revision_version: Version
    expected_post_version: Version


class Approve(Transition):
    decision: Literal["approve"]


class Reject(Transition):
    decision: Literal["reject"]
    reason_code: Literal[
        "off_topic", "spam", "abuse", "personal_information", "needs_context", "other"
    ]
    reason: ReasonText

    _reason = field_validator("reason")(nonblank)


ReviewDecision = Annotated[Approve | Reject, Field(discriminator="decision")]


class VisibilityChange(Strict):
    action: Literal["hide", "restore"]
    expected_version: Version
    reason: ReasonText

    _reason = field_validator("reason")(nonblank)


class CommentCreate(Strict):
    body: Annotated[str, Field(min_length=1, max_length=3000)]
    observed_revision_id: UUID

    _body = field_validator("body")(nonblank)


class CommentUpdate(Strict):
    body: Annotated[str, Field(min_length=1, max_length=3000)]
    expected_version: Version

    _body = field_validator("body")(nonblank)


ReportReason = Literal["off_topic", "spam", "abuse", "personal_information", "other"]


class ReportCreate(Strict):
    target_type: Literal["post", "comment"]
    target_id: UUID
    reason_code: ReportReason
    description: Annotated[str, Field(max_length=2000)] = ""

    @model_validator(mode="after")
    def _description(self):
        self.description = clean(self.description)
        if self.reason_code == "other" and not self.description:
            raise ValueError("reason other requires a description")
        return self


class ReportDecision(Strict):
    decision: Literal["resolved", "dismissed"]
    expected_version: Version
    reason: ReasonText

    _reason = field_validator("reason")(nonblank)


class NotificationRead(Strict):
    read: Literal[True]
