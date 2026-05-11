-- ============================================================
-- Cosmetic catalog seed — Launch 1.
-- Run AFTER 2026-05-11-subscription-and-achievements.sql.
--
-- 10 name fx, all achievement-gated, no monetization. Frames,
-- badges, and themes deferred to Launch 2 (real designer pass).
--
-- All image_url=NULL — every cosmetic is a coded React component
-- registered in lib/customization.ts. Achievement engine
-- (lib/achievements.ts) handles which item unlocks when.
--
-- Re-runnable: ON CONFLICT (slug) DO UPDATE refreshes copy.
-- A first wipe clears any stale rows from prior catalogs.
-- ============================================================

begin;

-- Wipe any inventory + catalog rows from prior catalogs (agent-generated
-- 60 + the tier-badge + tier-theme attempts). Safe — Launch 1 hasn't shipped.
delete from user_inventory;
delete from catalog_items;

insert into catalog_items
  (kind, slug, name, description, price_cents, sort_order, active, subscriber_only, unlock_method)
values
  -- ---- Name FX · 10 -----------------------------------------------------
  ('name_fx', 'name.signed',        'signed',        'unlocked by completing your first scan',                    0, 200, true, false, 'achievement'),
  ('name_fx', 'name.callout',       'callout',       'unlocked by completing 10 scans',                           0, 201, true, false, 'achievement'),
  ('name_fx', 'name.tier-prefix',   'tier prefix',   'unlocked by scanning B-tier or higher',                     0, 202, true, false, 'achievement'),
  ('name_fx', 'name.streak-flame',  'streak flame',  'unlocked by maintaining a 7-day streak',                    0, 203, true, false, 'achievement'),
  ('name_fx', 'name.holographic',   'holographic',   'unlocked by scanning S-tier or higher',                     0, 204, true, false, 'achievement'),
  ('name_fx', 'name.neon',          'neon',          'unlocked by winning 25 battles',                            0, 205, true, false, 'achievement'),
  ('name_fx', 'name.elo-king',      'elo king',      'unlocked by reaching 1500 ELO',                             0, 206, true, false, 'achievement'),
  ('name_fx', 'name.gilded',        'gilded',        'unlocked by reaching 1700 ELO',                             0, 207, true, false, 'achievement'),
  ('name_fx', 'name.divine',        'divine',        'unlocked by maintaining a 30-day streak',                   0, 208, true, false, 'achievement'),
  ('name_fx', 'name.true-adam',     'true adam',     'unlocked by scanning S+ · the peak',                        0, 209, true, false, 'achievement')

on conflict (slug) do update set
  kind            = excluded.kind,
  name            = excluded.name,
  description     = excluded.description,
  price_cents     = excluded.price_cents,
  sort_order      = excluded.sort_order,
  active          = excluded.active,
  subscriber_only = excluded.subscriber_only,
  unlock_method   = excluded.unlock_method;

commit;
