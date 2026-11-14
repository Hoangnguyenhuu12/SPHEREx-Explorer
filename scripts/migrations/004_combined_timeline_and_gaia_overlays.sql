-- Migration 004: Combined multi-mission timeline sequences (unWISE -> SPHEREx) and epoch-propagated Gaia overlays

CREATE SCHEMA IF NOT EXISTS sky_archive;

CREATE TABLE IF NOT EXISTS sky_archive.combined_timeline_sequences (
    sequence_id text PRIMARY KEY,
    target_key text NOT NULL REFERENCES sky_archive.targets(target_key) ON DELETE CASCADE,
    title text NOT NULL,
    missions text[] NOT NULL,
    grid_wcs jsonb NOT NULL,
    frame_count integer NOT NULL,
    unwise_frame_count integer NOT NULL,
    spherex_frame_count integer NOT NULL,
    mjd_min double precision NOT NULL,
    mjd_max double precision NOT NULL,
    mission_gap_days double precision,
    gaia_propagation_model text NOT NULL,
    annual_parallax_included boolean NOT NULL DEFAULT false,
    observer_ephemeris_included boolean NOT NULL DEFAULT false,
    target_astrometry_source text NOT NULL,
    assets jsonb NOT NULL DEFAULT '{}'::jsonb,
    upload_status text NOT NULL DEFAULT 'local_only',
    notes text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sky_archive.combined_timeline_frames (
    sequence_id text NOT NULL REFERENCES sky_archive.combined_timeline_sequences(sequence_id) ON DELETE CASCADE,
    frame_index integer NOT NULL,
    mission text NOT NULL,
    release text NOT NULL,
    source_product_id text NOT NULL,
    band_or_detector text NOT NULL,
    observed_mjd double precision NOT NULL,
    observed_at timestamptz NOT NULL,
    wavelength_um double precision,
    bandwidth_um double precision,
    quality_label text NOT NULL,
    predicted_ra_deg double precision NOT NULL,
    predicted_dec_deg double precision NOT NULL,
    predicted_x_px double precision NOT NULL,
    predicted_y_png_px double precision NOT NULL,
    valid_pixel_fraction double precision NOT NULL,
    local_asset_path text NOT NULL,
    storage_url text,
    source_sha256 text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (sequence_id, frame_index)
);

CREATE INDEX IF NOT EXISTS combined_timeline_frames_mjd_idx
    ON sky_archive.combined_timeline_frames (sequence_id, observed_mjd);

CREATE TABLE IF NOT EXISTS sky_archive.gaia_frame_overlays (
    sequence_id text NOT NULL,
    frame_index integer NOT NULL,
    source_id bigint NOT NULL REFERENCES sky_archive.gaia_dr3(source_id) ON DELETE CASCADE,
    observed_mjd double precision NOT NULL,
    catalog_ra_deg double precision NOT NULL,
    catalog_dec_deg double precision NOT NULL,
    propagated_ra_deg double precision NOT NULL,
    propagated_dec_deg double precision NOT NULL,
    pixel_x double precision NOT NULL,
    pixel_y_png double precision NOT NULL,
    in_frame boolean NOT NULL,
    has_proper_motion boolean NOT NULL,
    motion_status text NOT NULL CHECK (motion_status IN ('propagated_pm', 'catalog_static_no_pm')),
    g_mag double precision,
    PRIMARY KEY (sequence_id, frame_index, source_id),
    FOREIGN KEY (sequence_id, frame_index)
        REFERENCES sky_archive.combined_timeline_frames(sequence_id, frame_index)
        ON DELETE CASCADE
);

GRANT USAGE ON SCHEMA sky_archive TO anon, authenticated;
GRANT SELECT ON sky_archive.combined_timeline_sequences, sky_archive.combined_timeline_frames, sky_archive.gaia_frame_overlays TO anon, authenticated;

ALTER TABLE sky_archive.combined_timeline_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sky_archive.combined_timeline_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE sky_archive.gaia_frame_overlays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON sky_archive.combined_timeline_sequences;
CREATE POLICY "public read" ON sky_archive.combined_timeline_sequences FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public read" ON sky_archive.combined_timeline_frames;
CREATE POLICY "public read" ON sky_archive.combined_timeline_frames FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public read" ON sky_archive.gaia_frame_overlays;
CREATE POLICY "public read" ON sky_archive.gaia_frame_overlays FOR SELECT TO anon, authenticated USING (true);
