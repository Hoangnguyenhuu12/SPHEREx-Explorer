"""HTTP routes for the current seven-endpoint API contract."""

from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse, Response

from .api_models import (
    Astrometry,
    ErrorResponse,
    Frames,
    FramesQuery,
    Health,
    Photometry,
    PhotometryQuery,
    Resolve,
    ResolveQuery,
    ScienceQuery,
)
from .services import combined_timeline, fixtures

router = APIRouter()
ERRORS = {code: {"model": ErrorResponse} for code in (400, 404, 500, 502, 503, 504)}


@router.get("/api/health", response_model=Health, responses=ERRORS)
def health():
    return fixtures.health()


@router.get("/api/resolve", response_model=Resolve, responses=ERRORS)
def resolve(query: Annotated[ResolveQuery, Query()]):
    return fixtures.resolve(query)


@router.get("/api/frames", response_model=Frames, response_model_exclude_unset=True, responses=ERRORS)
def frames(query: Annotated[FramesQuery, Query()], response: Response):
    return fixtures.frames(query, response)


@router.get('/api/frames/wise0855/aligned_sequence.fits', response_class=FileResponse, include_in_schema=False,
            responses={200: {'content': {'application/fits': {}}}, **ERRORS})
def combined_fits():
    path = combined_timeline.fits_path('wise0855', 6)
    if path is None:
        fixtures.fail(404, 'TIMELINE_UNAVAILABLE', 'The aligned FITS cube is unavailable.')
    return FileResponse(
        path,
        media_type='application/fits',
        filename='wise0855_aligned_sequence.fits',
        headers={'Cache-Control': 'public, max-age=300'},
    )


@router.get('/api/frames/wise0855/{name}', response_class=FileResponse,
            responses={200: {'content': {'image/png': {}}}, **ERRORS})
def combined_png(name: str):
    path = combined_timeline.asset_path(name, 'wise0855', 6)
    if path is None:
        fixtures.fail(404, 'TIMELINE_UNAVAILABLE', 'The prebuilt observation image is unavailable.')
    return FileResponse(path, media_type='image/png', headers={'Cache-Control': 'public, max-age=300'})


@router.get('/api/frames/combined/{target_key}/aligned_sequence.fits', response_class=FileResponse, include_in_schema=False,
            responses={200: {'content': {'application/fits': {}}}, **ERRORS})
def combined_target_fits(target_key: str):
    path = combined_timeline.fits_path(target_key, 6)
    if path is None:
        fixtures.fail(404, 'TIMELINE_UNAVAILABLE', 'The aligned FITS cube is unavailable.')
    return FileResponse(
        path,
        media_type='application/fits',
        filename=f'{target_key}_aligned_sequence.fits',
        headers={'Cache-Control': 'public, max-age=300'},
    )


@router.get('/api/frames/combined/{target_key}/{name}', response_class=FileResponse, include_in_schema=False,
            responses={200: {'content': {'image/png': {}}}, **ERRORS})
def combined_target_png(target_key: str, name: str):
    path = combined_timeline.asset_path(name, target_key, 6)
    if path is None:
        fixtures.fail(404, 'TIMELINE_UNAVAILABLE', 'The prebuilt observation image is unavailable.')
    return FileResponse(path, media_type='image/png', headers={'Cache-Control': 'public, max-age=300'})


@router.get(
    "/api/frames/{id}.png",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}, **ERRORS},
)
def png(id: str):
    return Response(
        fixtures.image(id, 0),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get(
    "/api/frames/{id}/diff.png",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}, **ERRORS},
)
def diff_png(id: str):
    return Response(
        fixtures.image(id, 1),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/api/photometry", response_model=Photometry, responses=ERRORS)
def photometry(query: Annotated[PhotometryQuery, Query()]):
    return fixtures.photometry(query)


@router.get("/api/astrometry", response_model=Astrometry, responses=ERRORS)
def astrometry(query: Annotated[ScienceQuery, Query()]):
    return fixtures.astrometry(query)


@router.get("/api/spectrum", responses=ERRORS)
def spectrum(query: Annotated[ScienceQuery, Query()]):
    return fixtures.spectrum(query)
