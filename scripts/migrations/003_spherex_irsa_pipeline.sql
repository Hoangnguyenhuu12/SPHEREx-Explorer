-- Migration 003: SPHEREx IRSA SIA pipeline tables, query audits, and DR1 All-Sky HiPS layer
-- Compatible with existing sky_archive schema (targets, products, target_products, cutouts).

CREATE SCHEMA IF NOT EXISTS sky_archive;

CREATE TABLE IF NOT EXISTS sky_archive.spherex_observations (
    product_id text PRIMARY KEY REFERENCES sky_archive.products(product_id) ON DELETE CASCADE,
    target_key text REFERENCES sky_archive.targets(target_key) ON DELETE SET NULL,
    release text NOT NULL,
    obs_id text NOT NULL,
    publisher_did text,
    detector text,
    band_name text,
    mjd_start double precision,
    mjd_end double precision,
    em_min_m double precision,
    em_max_m double precision,
    s_ra double precision,
    s_dec double precision,
    s_region text,
    access_url text NOT NULL,
    intersects_query boolean NOT NULL DEFAULT true,
    has_valid_target_pixel boolean,
    wcs_verified boolean NOT NULL DEFAULT false,
    valid_pixel_fraction double precision,
    target_pixel_finite boolean,
    target_pixel_flags bigint,
    local_cutout_path text,
    query_ra_deg double precision,
    query_dec_deg double precision,
    query_radius_deg double precision,
    provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spherex_obs_target_release_det_idx
    ON sky_archive.spherex_observations (target_key, release, detector, mjd_start);

CREATE TABLE IF NOT EXISTS sky_archive.spherex_query_audits (
    audit_id text PRIMARY KEY,
    target_key text NOT NULL,
    release text NOT NULL,
    epoch_mjd double precision,
    query_ra_deg double precision NOT NULL,
    query_dec_deg double precision NOT NULL,
    query_radius_deg double precision NOT NULL,
    api_status text NOT NULL CHECK (api_status IN ('ok', 'api_error')),
    error_detail text,
    product_count integer NOT NULL DEFAULT 0,
    detector_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
    cutouts_checked integer NOT NULL DEFAULT 0,
    valid_pixel_count integer NOT NULL DEFAULT 0,
    classification text NOT NULL,
    notes text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sky_archive.hips_layers (
    layer_id text PRIMARY KEY,
    title text NOT NULL,
    service_url text NOT NULL,
    properties_url text NOT NULL,
    hips_version text,
    hips_frame text,
    hips_order integer,
    hips_tile_width integer,
    spectral_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    verified_tiles jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);
