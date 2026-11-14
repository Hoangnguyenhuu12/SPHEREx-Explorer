CREATE SCHEMA IF NOT EXISTS sky_archive;

CREATE TABLE IF NOT EXISTS sky_archive.targets (
    target_key text PRIMARY KEY,
    name text NOT NULL,
    ra_deg double precision NOT NULL CHECK (ra_deg >= 0 AND ra_deg < 360),
    dec_deg double precision NOT NULL CHECK (dec_deg BETWEEN -90 AND 90)
);

CREATE TABLE IF NOT EXISTS sky_archive.products (
    product_id text PRIMARY KEY,
    collection text NOT NULL,
    obs_id text NOT NULL,
    publisher_did text,
    band text,
    mjd_start double precision,
    mjd_end double precision,
    access_url text NOT NULL,
    metadata jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS sky_archive.target_products (
    target_key text NOT NULL REFERENCES sky_archive.targets,
    product_id text NOT NULL REFERENCES sky_archive.products,
    search_ra_deg double precision NOT NULL,
    search_dec_deg double precision NOT NULL,
    search_radius_deg double precision NOT NULL CHECK (search_radius_deg > 0),
    PRIMARY KEY (target_key, product_id, search_ra_deg, search_dec_deg, search_radius_deg)
);

CREATE TABLE IF NOT EXISTS sky_archive.cutouts (
    product_id text NOT NULL REFERENCES sky_archive.products,
    center_ra_deg double precision NOT NULL,
    center_dec_deg double precision NOT NULL,
    size_deg double precision NOT NULL CHECK (size_deg > 0),
    relative_path text NOT NULL,
    byte_count bigint NOT NULL CHECK (byte_count > 0),
    sha256 text NOT NULL CHECK (length(sha256) = 64),
    PRIMARY KEY (product_id, center_ra_deg, center_dec_deg, size_deg)
);

CREATE INDEX IF NOT EXISTS sky_archive_products_collection_time_idx
    ON sky_archive.products (collection, mjd_start);

CREATE TABLE IF NOT EXISTS sky_archive.gaia_dr3 (
    source_id bigint PRIMARY KEY,
    ra_deg double precision NOT NULL,
    dec_deg double precision NOT NULL,
    g_mag double precision,
    parallax_mas double precision,
    pmra_mas_yr double precision,
    pmdec_mas_yr double precision,
    metadata jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS sky_archive.target_gaia_dr3 (
    target_key text NOT NULL REFERENCES sky_archive.targets,
    source_id bigint NOT NULL REFERENCES sky_archive.gaia_dr3,
    search_ra_deg double precision NOT NULL,
    search_dec_deg double precision NOT NULL,
    search_radius_deg double precision NOT NULL CHECK (search_radius_deg > 0),
    PRIMARY KEY (target_key, source_id, search_ra_deg, search_dec_deg, search_radius_deg)
);
