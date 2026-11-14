-- Same-wavelength DR1 frame sequences (2-6 epochs) per target/detector for the blink demo.
-- Additive: dr1_pairs (2-frame pairs) is unchanged and remains usable.
create table if not exists sky_archive.dr1_sequences (
  sequence_id              text primary key,            -- '<target_key>:D<n>:<first_obs>__<last_obs>:n<k>'
  target_key               text not null references sky_archive.targets(target_key),
  detector                 smallint not null check (detector between 1 and 6),
  kind                     text not null check (kind in ('screened', 'display_only')),
  is_primary               boolean not null default false,
  frame_ids                text[] not null,              -- sky_archive.dr1_frames.frame_id, chronological
  frame_count              smallint not null check (frame_count >= 2),
  epoch_mjds               double precision[] not null,
  wavelengths_um           double precision[] not null,
  span_days                double precision not null,
  common_coverage_fraction double precision,
  common_valid_pixels      integer,
  grid_width               integer,
  grid_height              integer,
  pixel_scale_arcsec       double precision,
  norm                     jsonb not null default '{}'::jsonb,
  assets                   jsonb not null default '{}'::jsonb, -- {frames:[...], diffs:[...], blink_gif, filmstrip_png, aligned_fits}
  upload_status            text not null default 'not_attempted'
                           check (upload_status in ('not_attempted','uploaded','failed','not_configured')),
  status                   text not null,
  warnings                 text[] not null default '{}',
  report                   jsonb not null default '{}'::jsonb,
  updated_at               timestamptz not null default now(),
  check (cardinality(frame_ids) = frame_count and cardinality(epoch_mjds) = frame_count)
);
create unique index if not exists dr1_sequences_one_primary_idx on sky_archive.dr1_sequences (target_key, detector) where is_primary;
alter table sky_archive.dr1_sequences enable row level security;
comment on table sky_archive.dr1_sequences is
  'Same-wavelength DR1 sequences for blink. kind=display_only: target pixels saturated/flagged and masked; never a measurement.';
