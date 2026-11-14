-- Forum v1.1 persistence (shared/api-contract/forum-v1.md).
--
-- Security model
--   * All forum data lives in the private schema "forum". The schema is not
--     added to the Supabase Data API exposed schemas, and every table has RLS
--     enabled with no policy for anon/authenticated, so direct Data API access
--     is denied outright. FastAPI is the only writer; it connects with a
--     database role that owns or is granted these tables.
--   * Integrity rules are enforced in the database as well, so a buggy or
--     bypassing caller still cannot rewrite submitted revisions, audit rows,
--     protected columns or create a second active revision.
--
-- Apply with the Supabase CLI (supabase db push) or psql. Never reset a shared
-- database to apply it.

create schema if not exists forum;

revoke all on schema forum from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema forum from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema forum from authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles and roles. id equals the Supabase auth user id (JWT sub). The role
-- column is protected: operators grant admin with SQL, never through the API.
-- ---------------------------------------------------------------------------
create table forum.profiles (
  id uuid primary key,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Managed hashtag catalog. Slug and id are immutable; no deletion.
create table forum.hashtags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (char_length(slug) between 1 and 40 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  active boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table forum.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references forum.profiles (id),
  visibility text not null default 'unpublished'
    check (visibility in ('unpublished', 'published', 'hidden')),
  version integer not null default 1 check (version >= 1),
  published_revision_id uuid,
  working_revision_id uuid,
  published_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  visibility_action text check (visibility_action in ('hide', 'restore')),
  visibility_reason text check (char_length(visibility_reason) between 1 and 1000),
  visibility_actor_id uuid references forum.profiles (id),
  visibility_at timestamptz,
  -- A published or hidden post always has a current approved snapshot.
  check (visibility = 'unpublished' or (published_revision_id is not null and published_at is not null)),
  check (visibility <> 'unpublished' or published_revision_id is null),
  check (
    (visibility_action is null and visibility_reason is null and visibility_actor_id is null and visibility_at is null)
    or (visibility_action is not null and visibility_reason is not null
        and visibility_actor_id is not null and visibility_at is not null)
  )
);

create table forum.revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references forum.posts (id),
  number integer not null check (number >= 1),
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'withdrawn')),
  version integer not null default 1 check (version >= 1),
  title text not null default '' check (char_length(title) <= 150),
  body text not null default '' check (char_length(body) <= 20000),
  links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 10),
  sky_context jsonb check (sky_context is null or jsonb_typeof(sky_context) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references forum.profiles (id),
  rejection_reason_code text check (rejection_reason_code in
    ('off_topic', 'spam', 'abuse', 'personal_information', 'needs_context', 'other')),
  rejection_reason text check (char_length(rejection_reason) between 1 and 1000),
  withdrawn_at timestamptz,
  unique (post_id, number),
  -- Lets posts reference (post_id, id) so a pointer can never cross posts.
  unique (post_id, id),
  check (status <> 'rejected' or (rejection_reason is not null and rejection_reason_code is not null)),
  check (status not in ('approved', 'rejected') or (reviewed_at is not null and reviewed_by is not null)),
  check (status = 'draft' or submitted_at is not null),
  check (status <> 'withdrawn' or withdrawn_at is not null)
);

-- At most one active draft/pending revision per post.
create unique index revisions_one_active_per_post
  on forum.revisions (post_id) where status in ('draft', 'pending');
create index revisions_pending_queue
  on forum.revisions (submitted_at, id) where status = 'pending';

alter table forum.posts
  add constraint posts_published_revision_fk
    foreign key (id, published_revision_id) references forum.revisions (post_id, id)
    deferrable initially deferred,
  add constraint posts_working_revision_fk
    foreign key (id, working_revision_id) references forum.revisions (post_id, id)
    deferrable initially deferred;

create index posts_public_feed on forum.posts (published_at desc, id desc)
  where visibility = 'published' and deleted_at is null;
create index posts_author on forum.posts (author_id, updated_at desc, id desc)
  where deleted_at is null;

-- Ordered hashtag association of one revision snapshot.
create table forum.revision_tags (
  revision_id uuid not null references forum.revisions (id),
  hashtag_id uuid not null references forum.hashtags (id),
  position smallint not null check (position between 0 and 4),
  primary key (revision_id, hashtag_id),
  unique (revision_id, position)
);
create index revision_tags_hashtag on forum.revision_tags (hashtag_id);

