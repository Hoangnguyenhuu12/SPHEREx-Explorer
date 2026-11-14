-- Migration 007: Unified DR1 + QR3 SPHEREx SQL views (non-destructive, compatible with active DR1/QR3 writer scripts)

CREATE OR REPLACE VIEW sky_archive.spherex_frames
WITH (security_invoker = true) AS
SELECT
    df.frame_id,
    df.target_key,
    df.product_id,
    df.obs_id,
    df.detector,
    lower(df.release) AS release,
    NULL::text AS processing_version,
    df.observed_mjd,
    df.observed_at,
    df.wavelength_um,
    df.bandwidth_um,
    CASE
        WHEN df.usable IS TRUE THEN 'screened'
        WHEN df.usable IS FALSE THEN 'display_only'
        ELSE COALESCE(df.download_status, 'unscreened')
    END AS kind,
    df.usable,
    df.download_status,
    NULL::text AS upload_status,
    df.cutout_url,
    df.cutout_sha256,
    df.cutout_bytes,
    df.predicted_ra_deg,
    df.predicted_dec_deg,
    df.predicted_pixel_x,
    df.predicted_pixel_y,
    df.target_inside,
    df.target_pixel_finite,
    df.target_pixel_flags,
    df.bad_flags,
    NULL::smallint AS sequence_index,
    NULL::smallint AS sequence_length,
    '{}'::jsonb AS assets,
    '{}'::jsonb AS public_urls,
    df.reasons,
    df.provenance,
    df.updated_at
FROM sky_archive.dr1_frames df

UNION ALL

SELECT
    q.frame_id,
    q.target_key,
    q.product_id,
    q.obs_id,
    q.detector,
    lower(q.release) AS release,
    q.processing_version,
    q.observed_mjd,
    q.observed_at,
    CASE
        WHEN so.em_min_m IS NOT NULL AND so.em_max_m IS NOT NULL
        THEN (so.em_min_m + so.em_max_m) * 500000.0
        ELSE NULL::double precision
    END AS wavelength_um,
    CASE
        WHEN so.em_min_m IS NOT NULL AND so.em_max_m IS NOT NULL
        THEN (so.em_max_m - so.em_min_m) * 1000000.0
        ELSE NULL::double precision
    END AS bandwidth_um,
    q.kind,
    (q.kind = 'screened') AS usable,
    COALESCE(tc.cutout_status, 'downloaded') AS download_status,
    q.upload_status,
    q.source_cutout_url AS cutout_url,
    q.source_cutout_sha256 AS cutout_sha256,
    tc.cutout_bytes,
    tc.predicted_ra_deg,
    tc.predicted_dec_deg,
    CASE WHEN array_length(q.predicted_px, 1) >= 1 THEN q.predicted_px[1] ELSE NULL::double precision END AS predicted_pixel_x,
    CASE WHEN array_length(q.predicted_px, 1) >= 2 THEN q.predicted_px[2] ELSE NULL::double precision END AS predicted_pixel_y,
    tc.target_pixel_inside AS target_inside,
    tc.target_pixel_finite,
    tc.target_pixel_flags,
    tc.bad_flags,
    q.sequence_index,
    q.sequence_length,
    q.assets,
    q.public_urls,
    q.reasons,
    q.provenance,
    q.updated_at
FROM sky_archive.qr3_frames q
LEFT JOIN sky_archive.qr3_target_checks tc
    ON tc.target_key = q.target_key AND tc.product_id = q.product_id
LEFT JOIN sky_archive.spherex_observations so
    ON so.product_id = q.product_id;


CREATE OR REPLACE VIEW sky_archive.spherex_sequences
WITH (security_invoker = true) AS
SELECT
    ds.sequence_id,
    ds.target_key,
    ds.detector,
    'dr1'::text AS release,
    NULL::text AS processing_version,
    ds.kind,
    ds.is_primary,
    ds.frame_ids,
    ds.frame_count,
    ds.epoch_mjds,
    ds.wavelengths_um,
    ds.span_days,
    ds.common_coverage_fraction,
    ds.common_valid_pixels,
    ds.grid_width,
    ds.grid_height,
    ds.pixel_scale_arcsec,
    ds.norm,
    ds.assets,
    ds.upload_status,
    ds.status,
    ds.warnings,
    ds.updated_at
FROM sky_archive.dr1_sequences ds

UNION ALL

SELECT
    format('%s:%s:D%s:%s', lower(q.release), q.target_key, q.detector, q.processing_version) AS sequence_id,
    q.target_key,
    q.detector,
    lower(q.release) AS release,
    q.processing_version,
    CASE
        WHEN bool_or(q.kind = 'screened') THEN 'screened'
        ELSE 'display_only'
    END AS kind,
    false AS is_primary,
    array_agg(q.frame_id ORDER BY q.sequence_index, q.observed_mjd) AS frame_ids,
    count(*)::integer AS frame_count,
    array_agg(q.observed_mjd ORDER BY q.sequence_index, q.observed_mjd) AS epoch_mjds,
    NULL::double precision[] AS wavelengths_um,
    (max(q.observed_mjd) - min(q.observed_mjd)) AS span_days,
    NULL::double precision AS common_coverage_fraction,
    NULL::integer AS common_valid_pixels,
    ((array_agg(q.grid ORDER BY q.sequence_index, q.observed_mjd))[1] -> 'shape' ->> 0)::integer AS grid_width,
    ((array_agg(q.grid ORDER BY q.sequence_index, q.observed_mjd))[1] -> 'shape' ->> 1)::integer AS grid_height,
    NULL::double precision AS pixel_scale_arcsec,
    (array_agg(q.norm ORDER BY q.sequence_index, q.observed_mjd))[1] AS norm,
    jsonb_agg(
        jsonb_build_object(
            'frame_id', q.frame_id,
            'sequence_index', q.sequence_index,
            'observed_mjd', q.observed_mjd,
            'kind', q.kind,
            'upload_status', q.upload_status,
            'assets', q.assets,
            'public_urls', q.public_urls
        )
        ORDER BY q.sequence_index, q.observed_mjd
    ) AS assets,
    CASE
        WHEN bool_and(q.upload_status = 'uploaded') THEN 'uploaded'
        WHEN bool_or(q.upload_status = 'uploaded') THEN 'partial'
        ELSE max(q.upload_status)
    END AS upload_status,
    CASE
        WHEN bool_or(q.kind = 'screened') THEN 'preliminary_engineering_diagnostic'
        ELSE 'display_only_not_a_measurement'
    END AS status,
    ARRAY[]::text[] AS warnings,
    max(q.updated_at) AS updated_at
FROM sky_archive.qr3_frames q
GROUP BY lower(q.release), q.target_key, q.detector, q.processing_version;


GRANT SELECT ON sky_archive.spherex_frames, sky_archive.spherex_sequences TO anon, authenticated;

COMMENT ON VIEW sky_archive.spherex_frames IS
    'Unified read-only view combining sky_archive.dr1_frames and sky_archive.qr3_frames (enriched with qr3_target_checks and spherex_observations) across releases.';

COMMENT ON VIEW sky_archive.spherex_sequences IS
    'Unified read-only sequence view combining sky_archive.dr1_sequences (DR1) and grouped sequences from sky_archive.qr3_frames (QR3).';
