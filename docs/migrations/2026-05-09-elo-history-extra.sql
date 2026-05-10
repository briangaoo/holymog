-- ============================================================
-- Extend elo_history with delta + battle_id so the stats tab can
-- surface "biggest win" and "biggest loss" without joining by
-- timestamp proximity. Existing rows leave delta = null and
-- get ignored by the new queries (they were inserted before
-- this migration).
-- ============================================================

alter table elo_history
  add column if not exists delta integer,
  add column if not exists battle_id uuid references battles(id) on delete set null;

create index if not exists elo_history_user_delta_idx
  on elo_history (user_id, delta) where delta is not null;
