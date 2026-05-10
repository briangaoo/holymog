-- ============================================================
-- Subscription state on profiles + catalog extensions + achievement
-- progress table. Run in Supabase Studio.
--
-- Idempotent — safe to re-run.
-- ============================================================

begin;

-- 1) Subscription columns on profiles.
alter table profiles
  add column if not exists subscription_status text,
  add column if not exists subscription_tier text,
  add column if not exists subscription_started_at timestamptz,
  add column if not exists subscription_current_period_end timestamptz,
  add column if not exists stripe_subscription_id text,
  add column if not exists monthly_cosmetic_claimed_at timestamptz;

-- 2) Catalog item extensions.
alter table catalog_items
  add column if not exists subscriber_only boolean not null default false,
  add column if not exists unlock_method text not null default 'purchase'
    check (unlock_method in ('purchase', 'achievement', 'subscriber', 'admin_grant'));

-- 3) user_inventory: track when monthly credit was redeemed.
alter table user_inventory
  add column if not exists subscription_credit_redeemed_at timestamptz;

-- 3b) Allow new sources for the inventory rows.
alter table user_inventory drop constraint if exists user_inventory_source_check;
alter table user_inventory
  add constraint user_inventory_source_check
  check (source in ('purchase', 'grant', 'reward', 'achievement', 'subscription_credit'));

-- 4) Achievement progress table.
create table if not exists achievement_progress (
  user_id uuid not null references users(id) on delete cascade,
  achievement_key text not null,
  progress integer not null default 0,
  achieved_at timestamptz,
  primary key (user_id, achievement_key)
);

create index if not exists achievement_progress_user_achieved_idx
  on achievement_progress (user_id, achieved_at) where achieved_at is not null;

commit;
