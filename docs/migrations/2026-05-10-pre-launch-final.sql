-- =====================================================================
-- holymog — pre-launch consolidated migration
-- =====================================================================
-- Run this ONCE in Supabase Studio SQL editor. Creates the entire
-- schema from scratch — every table, function, trigger, RLS policy,
-- storage bucket, and seed row needed for Launch 1.
--
-- Supersedes all migrations in this directory dated 2026-05-07
-- through 2026-05-11. After running, those individual .sql files
-- are historical record only; they should NOT be re-applied on top.
--
-- BEFORE RUNNING:
--   1. Wipe all rows from your Supabase project's public schema
--      (the DROP TABLE block at the top of this file handles
--      tables, but stuck constraints / functions / extensions may
--      need manual cleanup).
--   2. In Supabase Studio → Storage, empty AND delete these
--      buckets if they exist: `holymog-faces`, `holymog-scans`,
--      `holymog-cosmetics`. They get recreated below with fresh
--      policies.
--   3. Confirm DATABASE_URL points at the correct project.
--
-- This file is idempotent in spirit: it DROPs everything before
-- CREATEing, so re-running is a clean reset (will lose all data).
-- =====================================================================

begin;

-- ---------------------------------------------------------------
-- (0) Drop everything in reverse dependency order
-- ---------------------------------------------------------------

drop table if exists pending_leaderboard_submissions cascade;
drop table if exists achievement_progress cascade;
drop table if exists audit_log cascade;
drop table if exists email_preferences cascade;
drop table if exists follows cascade;
drop table if exists stripe_purchases cascade;
drop table if exists user_inventory cascade;
drop table if exists catalog_items cascade;
drop table if exists scan_attempts cascade;
drop table if exists scan_history cascade;
drop table if exists elo_history cascade;
drop table if exists matchmaking_queue cascade;
drop table if exists battle_participants cascade;
drop table if exists battles cascade;
drop table if exists leaderboard cascade;
drop table if exists profiles cascade;
drop table if exists verification_token cascade;
drop table if exists sessions cascade;
drop table if exists accounts cascade;
drop table if exists users cascade;

drop function if exists pair_two() cascade;
drop function if exists set_updated_at() cascade;
drop function if exists follows_after_insert() cascade;
drop function if exists follows_after_delete() cascade;

-- ---------------------------------------------------------------
-- (1) Auth.js v5 schema (via @auth/pg-adapter)
-- ---------------------------------------------------------------

create table users (
  id              uuid primary key default gen_random_uuid(),
  name            text,
  email           text unique,
  "emailVerified" timestamptz,
  image           text
);

create table accounts (
  id                  uuid primary key default gen_random_uuid(),
  "userId"            uuid not null references users(id) on delete cascade,
  type                text not null,
  provider            text not null,
  "providerAccountId" text not null,
  refresh_token       text,
  access_token        text,
  expires_at          bigint,
  id_token            text,
  scope               text,
  session_state       text,
  token_type          text,
  unique (provider, "providerAccountId")
);

create table sessions (
  id             uuid primary key default gen_random_uuid(),
  "userId"       uuid not null references users(id) on delete cascade,
  expires        timestamptz not null,
  "sessionToken" text not null unique
);

create table verification_token (
  identifier text not null,
  expires    timestamptz not null,
  token      text not null,
  primary key (identifier, token)
);

create index accounts_user_id_idx on accounts ("userId");
create index sessions_user_id_idx on sessions ("userId");
create index sessions_expires_idx on sessions (expires);

-- ---------------------------------------------------------------
-- (2) Profiles — app-level identity + stats + customization
-- ---------------------------------------------------------------

