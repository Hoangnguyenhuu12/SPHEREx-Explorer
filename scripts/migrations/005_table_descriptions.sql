-- Migration 005: Add PostgreSQL/Supabase table descriptions (COMMENT ON TABLE) for sky_archive tables
-- Preserves existing comments on dr1_sequences, qr3_frames, and qr3_target_checks.

COMMENT ON TABLE sky_archive.targets IS
    'Five reference benchmark targets (barnard, epsindib, wise0855, rwaur, rdra) with ICRS J2000.0 coordinates.';

COMMENT ON TABLE sky_archive.products IS
    'Archive product catalog (SPHEREx DR1/QR3, WISE/unWISE, NEOSSat, external cutouts) keyed by archive product_id with mission, release, detector, MJD bounds, footprint, and access URL.';

COMMENT ON TABLE sky_archive.target_products IS
    'Many-to-many spatial search matches linking reference targets to sky_archive.products within query RA/Dec/radius_deg.';

COMMENT ON TABLE sky_archive.cutouts IS
    'Downloaded FITS cutout artifacts linked to products, storing local relative path, byte size, SHA-256 checksum, upload status, and Supabase Storage URL.';

COMMENT ON TABLE sky_archive.archive_records IS
    'Unified multi-mission inventory index normalizing external archive records, footprints, storage URLs, upload state, and provenance across sources.';

COMMENT ON TABLE sky_archive.spherex_observations IS
    'SPHEREx DR1 and QR3 observations harvested from NASA/IPAC IRSA SIA/ObsCore with detector D1-D6, wavelength range (m), MJD bounds, s_region footprint, and target-pixel verification.';

COMMENT ON TABLE sky_archive.spherex_query_audits IS
    'Audit log of IRSA SPHEREx queries per target, release, and search radius, distinguishing ok vs api_error, empty result, query intersection, and valid target pixels.';

COMMENT ON TABLE sky_archive.hips_layers IS
    'Registered all-sky HiPS survey layers (e.g. SPHEREx DR1 All-Sky Cube 102 spectral channels), storing service URLs, HEALPix order, spectral metadata, and verified sample tiles.';

COMMENT ON TABLE sky_archive.dr1_frames IS
    'Per-frame SPHEREx DR1 cutout acquisition and screening log per target and detector, recording download status (downloaded, deferred_503, not_covered), predicted target pixels, flags, and usability.';

COMMENT ON TABLE sky_archive.dr1_pairs IS
    'Selected early-vs-late SPHEREx DR1 frame pairs reprojected to a common grid for quick blink comparison, including wavelength separation and common pixel coverage metrics.';

COMMENT ON TABLE sky_archive.gaia_dr3 IS
    'Gaia DR3 reference star catalog (ICRS coordinates at ref_epoch_jyear=2016.0, G magnitude, parallax, proper motion pmra/pmdec, and astrometric errors).';

COMMENT ON TABLE sky_archive.target_gaia_dr3 IS
    'Spatial cone-search associations linking Gaia DR3 sources to each benchmark target field (e.g. 0.08 deg radius around target sightlines).';

COMMENT ON TABLE sky_archive.unwise_epoch_cutouts IS
    'Time-resolved unWISE W1/W2 epoch FITS coadd cutouts retrieved from WiseView, keyed by release, coadd_id, epoch, band, search center, and pixel size with MJD bounds and SHA-256.';

COMMENT ON TABLE sky_archive.combined_timeline_sequences IS
    'Multi-mission blink sequences (e.g. unWISE W2 -> SPHEREx D6) projected onto a fixed TAN WCS grid, recording mission time gap and Gaia proper-motion propagation model assumptions.';

COMMENT ON TABLE sky_archive.combined_timeline_frames IS
    'Ordered per-frame entries for combined multi-mission sequences, holding timestamp, wavelength, predicted target pixel coordinates on the fixed grid, valid pixel fraction, and local/storage asset paths.';

COMMENT ON TABLE sky_archive.gaia_frame_overlays IS
    'Epoch-propagated Gaia DR3 overlay positions per sequence frame (linear angular proper motion only, no parallax/ephemeris), with fixed-grid pixel coordinates and in_frame visibility flag.';

COMMENT ON TABLE sky_archive.qr3_searches IS
    'Audit log of SPHEREx QR3 cone/region queries per target and reference MJD, storing HTTP status, result counts, errors, and provenance.';

COMMENT ON TABLE sky_archive.solar_system_targets IS
    'Moving Solar System benchmark targets (e.g. asteroid 1999-KW4) with body type, archive source, and metadata identification verification status.';

COMMENT ON TABLE sky_archive.moving_target_observations IS
    'Time-tagged moving-target observations (e.g. CADC NEOSSat), recording ephemeris/pointing RA/Dec, FoV/coverage region, FITS URL/checksum, header time check, and WCS verification.';
