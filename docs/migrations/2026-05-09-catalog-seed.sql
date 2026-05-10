-- ============================================================
-- Phase 9 / 10: catalog seed.
--
-- Slugs match `lib/customization.ts` exactly. Prices are in cents.
-- `frame.none` is free / always-equippable; everyone gets it auto-
-- granted at signup via `bootstrap_user_inventory()` below.
-- ============================================================

insert into catalog_items (kind, slug, name, description, price_cents, sort_order, active) values
  -- Frames
  ('frame', 'frame.none',       'no frame',   'remove your frame.',                     0,    0, true),
  ('frame', 'frame.gold-conic', 'gold spin',  'animated gold ring around your avatar.',  500,  10, true),
  ('frame', 'frame.aurora',     'aurora',     'cyan -> purple -> pink shimmer.',         800,  20, true),
  ('frame', 'frame.ember',      'ember',      'red -> orange flicker for the impatient.', 700,  30, true),
  ('frame', 'frame.void',       'void',       'pure black ring with subtle white glow.', 600,  40, true),

  -- Badges
  ('badge', 'badge.founder',    'founder',    'one of the first 100 holymog accounts.', 0,    100, true),
  ('badge', 'badge.beta',       'beta',       'helped test holymog pre-launch.',        0,    110, true),
  ('badge', 'badge.s-tier',     's-tier club','scanned an S-tier or higher.',           0,    120, true),

  -- Themes
  ('theme', 'theme.default',    'default',    'standard sky-tinted accent.',            0,    200, true),
  ('theme', 'theme.noir',       'noir',       'pure white-on-black with no colour.',    400,  210, true),
  ('theme', 'theme.solar',      'solar',      'warm amber wash on your profile.',        500,  220, true),
  ('theme', 'theme.midnight',   'midnight',   'deep purple wash on your profile.',       500,  230, true)

on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  sort_order  = excluded.sort_order,
  active      = excluded.active;

-- Auto-grant `frame.none` to every existing profile so users always
-- have at least one item in their inventory (lets the equip/unequip
-- flow work without requiring a purchase first).
insert into user_inventory (user_id, item_slug, source)
select user_id, 'frame.none', 'reward'
  from profiles
on conflict (user_id, item_slug) do nothing;
