-- Migration 006: Streamline sky_archive after full backup (2026-11-15)
-- 1. Merge qr3_searches into spherex_query_audits and drop redundant qr3_searches.
-- 2. Drop dead prototype table archive_records (7 rows) and superseded 2-frame MVP table dr1_pairs (239 rows).
-- 3. Deduplicate target_gaia_dr3 (keep 0.08 deg superset) and target_products (1 link per target_key + product_id).
-- 4. Ensure public read RLS policy on qr3_frames and qr3_target_checks for PostgREST consistency.

BEGIN;

DO $$
BEGIN
    IF to_regclass('sky_archive.qr3_searches') IS NOT NULL THEN
        INSERT INTO sky_archive.spherex_query_audits (
            audit_id,
            target_key,
            release,
            epoch_mjd,
            query_ra_deg,
            query_dec_deg,
            query_radius_deg,
            api_status,
            error_detail,
            product_count,
            detector_counts,
            cutouts_checked,
            valid_pixel_count,
            classification,
            notes,
            updated_at
        )
        SELECT
            'qr3_search:' || s.search_id,
            s.target_key,
            lower(COALESCE(s.release, 'spherex_qr3')),
            s.reference_mjd,
            s.search_ra_deg,
            s.search_dec_deg,
            s.search_radius_deg,
            CASE WHEN s.http_status >= 400 OR s.error IS NOT NULL THEN 'api_error' ELSE 'ok' END,
            s.error,
            COALESCE(s.result_count, 0),
            '{}'::jsonb,
            0,
            0,
            s.status,
            format('Merged from qr3_searches (%s, http=%s, service=%s)', s.search_kind, s.http_status, s.service_url),
            s.queried_at
        FROM sky_archive.qr3_searches s
        ON CONFLICT (audit_id) DO NOTHING;

        DROP TABLE sky_archive.qr3_searches;
    END IF;
END $$;

DROP TABLE IF EXISTS sky_archive.archive_records;
DROP TABLE IF EXISTS sky_archive.dr1_pairs;

-- Remove old smaller-radius Gaia links that are strict subsets of the 0.08 deg cone
DELETE FROM sky_archive.target_gaia_dr3 a
WHERE a.search_radius_deg <> 0.08
  AND EXISTS (
      SELECT 1
      FROM sky_archive.target_gaia_dr3 b
      WHERE b.target_key = a.target_key
        AND b.source_id = a.source_id
        AND b.search_radius_deg = 0.08
  );

-- Deduplicate multi-cone search rows in target_products while keeping one canonical row per (target_key, product_id)
DELETE FROM sky_archive.target_products tp
USING (
    SELECT ctid,
           row_number() OVER (
               PARTITION BY target_key, product_id
               ORDER BY search_radius_deg DESC, search_ra_deg ASC, search_dec_deg ASC
           ) AS rn
    FROM sky_archive.target_products
) ranked
WHERE tp.ctid = ranked.ctid
  AND ranked.rn > 1;

GRANT SELECT ON sky_archive.qr3_frames, sky_archive.qr3_target_checks TO anon, authenticated;

ALTER TABLE sky_archive.qr3_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE sky_archive.qr3_target_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON sky_archive.qr3_frames;
CREATE POLICY "public read" ON sky_archive.qr3_frames FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public read" ON sky_archive.qr3_target_checks;
CREATE POLICY "public read" ON sky_archive.qr3_target_checks FOR SELECT TO anon, authenticated USING (true);

COMMIT;
