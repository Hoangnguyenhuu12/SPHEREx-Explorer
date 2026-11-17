"""Progressive /api/views and Explorer OpenAPI schema routes (mounted include_in_schema=False in main.py)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .services import view_jobs

router = APIRouter()


class CreateViewRequest(BaseModel):
    ra: float | None = Field(default=None, ge=0.0, lt=360.0)
    dec: float | None = Field(default=None, ge=-90.0, le=90.0)
    name: str | None = Field(default=None, max_length=120)
    fov_arcmin: float = Field(default=8.0, gt=0.0, le=30.0)
    detector: int = Field(default=6, ge=1, le=6)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "127.0.0.1")


@router.post("/api/views")
def create_view(body: CreateViewRequest, request: Request):
    try:
        return view_jobs.create_view_job(
            ra=body.ra,
            dec=body.dec,
            name=body.name,
            fov_arcmin=body.fov_arcmin,
            detector=body.detector,
            client_ip=_client_ip(request),
            run_async=True,
        )
    except view_jobs.ViewJobError as exc:
        return JSONResponse(
            {"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
            status_code=exc.status,
        )


@router.get("/api/views/{job_id}")
def get_view(job_id: str):
    try:
        return view_jobs.get_view_job(job_id)
    except view_jobs.ViewJobError as exc:
        return JSONResponse(
            {"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
            status_code=exc.status,
        )


@router.get("/api/explorer-openapi.json")
def explorer_openapi(request: Request):
    routes = [*request.app.routes, *router.routes]
    return get_openapi(
        title="SPHEREx Explorer API (Full)",
        version="0.2",
        routes=routes,
    )