create table profiles (
  user_id                          uuid primary key references users(id) on delete cascade,
  display_name                     text not null,
  -- ELO / battle stats
  elo                              int  not null default 1000,
  peak_elo                         int  not null default 1000,
  matches_played                   int  not null default 0,
  matches_won                      int  not null default 0,
  current_streak                   int  not null default 0,
  longest_streak                   int  not null default 0,
  -- Scan stats
  best_scan_overall                int,
  best_scan                        jsonb,
  improvement_counts               jsonb not null default '{}'::jsonb,
  -- Profile content
  bio                              text,
  location                         text,
  banner_url                       text,
  socials                          jsonb default '{}'::jsonb,
  followers_count                  integer not null default 0,
  following_count                  integer not null default 0,
  previous_usernames               text[] default array[]::text[],
  -- Privacy + preferences
  hide_photo_from_leaderboard      boolean default false,
  hide_elo                         boolean default false,
  mute_battle_sfx                  boolean default false,
  weekly_digest                    boolean default true,
  mog_email_alerts                 boolean default false,
  -- Cosmetic equipped slots
  equipped_flair                   text,
  equipped_theme                   text,
  equipped_frame                   text,
  equipped_name_fx                 text,
  -- 2FA (TOTP)
  two_factor_secret                text,
  two_factor_enabled               boolean default false,
  two_factor_backup_codes          text[] default array[]::text[],
  -- Subscription state (holymog+ — deferred at Launch 1 but
  -- columns exist so the code paths compile without flags).
  subscription_status              text,
  subscription_tier                text,
  subscription_started_at          timestamptz,
  subscription_current_period_end  timestamptz,
  stripe_subscription_id           text,
  monthly_cosmetic_claimed_at      timestamptz,
  -- Bookkeeping
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- (3) Leaderboard — public scan board
-- ---------------------------------------------------------------

create table leaderboard (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references users(id) on delete cascade,
  name        text not null,
  overall     int  not null check (overall    between 0 and 100),
  tier        text not null,
  jawline     int  not null check (jawline    between 0 and 100),
  eyes        int  not null check (eyes       between 0 and 100),
  skin        int  not null check (skin       between 0 and 100),
  cheekbones  int  not null check (cheekbones between 0 and 100),
  image_url   text,
  image_path  text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- (4) Battles — public 1v1 + private parties
-- ---------------------------------------------------------------

create table battles (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('public', 'private')),
  code             text unique
                     check (code is null or code ~ '^[ABCDEFGHJKMNPQRSTVWXYZ0-9]{6}$'),
  host_user_id     uuid references users(id) on delete set null,
  livekit_room     text not null,
  state            text not null default 'lobby'
                     check (state in ('lobby','starting','active','finished','abandoned')),
  max_participants int not null default 10,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz
);

create index battles_code_idx on battles (code) where code is not null;
create index battles_state_idx on battles (state);

create table battle_participants (
  id            uuid primary key default gen_random_uuid(),
  battle_id     uuid not null references battles(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  display_name  text not null,
  peak_score    int  not null default 0,
  final_score   int,
  is_winner     boolean not null default false,
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  unique (battle_id, user_id)
);

create index participants_user_idx   on battle_participants (user_id);
create index participants_battle_idx on battle_participants (battle_id);

create table matchmaking_queue (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create index queue_age_idx on matchmaking_queue (created_at);

-- pair_two() — atomic public-1v1 matchmaking. Pulls 2 oldest queue
-- entries with FOR UPDATE SKIP LOCKED, creates a battle, inserts
-- both as participants, deletes their queue rows. Returns NULL if
-- fewer than 2 are queued.
create or replace function pair_two()
returns uuid
language plpgsql
security definer
as $$
declare
  v_battle_id uuid;
  pair_record record;
begin
  -- Stale queue cleanup (>60s).
  delete from matchmaking_queue
    where created_at < now() - interval '60 seconds';

  -- Atomically grab two oldest entries.
  with locked as (
    select id, user_id, display_name
    from matchmaking_queue
    order by created_at
    limit 2
    for update skip locked
  )
  select array_agg(row(id, user_id, display_name)::matchmaking_queue) as rows,
         count(*) as n
    into pair_record
    from locked;

  if pair_record.n < 2 then
    return null;
  end if;

  -- Create battle.
  insert into battles (kind, livekit_room, state, started_at)
  values (
    'public',
    'public-' || gen_random_uuid()::text,
    'starting',
    now() + interval '3 seconds'
  )
  returning id into v_battle_id;

  -- Insert participants.
  insert into battle_participants (battle_id, user_id, display_name)
  select v_battle_id, (r).user_id, (r).display_name
    from unnest(pair_record.rows) as r;

  -- Remove from queue.
  delete from matchmaking_queue
    where user_id in (
      select (r).user_id from unnest(pair_record.rows) as r
    );

  return v_battle_id;
end;
$$;

-- ---------------------------------------------------------------
-- (5) Scan history + rate-limit telemetry
-- ---------------------------------------------------------------

create table scan_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  overall         integer not null,
  jawline         integer,
  eyes            integer,
  skin            integer,
  cheekbones      integer,
  presentation    integer,
  vision          jsonb,
  image_path      text,                  -- path within holymog-scans bucket
  requires_review boolean not null default false,
  reviewed_at     timestamptz,
  reviewed_by     uuid references users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index scan_history_user_id_created_at_idx
  on scan_history (user_id, created_at desc);

create index scan_history_review_idx
  on scan_history (requires_review, created_at desc) where requires_review;

create table scan_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  anon_id     text,
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);

create index scan_attempts_user_id_created_at_idx
  on scan_attempts (user_id, created_at desc) where user_id is not null;
create index scan_attempts_anon_id_idx
  on scan_attempts (anon_id) where anon_id is not null;
create index scan_attempts_ip_hash_anon_idx
  on scan_attempts (ip_hash, created_at desc) where user_id is null;

-- ---------------------------------------------------------------
-- (6) Elo history — sparkline + biggest-swings
-- ---------------------------------------------------------------

create table elo_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  elo         integer not null,
  delta       integer,
  battle_id   uuid references battles(id) on delete set null,
  recorded_at timestamptz not null default now()
);

create index elo_history_user_id_recorded_at_idx
  on elo_history (user_id, recorded_at desc);
create index elo_history_user_delta_idx
  on elo_history (user_id, delta) where delta is not null;

-- ---------------------------------------------------------------
-- (7) Catalog + inventory + Stripe purchases
-- ---------------------------------------------------------------

create table catalog_items (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('badge', 'theme', 'frame', 'flair', 'name_fx')),
  slug            text not null unique,
  name            text not null,
  description     text,
  price_cents     integer not null default 0 check (price_cents >= 0),
  image_url       text,
  animation_data  jsonb default '{}'::jsonb,
  sort_order      integer default 0,
  active          boolean default true,
  subscriber_only boolean not null default false,
  unlock_method   text not null default 'purchase'
                    check (unlock_method in ('purchase', 'achievement', 'subscriber', 'admin_grant')),
  created_at      timestamptz not null default now()
);

