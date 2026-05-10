-- ============================================================
-- Scan limits.
--
-- Anonymous users  -> 1 lifetime scan per signed cookie + 3/24h per IP fence
-- Signed-in users  -> 10 scans per rolling 24h window
--
-- Counters live server-side; the client cannot tamper with them.
-- ============================================================

create table if not exists scan_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  anon_id     text,
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists scan_attempts_user_id_created_at_idx
  on scan_attempts (user_id, created_at desc) where user_id is not null;

create index if not exists scan_attempts_anon_id_idx
  on scan_attempts (anon_id) where anon_id is not null;

create index if not exists scan_attempts_ip_hash_anon_idx
  on scan_attempts (ip_hash, created_at desc) where user_id is null;
