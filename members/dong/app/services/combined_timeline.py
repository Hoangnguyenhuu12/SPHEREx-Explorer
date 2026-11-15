"""Serve the prebuilt WISE 0855 timeline and its WCS-aligned viewer assets."""

import hashlib
import json
import os
import re
from pathlib import Path

from ..api_models import Frame, Frames, Grid
from . import database_provider

ROOT = Path(__file__).resolve().parents[4]
SEQUENCE_ID = 'wise0855:unwise_w2_to_spherex_d6'
KNOWN_TIMELINE_TARGETS = frozenset({'barnard', 'wise0855', 'epsindib', 'rwaur', 'rdra'})
ASSET_NAME = re.compile(r'frame_[0-9]{3,}_(?:unwise|spherex)\.png')


def sequence_id_for(target_key='wise0855', detector=6):
    return f'{target_key}:unwise_w2_to_spherex_d{detector}'


def sequence_directory(target_key='wise0855', detector=6):
    if target_key == 'wise0855' and detector == 6 and os.getenv('WISE0855_SEQUENCE_DIR'):
        return (ROOT / os.getenv('WISE0855_SEQUENCE_DIR')).resolve()
    default = ROOT / 'data' / 'processed_sequences' / f'{target_key}_unwise_spherex_d{detector}'
    return default.resolve()


def asset_path(name, target_key='wise0855', detector=6):
    if target_key in KNOWN_TIMELINE_TARGETS and ASSET_NAME.fullmatch(name):
        path = sequence_directory(target_key, detector) / 'player' / name
        if path.is_file():
            return path
    return None


def fits_path(target_key='wise0855', detector=6):
    if target_key in KNOWN_TIMELINE_TARGETS:
        path = sequence_directory(target_key, detector) / 'aligned_sequence.fits'
        if path.is_file():
            return path
    return None


def _build_frames_response(wcs, rows, query, target):
    grid = Grid(
        width=wcs['width'],
        height=wcs['height'],
        pixscale_arcsec=wcs['pixel_scale_arcsec'],
        projection='TAN',
        center_ra=wcs['CRVAL1'],
        center_dec=wcs['CRVAL2'],
    )
    ordered = sorted(rows, key=lambda row: row['observed_mjd'])
    if not ordered:
        raise ValueError('The timeline manifest contains no observations')
    target_key = target.target_key or 'wise0855'
    seq_id = sequence_id_for(target_key, query.detector)
    results = []
    saturated = False
    for row in ordered[: query.max_frames]:
        raw_png = row.get('png') or row.get('local_asset_path') or ''
        name = Path(raw_png).name
        if not ASSET_NAME.fullmatch(name):
            raise ValueError('Invalid timeline asset filename')
        identity = [seq_id, row['mission'], row['release'], row['source_product_id'], row['band_or_detector']]
        frame_id = hashlib.sha256(json.dumps(identity).encode()).hexdigest()[:24]
        iso = row.get('observed_utc') or row.get('observed_at')
        if 'saturated' in str(row.get('quality_label') or ''):
            saturated = True
        local_png = (
            f'/api/frames/wise0855/{name}'
            if target_key == 'wise0855'
            else f'/api/frames/combined/{target_key}/{name}'
        )
        storage_url = str(row.get('storage_url') or '')
        if asset_path(name, target_key, query.detector) is not None:
            png_url = local_png
        elif storage_url.startswith(('http://', 'https://')):
            png_url = storage_url
        else:
            png_url = local_png
        results.append(
            Frame(
                id=f'{target_key}-{frame_id}',
                mjd=row['observed_mjd'],
                iso=iso,
                wavelength_um=row['wavelength_um'],
                bandwidth_um=row.get('bandwidth_um'),
                release=row['release'],
                survey=None,
                bad_pixel_frac=None,
                predicted_px=(row['predicted_x_px'], row['predicted_y_png_px']),
                png=png_url,
                diff_png=None,
                mission=row['mission'],
                band_or_detector=row['band_or_detector'],
                quality_label=row['quality_label'],
                source_product_id=row['source_product_id'],
            )
        )
    if not str(results[0].png).startswith(('http://', 'https://')) and not asset_path(
        Path(results[0].png).name, target_key, query.detector
    ):
        raise FileNotFoundError('First viewer PNG is missing')
    warnings = []
    if len(results) < len(ordered):
        warnings.append('TRUNCATED')
    if saturated:
        warnings.append('SATURATION_POSSIBLE')
    return Frames(
        api_version='0.1',
        target=target,
        detector=query.detector,
        grid=grid,
        norm=None,
        reference_frame_id=None,
        frames=results,
        warnings=warnings,
    )


def frames(query, target):
    target_key = target.target_key or 'wise0855'
    seq_id = sequence_id_for(target_key, query.detector)
    if database_provider.enabled():
        try:
            seq = database_provider.combined_timeline_sequence(seq_id)
            rows = database_provider.combined_timeline_frames(seq_id) if seq else []
            if seq and seq.get('target_key') == target_key and rows:
                return _build_frames_response(seq['grid_wcs'], rows, query, target)
        except database_provider.DatabaseError:
            pass
    manifest = json.loads((sequence_directory(target_key, query.detector) / 'sequence_manifest.json').read_text(encoding='utf-8'))
    if manifest['sequence_id'] != seq_id or manifest['target_key'] != target_key:
        raise ValueError('Unexpected timeline manifest')
    return _build_frames_response(manifest['grid_wcs'], manifest['frames'], query, target)


def gaia_overlays(sequence_id=SEQUENCE_ID, frame_index=None, in_frame_only=True):
    seq = database_provider.combined_timeline_sequence(sequence_id)
    if not seq:
        return None
    rows = database_provider.gaia_frame_overlays(
        sequence_id,
        frame_index=frame_index,
        in_frame_only=in_frame_only,
    )
    assets = seq.get('assets') if isinstance(seq.get('assets'), dict) else {}
    return {
        'sequence_id': sequence_id,
        'upload_status': seq.get('upload_status') or 'local_only',
        'public_urls': assets.get('public_urls') if isinstance(assets.get('public_urls'), dict) else {},
        'gaia_propagation_model': seq.get('gaia_propagation_model') or 'angular_proper_motion_only',
        'annual_parallax_included': bool(seq.get('annual_parallax_included', False)),
        'observer_ephemeris_included': bool(seq.get('observer_ephemeris_included', False)),
        'target_astrometry_source': seq.get('target_astrometry_source'),
        'overlays': rows,
    }
