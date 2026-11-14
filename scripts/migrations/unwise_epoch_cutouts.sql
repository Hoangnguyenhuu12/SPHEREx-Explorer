CREATE SCHEMA IF NOT EXISTS sky_archive;

CREATE TABLE IF NOT EXISTS sky_archive.unwise_epoch_cutouts (
    release text NOT NULL,
    coadd_id text NOT NULL,
    epoch integer NOT NULL CHECK (epoch >= 0),
    band text NOT NULL CHECK (band IN ('W1', 'W2')),
    search_ra_deg double precision NOT NULL,
    search_dec_deg double precision NOT NULL,
    requested_size_px integer NOT NULL,
    mjd_start double precision,
    mjd_end double precision,
    footprint_icrs jsonb NOT NULL,
    access_url text NOT NULL,
    sha256 text NOT NULL CHECK (length(sha256) = 64),
    storage_url text,
    metadata jsonb NOT NULL,
    PRIMARY KEY (release, coadd_id, epoch, band, search_ra_deg, search_dec_deg, requested_size_px)
);