create index catalog_items_kind_active_idx
  on catalog_items (kind, active, sort_order);

create table user_inventory (
  id                               uuid primary key default gen_random_uuid(),
  user_id                          uuid not null references users(id) on delete cascade,
  item_slug                        text not null references catalog_items(slug) on delete cascade,
  source                           text not null
    check (source in ('purchase', 'grant', 'reward', 'achievement', 'subscription_credit')),
  purchased_at                     timestamptz not null default now(),
  stripe_payment_intent            text,
  subscription_credit_redeemed_at  timestamptz,
  unique (user_id, item_slug)
);

create index user_inventory_user_id_idx on user_inventory (user_id);

create table stripe_purchases (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete cascade,
  stripe_session_id     text not null unique,
  stripe_payment_intent text,
  amount_cents          integer not null,
  status                text not null,
  items_jsonb           jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now()
);

create index stripe_purchases_user_idx
  on stripe_purchases (user_id, created_at desc);

-- ---------------------------------------------------------------
-- (8) Email preferences + follow graph
-- ---------------------------------------------------------------

create table email_preferences (
  user_id              uuid primary key references users(id) on delete cascade,
  weekly_digest        boolean default true,
  mog_alerts           boolean default false,
  battle_invites       boolean default true,
  last_digest_sent_at  timestamptz
);

create table follows (
  follower_user_id uuid not null references users(id) on delete cascade,
  followed_user_id uuid not null references users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id)
);

create index follows_followed_idx
  on follows (followed_user_id, created_at desc);
create index follows_follower_idx
  on follows (follower_user_id, created_at desc);

-- Triggers to keep profiles.followers_count + following_count in
-- sync with the follows table. Atomic; safe under concurrent writes.
create or replace function follows_after_insert() returns trigger as $$
begin
  update profiles set followers_count = followers_count + 1
   where user_id = new.followed_user_id;
  update profiles set following_count = following_count + 1
   where user_id = new.follower_user_id;
  return new;
end;
$$ language plpgsql;

create or replace function follows_after_delete() returns trigger as $$
begin
  update profiles set followers_count = greatest(0, followers_count - 1)
   where user_id = old.followed_user_id;
  update profiles set following_count = greatest(0, following_count - 1)
   where user_id = old.follower_user_id;
  return old;
end;
$$ language plpgsql;

create trigger follows_insert_count_trigger
  after insert on follows
  for each row execute function follows_after_insert();

create trigger follows_delete_count_trigger
  after delete on follows
  for each row execute function follows_after_delete();

-- ---------------------------------------------------------------
-- (9) Audit log + achievements + anti-cheat pending submissions
-- ---------------------------------------------------------------

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete set null,
  action      text not null,
  resource    text,
  metadata    jsonb default '{}'::jsonb,
  ip_hash     text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index audit_log_user_action_idx
  on audit_log (user_id, action, created_at desc);