create table forum.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references forum.posts (id),
  observed_revision_id uuid not null,
  author_id uuid not null references forum.profiles (id),
  body text not null check (char_length(body) between 1 and 3000),
  version integer not null default 1 check (version >= 1),
  hidden boolean not null default false,
  visibility_action text check (visibility_action in ('hide', 'restore')),
  visibility_reason text check (char_length(visibility_reason) between 1 and 1000),
  visibility_actor_id uuid references forum.profiles (id),
  visibility_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (post_id, observed_revision_id) references forum.revisions (post_id, id)
);
create index comments_by_post on forum.comments (post_id, created_at, id);

create table forum.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references forum.profiles (id),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reason_code text not null
    check (reason_code in ('off_topic', 'spam', 'abuse', 'personal_information', 'other')),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  version integer not null default 1 check (version >= 1),
  resolution_reason text check (char_length(resolution_reason) between 1 and 1000),
  resolved_by uuid references forum.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reason_code <> 'other' or char_length(btrim(description)) > 0),
  check (status = 'open' or (resolution_reason is not null and resolved_by is not null and resolved_at is not null))
);
-- One open report per reporter/target.
create unique index reports_one_open
  on forum.reports (reporter_id, target_type, target_id) where status = 'open';
create index reports_queue on forum.reports (status, created_at, id);

create table forum.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references forum.profiles (id),
  type text not null check (type in ('submission_received', 'revision_approved', 'revision_rejected',
    'post_hidden', 'post_restored', 'comment_hidden', 'comment_restored')),
  post_id uuid not null references forum.posts (id),
  revision_id uuid references forum.revisions (id),
  comment_id uuid references forum.comments (id),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_inbox on forum.notifications (recipient_id, created_at desc, id desc);

create table forum.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references forum.profiles (id),
  action text not null check (char_length(action) between 1 and 80),
  post_id uuid,
  revision_id uuid,
  comment_id uuid,
  report_id uuid,
  hashtag_id uuid,
  reason text check (char_length(reason) between 1 and 1000),
  from_state text check (char_length(from_state) between 1 and 80),
  to_state text check (char_length(to_state) between 1 and 80),
  created_at timestamptz not null default now()
);
create index audit_events_recent on forum.audit_events (created_at desc, id desc);

-- POST idempotency records, committed in the same transaction as the business
-- change they describe. Keep at least 24 hours (see forum.purge_idempotency).
create table forum.idempotency_keys (
  actor_id uuid not null,
  operation text not null,
  resource text not null,
  key uuid not null,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, operation, resource, key)
);
create index idempotency_keys_age on forum.idempotency_keys (created_at);

create function forum.purge_idempotency(retention interval default interval '48 hours')
returns integer language sql as $$
  with gone as (
    delete from forum.idempotency_keys where created_at < now() - greatest(retention, interval '24 hours')
    returning 1
  )
  select count(*)::integer from gone;
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Submitted revision payloads are immutable; status moves only forward.
create function forum.guard_revision() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'forum revisions cannot be deleted' using errcode = 'check_violation';
  end if;
  if new.id <> old.id or new.post_id <> old.post_id or new.number <> old.number
     or new.created_at <> old.created_at then
    raise exception 'revision identity is immutable' using errcode = 'check_violation';
  end if;
  if old.status <> 'draft' and (new.title <> old.title or new.body <> old.body
     or new.links <> old.links or new.sky_context is distinct from old.sky_context) then
    raise exception 'submitted revision content is immutable' using errcode = 'check_violation';
  end if;
  if new.status <> old.status and not (
       (old.status = 'draft' and new.status = 'pending')
    or (old.status = 'pending' and new.status in ('approved', 'rejected', 'withdrawn'))
  ) then
    raise exception 'invalid revision transition % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  if new.version <= old.version then
    raise exception 'revision version must increase' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger revisions_guard before update or delete on forum.revisions
  for each row execute function forum.guard_revision();

-- Tags of a submitted snapshot are frozen too.
create function forum.guard_revision_tags() returns trigger language plpgsql as $$
declare
  rev_status text;
begin
  select status into rev_status from forum.revisions
    where id = coalesce(new.revision_id, old.revision_id);
  if rev_status is distinct from 'draft' then
    raise exception 'tags of a submitted revision are immutable' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

create trigger revision_tags_guard before insert or update or delete on forum.revision_tags
  for each row execute function forum.guard_revision_tags();

