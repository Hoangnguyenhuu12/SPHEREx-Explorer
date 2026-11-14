"""Read-only HTTP routes exposing sky_archive HiPS, Gaia DR3, and overlay metadata."""

from typing import Annotated

from fastapi import APIRouter, Query

from .services import combined_timeline, database_provider, fixtures

router = APIRouter(prefix="/api/sky-archive", include_in_schema=False)

KNOWN_TARGETS = frozenset({"barnard", "epsindib", "wise0855", "rwaur", "rdra"})


@router.get("/hips-layers")
def hips_layers(layer_id: Annotated[str | None, Query(max_length=200)] = None):
    if not database_provider.enabled():
        return {"api_version": "0.1", "source": "disabled", "layers": []}
    try:
        rows = database_provider.hips_layers(layer_id)
    except database_provider.DatabaseError:
        fixtures.fail(503, "DATABASE_UNAVAILABLE", "Supabase sky_archive hips_layers is unavailable.")
    return {"api_version": "0.1", "source": "sky_archive.hips_layers", "layers": rows}


@router.get("/gaia")
def gaia_sources(
    target_key: Annotated[str, Query(min_length=1, max_length=80)],
    g_max: Annotated[float | None, Query(gt=0, le=30)] = None,
):
    if target_key not in KNOWN_TARGETS:
        fixtures.fail(404, "UNKNOWN_TARGET", "Unknown archive target.", {"target_key": target_key})
    if not database_provider.enabled():
        fixtures.fail(404, "NOT_AVAILABLE", "Gaia archive requires DATA_MODE=database.")
    try:
        rows = database_provider.gaia_for_target(target_key)
    except database_provider.DatabaseError:
        fixtures.fail(503, "DATABASE_UNAVAILABLE", "Supabase sky_archive Gaia catalog is unavailable.")
    if g_max is not None:
        rows = [r for r in rows if r["g_mag"] is not None and r["g_mag"] < g_max]
    return {
        "api_version": "0.1",
        "target_key": target_key,
        "source": "sky_archive.target_gaia_dr3",
        "count": len(rows),
        "sources": rows,
    }


@router.get("/combined-timeline/gaia-overlays")
def combined_gaia_overlays(
    sequence_id: Annotated[str, Query(min_length=1, max_length=120)] = combined_timeline.SEQUENCE_ID,
    frame_index: Annotated[int | None, Query(ge=1)] = None,
    in_frame_only: bool = True,
):
    if not database_provider.enabled():
        fixtures.fail(404, "NOT_AVAILABLE", "Combined Gaia overlays require DATA_MODE=database.")
    try:
        payload = combined_timeline.gaia_overlays(
            sequence_id=sequence_id,
            frame_index=frame_index,
            in_frame_only=in_frame_only,
        )
    except database_provider.DatabaseError:
        fixtures.fail(503, "DATABASE_UNAVAILABLE", "Supabase sky_archive Gaia overlays are unavailable.")
    if payload is None:
        fixtures.fail(404, "TIMELINE_UNAVAILABLE", "Combined timeline sequence is unavailable.")
    return {"api_version": "0.1", "source": "sky_archive.gaia_frame_overlays", **payload}
