-- DR1 demo products: screened frames, processed comparison pairs, and a public asset bucket.
-- Backend (/api/frames) reads these with the server-side Postgres connection from .env;
-- the sky_archive schema is not exposed to anon/authenticated, and RLS is enabled with no
-- policies so the Data API cannot read or write them even if the schema is exposed later.

create table if not exists sky_archive.dr1_frames (
  frame_id            text primary key,                 -- '<target_key>:<obs_id>:D<n>'
  target_key          text not null references sky_archive.targets(target_key),
  product_id          text references sky_archive.products(product_id),
  obs_id              text not null,
  detector            smallint not null check (detector between 1 and 6),
  release             text not null default 'dr1' check (release = 'dr1'),
  observed_mjd        double precision,
  observed_at         timestamptz,
  wavelength_um       double precision,
  bandwidth_um        double precision,
  download_status     text not null default 'pending'
                      check (download_status in ('pending','downloaded','deferred_503','failed','not_covered')),
  cutout_url          text,                             -- IRSA cutout URL actually downloaded
  cutout_size_deg     double precision,
  cutout_sha256       text check (cutout_sha256 is null or length(cutout_sha256) = 64),
  cutout_bytes        bigint check (cutout_bytes is null or cutout_bytes > 0),
  predicted_ra_deg    double precision,
  predicted_dec_deg   double precision,
  predicted_pixel_x   double precision,
  predicted_pixel_y   double precision,
  target_inside       boolean,
  target_pixel_finite boolean,
  target_pixel_flags  bigint,
  bad_flags           text[] not null default '{}',
  usable              boolean,                          -- passed per-frame screening
  reasons             text[] not null default '{}',
  screening           jsonb not null default '{}'::jsonb,
  provenance          jsonb not null default '{}'::jsonb,
  updated_at          timestamptz not null default now(),
  unique (target_key, obs_id, detector)
);

create index if not exists dr1_frames_target_detector_idx on sky_archive.dr1_frames (target_key, detector, observed_mjd);

create table if not exists sky_archive.dr1_pairs (
  pair_id                   text primary key,           -- '<target_key>:D<n>:<obs_early>__<obs_late>'
  target_key                text not null references sky_archive.targets(target_key),
  detector                  smallint not null check (detector between 1 and 6),
  frame_early_id            text not null references sky_archive.dr1_frames(frame_id),
  frame_late_id             text not null references sky_archive.dr1_frames(frame_id),
  epoch_early_mjd           double precision not null,
  epoch_late_mjd            double precision not null,
  days_apart                double precision generated always as (epoch_late_mjd - epoch_early_mjd) stored,
  wavelength_early_um       double precision,
  wavelength_late_um        double precision,
  geometric_common_fraction double precision,
  common_coverage_fraction  double precision,
  common_valid_pixels       integer,
  grid_width                integer,
  grid_height               integer,
  pixel_scale_arcsec        double precision,
  norm                      jsonb not null default '{}'::jsonb, -- {vmin, vmax, stretch, diff_limit}
  background_matches        integer,
  is_primary                boolean not null default false,     -- pair served by /api/frames for this target+detector
  status                    text not null default 'preliminary_engineering_diagnostic',
  assets                    jsonb not null default '{}'::jsonb, -- storage object paths
  upload_status             text not null default 'not_attempted'
                            check (upload_status in ('not_attempted','uploaded','failed','not_configured')),
  warnings                  text[] not null default '{}',
  report                    jsonb not null default '{}'::jsonb,
  updated_at                timestamptz not null default now(),
  check (frame_early_id <> frame_late_id),
  check (epoch_late_mjd >= epoch_early_mjd)
);

create unique index if not exists dr1_pairs_one_primary_idx on sky_archive.dr1_pairs (target_key, detector) where is_primary;

alter table sky_archive.dr1_frames enable row level security;
alter table sky_archive.dr1_pairs enable row level security;

-- Public read-only bucket for rendered PNG/GIF and small aligned FITS (public NASA data).
-- Uploads require the service/secret key; no insert/update policies are created.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spherex-dr1-demo', 'spherex-dr1-demo', true, 10485760,
        array['image/png','image/gif','application/fits','application/octet-stream','application/json'])
on conflict (id) do nothing;
