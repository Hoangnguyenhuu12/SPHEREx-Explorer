-- Distinguish screened pairs (target pixel finite and unflagged) from display-only pairs
-- (same rules except the target pixel may be saturated/flagged; shown for visual context only).
alter table sky_archive.dr1_pairs
  add column if not exists pair_kind text not null default 'screened'
  check (pair_kind in ('screened', 'display_only'));
comment on column sky_archive.dr1_pairs.pair_kind is
  'screened: passed all preliminary screening rules. display_only: target pixel saturated/flagged and masked; visual context only, never a measurement.';
