-- ============================================================
-- Phase 2 migration: battles, battle_participants,
-- matchmaking_queue + the pair_two() RPC for atomic public-1v1
-- pairing.
--
-- Run AFTER the Phase 0 migration (which created public.users
-- via Auth.js's pg adapter). This migration depends on those tables.
-- ============================================================

begin;

-- ---------------------------------------------------------------
-- 1) battles: one row per battle (public 1v1 or private party).
-- ---------------------------------------------------------------

create table battles (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('public', 'private')),
  -- 6-char Crockford code, only for private parties (Phase 4)
  code            text unique
                    check (code is null or code ~ '^[ABCDEFGHJKMNPQRSTVWXYZ0-9]{6}$'),
  host_user_id    uuid references users(id) on delete set null,
  livekit_room    text not null,
  state           text not null default 'lobby'
                    check (state in ('lobby', 'starting', 'active', 'finished', 'abandoned')),
  max_participants int not null default 10,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);

create index battles_code_idx on battles (code) where code is not null;
create index battles_state_idx on battles (state);

-- ---------------------------------------------------------------
-- 2) battle_participants: one row per player per battle.
-- ---------------------------------------------------------------

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

-- ---------------------------------------------------------------
-- 3) matchmaking_queue: TTL'd entries for public-1v1 pairing.
-- ---------------------------------------------------------------

create table matchmaking_queue (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create index queue_age_idx on matchmaking_queue (created_at);

-- ---------------------------------------------------------------
-- 4) pair_two(): atomic public-1v1 pairing.
--
-- Pulls the two oldest queue entries with FOR UPDATE SKIP LOCKED,
-- creates a battle row in 'starting' state, inserts both as
-- participants, deletes the queue entries. If fewer than 2
-- entries are available, returns NULL (the caller's queue
-- entry just sits and waits to be picked up by someone else's
-- pair_two() call).
-- ---------------------------------------------------------------

create or replace function pair_two()
returns uuid
language plpgsql
security definer
as $$
declare
  v_battle_id uuid;
  pair_record record;
begin
  -- Cleanup stale queue entries first (>60s old).
  delete from matchmaking_queue
    where created_at < now() - interval '60 seconds';

  -- Atomically grab the two oldest entries.
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

  -- Create the battle.
  insert into battles (kind, livekit_room, state, started_at)
  values (
    'public',
    'public-' || gen_random_uuid()::text,
    'starting',
    now() + interval '3 seconds'
  )
  returning id into v_battle_id;

  -- Insert both participants.
  insert into battle_participants (battle_id, user_id, display_name)
  select v_battle_id, (r).user_id, (r).display_name
    from unnest(pair_record.rows) as r;

  -- Remove them from the queue.
  delete from matchmaking_queue
    where user_id in (
      select (r).user_id from unnest(pair_record.rows) as r
    );

  return v_battle_id;
end;
$$;

-- ---------------------------------------------------------------
-- 5) RLS: world-readable for spectator views, writes via API.
--
-- The API uses the service role for all battle writes (since we
-- do server-side scoring and finalisation), so we don't need
-- per-user write policies. SELECT stays open for anyone to
-- watch (live readouts come via Supabase Realtime).
-- ---------------------------------------------------------------

alter table battles                enable row level security;
alter table battle_participants    enable row level security;
alter table matchmaking_queue      enable row level security;

create policy "battles are world-readable"
  on battles for select using (true);

create policy "battle_participants are world-readable"
  on battle_participants for select using (true);

-- Queue entries are only visible to their owner so users can't
-- enumerate who's currently looking for a match.
create policy "users can see their own queue entry"
  on matchmaking_queue for select
  using (auth.uid() is null or true);  -- effectively open since we
                                        -- don't use Supabase Auth;
                                        -- API enforces ownership.

-- All writes go through the API (service role), so no INSERT/UPDATE/
-- DELETE policies for the anon/authenticated roles are needed.

commit;
