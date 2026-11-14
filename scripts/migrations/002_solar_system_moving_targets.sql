-- Migration 002: Solar System moving-target test suite compatible with sky_archive
-- Upserts are keyed by archive product_id (e.g. publisher_did) and target_key.

CREATE SCHEMA IF NOT EXISTS sky_archive;

CREATE TABLE IF NOT EXISTS sky_archive.solar_system_targets (
    target_key text PRIMARY KEY,
    name text NOT NULL,
    designation text,
    body_type text NOT NULL CHECK (body_type IN ('asteroid', 'comet', 'unknown')),
    verification_status text NOT NULL CHECK (
        verification_status IN ('verified_metadata', 'coverage_only_unconfirmed', 'unconfirmed')
    ),
    verification_notes text,
    source_archive text NOT NULL,
    provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sky_archive.moving_target_observations (
    product_id text PRIMARY KEY REFERENCES sky_archive.products(product_id) ON DELETE CASCADE,
    target_key text NOT NULL REFERENCES sky_archive.solar_system_targets(target_key) ON DELETE CASCADE,
    source_archive text NOT NULL,
    obs_id text NOT NULL,
    publisher_did text NOT NULL,
    target_name_raw text NOT NULL,
    target_moving boolean NOT NULL DEFAULT false,
    calibration_level integer,
    mjd_start double precision NOT NULL,
    mjd_end double precision,
    observed_at timestamptz,
    ra_deg double precision NOT NULL CHECK (ra_deg >= 0 AND ra_deg < 360),
    dec_deg double precision NOT NULL CHECK (dec_deg BETWEEN -90 AND 90),
    fov_deg double precision,
    coverage_region text,
    band_filter text,
    fits_url text NOT NULL,
    datalink_url text,
    local_fits_path text,
    fits_sha256 text,
    fits_bytes bigint,
    wcs_verified boolean NOT NULL DEFAULT false,
    header_time_verified boolean NOT NULL DEFAULT false,
    header_obs_utc text,
    object_identification_status text NOT NULL DEFAULT 'unconfirmed' CHECK (
        object_identification_status IN ('verified_metadata', 'unconfirmed')
    ),
    provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moving_target_obs_target_time_idx
    ON sky_archive.moving_target_observations (target_key, mjd_start);
