-- ============================================================
-- Phase 0 migration: Auth.js (NextAuth v5) tables + account-tagged
-- leaderboard. Run in the Supabase SQL editor as a single transaction.
--
-- BREAKING:
--   1. Truncates the leaderboard table (existing key-tagged rows wiped).
--   2. Drops the previous Phase-0 RLS policies that depended on Supabase
--      auth.uid() — all access control moves to the API layer using
--      Auth.js sessions.
--   3. Drops any previous `profiles` table that referenced auth.users.
--
-- Manual steps in Supabase Studio BEFORE running this:
--   - Empty the `holymog-faces` storage bucket (storage isn't reachable
--     from SQL).
-- ============================================================

begin;

-- ---------------------------------------------------------------
-- 1) Drop the previous Phase-0 attempt's tables and constraints,
--    if present, so this migration is idempotent enough to re-run.
-- ---------------------------------------------------------------

drop table if exists profiles cascade;

-- Drop legacy RLS policies FIRST. They reference user_id, so the column
-- drop below would fail with "cannot drop column ... because other
-- objects depend on it" if we tried to drop the column before the
-- policies that depend on it.
alter table leaderboard enable row level security;
drop policy if exists "leaderboard rows are world-readable" on leaderboard;
drop policy if exists "users can insert their own leaderboard row" on leaderboard;
drop policy if exists "users can update their own leaderboard row" on leaderboard;
drop policy if exists "users can delete their own leaderboard row" on leaderboard;
drop policy if exists "anyone can update leaderboard" on leaderboard;
drop policy if exists "anyone can delete leaderboard" on leaderboard;

-- We're moving all auth checks to the API layer; disable RLS on leaderboard.
alter table leaderboard disable row level security;

-- Wipe leaderboard data and detach it from any prior schema decisions.
truncate table leaderboard;

alter table leaderboard drop constraint if exists leaderboard_one_row_per_user;
alter table leaderboard drop column if exists account_key;
alter table leaderboard drop column if exists user_id;

-- ---------------------------------------------------------------
-- 2) Auth.js (@auth/pg-adapter) standard schema.
--    Mirrors the official template at:
--    https://authjs.dev/getting-started/adapters/pg
-- ---------------------------------------------------------------

create table users (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  email         text unique,
  "emailVerified" timestamptz,
  image         text
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
  id            uuid primary key default gen_random_uuid(),
  "userId"      uuid not null references users(id) on delete cascade,
  expires       timestamptz not null,
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
-- 3) profiles: one per Auth.js user, stores app-level identity +
--    stats. Foreign-keyed to public.users(id).
-- ---------------------------------------------------------------

create table profiles (
  user_id            uuid primary key references users(id) on delete cascade,
  display_name       text not null,
  elo                int  not null default 1000,
  peak_elo           int  not null default 1000,
  matches_played     int  not null default 0,
  matches_won        int  not null default 0,
  current_streak     int  not null default 0,
  longest_streak     int  not null default 0,
  best_scan_overall  int,
  best_scan          jsonb,
  improvement_counts jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
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
-- 4) leaderboard: account-tagged via user_id. One row per user.
-- ---------------------------------------------------------------

alter table leaderboard
  add column user_id uuid not null references users(id) on delete cascade;

alter table leaderboard
  add constraint leaderboard_one_row_per_user unique (user_id);

commit;
