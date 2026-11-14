ALTER TABLE sky_archive.gaia_dr3
    ADD COLUMN IF NOT EXISTS ref_epoch_jyear double precision,
    ADD COLUMN IF NOT EXISTS ra_error_mas double precision,
    ADD COLUMN IF NOT EXISTS dec_error_mas double precision,
    ADD COLUMN IF NOT EXISTS parallax_error_mas double precision,
    ADD COLUMN IF NOT EXISTS pmra_error_mas_yr double precision,
    ADD COLUMN IF NOT EXISTS pmdec_error_mas_yr double precision;

ALTER TABLE sky_archive.target_gaia_dr3
    ADD COLUMN IF NOT EXISTS search_frame text NOT NULL DEFAULT 'ICRS';