-- The public pointer may only reference an approved revision; the working
-- pointer only a draft/pending one.
create function forum.guard_post_pointers() returns trigger language plpgsql as $$
declare
  cur forum.posts;
begin
  if tg_op = 'UPDATE' and (new.author_id <> old.author_id or new.created_at <> old.created_at) then
    raise exception 'post author is immutable' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'deleted posts cannot be restored' using errcode = 'check_violation';
  end if;
  -- Deferred to commit: check the row as it is now, not as it was at this event.
  select * into cur from forum.posts where id = new.id;
  if cur.published_revision_id is not null and not exists (
    select 1 from forum.revisions where id = cur.published_revision_id and status = 'approved'
  ) then
    raise exception 'published pointer must reference an approved revision'
      using errcode = 'check_violation';
  end if;
  if cur.working_revision_id is not null and not exists (
    select 1 from forum.revisions where id = cur.working_revision_id and status in ('draft', 'pending')
  ) then
    raise exception 'working pointer must reference a draft or pending revision'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create constraint trigger posts_pointer_guard after insert or update on forum.posts
  deferrable initially deferred
  for each row execute function forum.guard_post_pointers();

create function forum.guard_comment() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'forum comments cannot be hard-deleted' using errcode = 'check_violation';
  end if;
  if new.post_id <> old.post_id or new.author_id <> old.author_id
     or new.observed_revision_id <> old.observed_revision_id or new.created_at <> old.created_at then
    raise exception 'comment identity is immutable' using errcode = 'check_violation';
  end if;
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'deleted comments cannot be restored' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger comments_guard before update or delete on forum.comments
  for each row execute function forum.guard_comment();

create function forum.guard_hashtag() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'hashtags cannot be deleted' using errcode = 'check_violation';
  end if;
  if new.slug <> old.slug or new.id <> old.id then
    raise exception 'hashtag slug is immutable' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger hashtags_guard before update or delete on forum.hashtags
  for each row execute function forum.guard_hashtag();

create function forum.reject_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'check_violation';
end $$;

create trigger audit_events_append_only before update or delete on forum.audit_events
  for each row execute function forum.reject_mutation();

-- Notifications: only read_at may change, and only from null.
create function forum.guard_notification() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'notifications cannot be deleted' using errcode = 'check_violation';
  end if;
  if (new.recipient_id, new.type, new.post_id, new.created_at) is distinct from
       (old.recipient_id, old.type, old.post_id, old.created_at)
     or new.revision_id is distinct from old.revision_id
     or new.comment_id is distinct from old.comment_id
     or (old.read_at is not null and new.read_at is distinct from old.read_at) then
    raise exception 'notification content is immutable' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger notifications_guard before update or delete on forum.notifications
  for each row execute function forum.guard_notification();

-- ---------------------------------------------------------------------------
-- Deny direct Data API access. anon/authenticated get no grants and no
-- policies, so RLS denies every row even if a later grant is added by mistake.
-- The table owner (the migration role FastAPI connects with) is not subject
-- to RLS; a dedicated forum_api login role gets an explicit policy below.
-- ---------------------------------------------------------------------------
alter table forum.profiles enable row level security;
alter table forum.hashtags enable row level security;
alter table forum.posts enable row level security;
alter table forum.revisions enable row level security;
alter table forum.revision_tags enable row level security;
alter table forum.comments enable row level security;
alter table forum.reports enable row level security;
alter table forum.notifications enable row level security;
alter table forum.audit_events enable row level security;
alter table forum.idempotency_keys enable row level security;


-- The backend role. Create it once per environment (outside Git) with a
-- password, e.g.:  create role forum_api login password '...';
-- then: grant forum_api to postgres;  The block below grants table access
-- and a bypass policy only to that role.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_roles where rolname = 'forum_api') then
    create role forum_api nologin;
  end if;
  execute 'grant usage on schema forum to forum_api';
  foreach t in array array['profiles', 'hashtags', 'posts', 'revisions', 'revision_tags', 'comments',
                           'reports', 'notifications', 'audit_events', 'idempotency_keys'] loop
    execute format('grant select, insert, update on forum.%I to forum_api', t);
    execute format('create policy forum_api_all on forum.%I for all to forum_api using (true) with check (true)', t);
  end loop;
  execute 'grant delete on forum.idempotency_keys to forum_api';
  execute 'grant execute on all functions in schema forum to forum_api';
end $$;
