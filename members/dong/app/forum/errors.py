"""Forum error type mapped to the shared {api_version, error} envelope."""

from __future__ import annotations

from typing import Any

MESSAGES = {
    400: ("BAD_PARAM", "Invalid request parameters."),
    401: ("UNAUTHORIZED", "A valid access token is required."),
    403: ("FORBIDDEN", "Operation not permitted."),
    404: ("NOT_FOUND", "Resource not found."),
    409: ("CONFLICT", "Resource changed or action conflicts with state."),
    429: ("RATE_LIMITED", "Too many requests."),
    500: ("INTERNAL", "Internal processing error."),
    503: ("SERVICE_UNAVAILABLE", "Forum dependency unavailable."),
}


class ForumError(Exception):
    def __init__(
        self,
        status: int,
        details: dict[str, Any] | None = None,
        message: str | None = None,
        headers: dict[str, str] | None = None,
    ):
        code, default_message = MESSAGES[status]
        super().__init__(message or default_message)
        self.status = status
        self.code = code
        self.message = message or default_message
        self.details = details or {}
        self.headers = headers or {}

    def body(self) -> dict[str, Any]:
        return {
            "api_version": "0.1",
            "error": {"code": self.code, "message": self.message, "details": self.details},
        }


def bad_param(reason: str | None = None, **details: Any) -> ForumError:
    if reason:
        details["reason"] = reason
    return ForumError(400, details)


def unauthorized() -> ForumError:
    return ForumError(401, headers={"WWW-Authenticate": "Bearer"})


def forbidden(reason: str | None = None) -> ForumError:
    return ForumError(403, {"reason": reason} if reason else {})


def not_found() -> ForumError:
    return ForumError(404)


def conflict(reason: str, **details: Any) -> ForumError:
    return ForumError(409, {"reason": reason, **details})


def unavailable() -> ForumError:
    return ForumError(503)


def stale() -> ForumError:
    return conflict("STALE_VERSION")


def invalid_state() -> ForumError:
    return conflict("INVALID_STATE")