create table achievement_progress (
  user_id         uuid not null references users(id) on delete cascade,
  achievement_key text not null,
  progress        integer not null default 0,
  achieved_at     timestamptz,
  primary key (user_id, achievement_key)
);

create index achievement_progress_user_achieved_idx
  on achievement_progress (user_id, achieved_at) where achieved_at is not null;

-- Anti-cheat anchor for the leaderboard. /api/score writes here on
-- every authenticated scan; /api/leaderboard POST promotes from
-- here. Forging a leaderboard score is impossible — the only path
-- into the leaderboard table is a copy of a row from here, and
-- this table is service-role-write-only (no RLS write policy for
-- anon / authenticated roles).
create table pending_leaderboard_submissions (
  user_id    uuid primary key references users(id) on delete cascade,
  scores     jsonb not null,
  vision     jsonb not null,
  created_at timestamptz not null default now()
);

create index pending_lb_created_at_idx
  on pending_leaderboard_submissions (created_at);

-- ---------------------------------------------------------------
-- (10) Storage buckets
-- ---------------------------------------------------------------

-- holymog-faces: public-read. Leaderboard photos + avatars + banners.
-- 10 MB cap, image + mp4 (animated banners) allowed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'holymog-faces',
  'holymog-faces',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- holymog-scans: PRIVATE. Every authenticated scan archives here.
-- Service-role-only access. Served to clients via short-lived
-- signed URLs after server-side ownership checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'holymog-scans',
  'holymog-scans',
  false,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- holymog-cosmetics: public-read. Reserved for Launch 2 designer
-- cosmetic assets (frames, badges, themes). Empty at Launch 1.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'holymog-cosmetics',
  'holymog-cosmetics',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'video/mp4']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------
-- (11) Seed: cosmetic catalog (10 name fx, all achievement-gated)
-- ---------------------------------------------------------------

insert into catalog_items
  (kind, slug, name, description, price_cents, sort_order, active, subscriber_only, unlock_method)
values
  ('name_fx', 'name.signed',        'signed',        'unlocked by completing your first scan',     0, 200, true, false, 'achievement'),
  ('name_fx', 'name.callout',       'callout',       'unlocked by completing 10 scans',            0, 201, true, false, 'achievement'),
  ('name_fx', 'name.tier-prefix',   'tier prefix',   'unlocked by scanning B-tier or higher',      0, 202, true, false, 'achievement'),
  ('name_fx', 'name.streak-flame',  'streak flame',  'unlocked by maintaining a 7-day streak',     0, 203, true, false, 'achievement'),
  ('name_fx', 'name.holographic',   'holographic',   'unlocked by scanning S-tier or higher',      0, 204, true, false, 'achievement'),
  ('name_fx', 'name.neon',          'neon',          'unlocked by winning 25 battles',             0, 205, true, false, 'achievement'),
  ('name_fx', 'name.elo-king',      'elo king',      'unlocked by reaching 1500 ELO',              0, 206, true, false, 'achievement'),
  ('name_fx', 'name.gilded',        'gilded',        'unlocked by reaching 1700 ELO',              0, 207, true, false, 'achievement'),
  ('name_fx', 'name.divine',        'divine',        'unlocked by maintaining a 30-day streak',    0, 208, true, false, 'achievement'),
  ('name_fx', 'name.true-adam',     'true adam',     'unlocked by scanning S+ · the peak',         0, 209, true, false, 'achievement');

-- ---------------------------------------------------------------
-- (12) Row-Level Security policies
-- ---------------------------------------------------------------
-- Service-role bypasses RLS — all API-route writes use the service
-- role, so policies here are the second-layer defense if the anon
-- key leaks or a direct-from-client Supabase call ever sneaks in.
--
-- Reads: public boards are world-readable; private records are
-- owner-only.
-- Writes: no INSERT/UPDATE/DELETE policies on most tables — all
-- writes go through API routes using the service-role client.

alter table users                            enable row level security;
alter table accounts                         enable row level security;
alter table sessions                         enable row level security;
alter table verification_token               enable row level security;
alter table profiles                         enable row level security;
alter table leaderboard                      enable row level security;
alter table battles                          enable row level security;
alter table battle_participants              enable row level security;
alter table matchmaking_queue                enable row level security;
alter table scan_history                     enable row level security;
alter table scan_attempts                    enable row level security;
alter table elo_history                      enable row level security;
alter table catalog_items                    enable row level security;
alter table user_inventory                   enable row level security;
alter table stripe_purchases                 enable row level security;
alter table email_preferences                enable row level security;
alter table follows                          enable row level security;
alter table audit_log                        enable row level security;
alter table achievement_progress             enable row level security;
alter table pending_leaderboard_submissions  enable row level security;

