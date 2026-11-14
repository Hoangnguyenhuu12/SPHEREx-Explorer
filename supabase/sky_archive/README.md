# sky_archive (astronomy Supabase project)

SQL applied to the astronomy archive project (schema `sky_archive`), not the forum project.
Kept out of `supabase/migrations/`, which holds the forum project's migrations and is replayed
by `members/dong/tests/forum`. Base tables (`targets`, `products`, ...) are in
`scripts/sky_archive_schema.sql`; files here add the DR1 demo tables and storage bucket used by
`scripts/sync_supabase_dr1.py`. Apply in filename order.
