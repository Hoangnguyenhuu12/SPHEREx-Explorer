-- Downloads that time out are skipped immediately and kept for a later retry, like HTTP 503.
alter table sky_archive.dr1_frames drop constraint if exists dr1_frames_download_status_check;
alter table sky_archive.dr1_frames add constraint dr1_frames_download_status_check
  check (download_status in ('pending','downloaded','deferred_503','deferred_timeout','failed','not_covered'));