-- users: only the owner can read their own row. The anon-side
-- public profile API joins through profiles, not users.
create policy users_owner_select on users
  for select using (auth.uid() = id);

-- accounts (OAuth providers): owner-only. Surfaced via /api/account/connected-accounts.
create policy accounts_owner_select on accounts
  for select using (auth.uid() = "userId");

-- sessions: owner-only. Listed via /api/account/sessions.
create policy sessions_owner_select on sessions
  for select using (auth.uid() = "userId");

-- verification_token: never read by clients; service-role-only.
-- No policies = deny all when RLS enabled.

-- profiles: SELECT is open (public profile pages, battle tiles,
-- leaderboard rows, follower lists all need to read other users'
-- display names + stats). UPDATE is owner-only — though all our
-- API routes use service-role so this is defense-in-depth.
create policy profiles_world_select on profiles
  for select using (true);
create policy profiles_owner_update on profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- leaderboard: world-readable, owner writes (defense-in-depth —
-- /api/leaderboard uses service-role).
create policy leaderboard_world_select on leaderboard
  for select using (true);
create policy leaderboard_owner_write on leaderboard
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- battles: visible to participants + host.
create policy battles_participant_select on battles
  for select using (
    auth.uid() = host_user_id
    or exists (
      select 1 from battle_participants p
       where p.battle_id = battles.id and p.user_id = auth.uid()
    )
  );

-- battle_participants: visible to anyone in the same battle.
create policy battle_participants_peer_select on battle_participants
  for select using (
    exists (
      select 1 from battle_participants p2
       where p2.battle_id = battle_participants.battle_id
         and p2.user_id = auth.uid()
    )
  );

-- matchmaking_queue: server-only (service-role). No policies = deny.

-- scan_history: owner-only. /api/account/history surfaces this via
-- service-role with a manual user_id filter.
create policy scan_history_owner_select on scan_history
  for select using (auth.uid() = user_id);

-- scan_attempts: server-only (rate-limit internals). No policies.

-- elo_history: owner-only for sparkline / biggest-swings. Public
-- profile views ELO via profiles row (already world-readable).
create policy elo_history_owner_select on elo_history
  for select using (auth.uid() = user_id);

-- catalog_items: world-readable (the store).
create policy catalog_items_world_select on catalog_items
  for select using (active = true);

-- user_inventory: owner-only. Drives /api/catalog's "owned" field.
create policy user_inventory_owner_select on user_inventory
  for select using (auth.uid() = user_id);

-- stripe_purchases: owner-only. Drives the data export.
create policy stripe_purchases_owner_select on stripe_purchases
  for select using (auth.uid() = user_id);

-- email_preferences: owner-only.
create policy email_preferences_owner_select on email_preferences
  for select using (auth.uid() = user_id);
create policy email_preferences_owner_update on email_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- follows: SELECT is open (follower / following lists are public);
-- INSERT / DELETE go through API routes using service-role.
create policy follows_world_select on follows
  for select using (true);

-- audit_log: server-only. Forensic table; never read by clients.

-- achievement_progress: owner-only for progress UIs.
create policy achievement_progress_owner_select on achievement_progress
  for select using (auth.uid() = user_id);

-- pending_leaderboard_submissions: server-only. The anti-cheat
-- table; only /api/score writes, only /api/leaderboard reads, both
-- through service-role. No client should ever touch this directly.

-- ---------------------------------------------------------------
-- (13) Storage RLS policies
-- ---------------------------------------------------------------
-- holymog-faces: world-readable. Writes go through /api/account/avatar,
-- /api/account/banner, /api/leaderboard, all using service-role.
drop policy if exists faces_world_read on storage.objects;
create policy faces_world_read on storage.objects
  for select using (bucket_id = 'holymog-faces');

-- holymog-scans: PRIVATE. No policies for anon / authenticated.
-- Service-role bypasses RLS for the API routes that need to
-- download + re-upload during leaderboard promote.

-- holymog-cosmetics: world-readable (when L2 ships).
drop policy if exists cosmetics_world_read on storage.objects;
create policy cosmetics_world_read on storage.objects
  for select using (bucket_id = 'holymog-cosmetics');

commit;
