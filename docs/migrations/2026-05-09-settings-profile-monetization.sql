-- ============================================================
-- Phase 1: Database foundation for the settings + profiles +
-- monetization overhaul.
--
-- Touches profiles (new columns), creates 6 new tables, and adds
-- the indexes the API layer will need. Idempotent — safe to re-run.
-- ============================================================

-- ---- profiles: new columns ------------------------------------------------

alter table profiles
  add column if not exists bio text,
  add column if not exists socials jsonb default '{}'::jsonb,
  add column if not exists hide_photo_from_leaderboard boolean default false,
  add column if not exists hide_elo boolean default false,
  add column if not exists mute_battle_sfx boolean default false,
  add column if not exists weekly_digest boolean default true,
  add column if not exists mog_email_alerts boolean default false,
  add column if not exists equipped_flair text,
  add column if not exists equipped_theme text,
  add column if not exists equipped_frame text,
  add column if not exists two_factor_secret text,
  add column if not exists two_factor_enabled boolean default false,
  add column if not exists two_factor_backup_codes text[] default array[]::text[],
  add column if not exists previous_usernames text[] default array[]::text[];

-- ---- catalog_items --------------------------------------------------------

create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('badge', 'theme', 'frame', 'flair')),
  slug text not null unique,
  name text not null,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  image_url text,
  animation_data jsonb default '{}'::jsonb,
  sort_order integer default 0,
  active boolean default true,
  created_at timestamptz not null default now()
);

create index if not exists catalog_items_kind_active_idx
  on catalog_items (kind, active, sort_order);

-- ---- user_inventory -------------------------------------------------------

create table if not exists user_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  item_slug text not null references catalog_items(slug) on delete cascade,
  source text not null check (source in ('purchase', 'grant', 'reward')),
  purchased_at timestamptz not null default now(),
  stripe_payment_intent text,
  unique (user_id, item_slug)
);

create index if not exists user_inventory_user_id_idx
  on user_inventory (user_id);

-- ---- stripe_purchases -----------------------------------------------------

create table if not exists stripe_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  amount_cents integer not null,
  status text not null,
  items_jsonb jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists stripe_purchases_user_idx
  on stripe_purchases (user_id, created_at desc);

-- ---- elo_history ----------------------------------------------------------

create table if not exists elo_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  elo integer not null,
  recorded_at timestamptz not null default now()
);

create index if not exists elo_history_user_id_recorded_at_idx
  on elo_history (user_id, recorded_at desc);

-- ---- scan_history ---------------------------------------------------------

create table if not exists scan_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  overall integer not null,
  jawline integer,
  eyes integer,
  skin integer,
  cheekbones integer,
  presentation integer,
  vision jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scan_history_user_id_created_at_idx
  on scan_history (user_id, created_at desc);

-- ---- email_preferences ----------------------------------------------------

create table if not exists email_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  weekly_digest boolean default true,
  mog_alerts boolean default false,
  battle_invites boolean default true,
  last_digest_sent_at timestamptz
);

-- ---- audit_log ------------------------------------------------------------

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  action text not null,
  resource text,
  metadata jsonb default '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_user_action_idx
  on audit_log (user_id, action, created_at desc);

-- ============================================================
-- Done. RLS stays disabled per project convention; the API
-- layer enforces all access. Phase 1 of the security plan
-- (RLS migration) will revisit this.
-- ============================================================
