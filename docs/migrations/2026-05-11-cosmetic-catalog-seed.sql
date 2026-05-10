-- ============================================================
-- Cosmetic catalog seed (60 items).
-- Run AFTER 2026-05-11-subscription-and-achievements.sql.
--
-- 16 frames + 15 badges + 14 name fx + 15 themes = 60.
-- Per-category flat pricing:
--   Frames    $6 paid · 0 achievement · 0 subscriber
--   Badges    $4 paid · 0 achievement · 0 subscriber
--   Name FX   $8 paid · 0 achievement · 0 subscriber
--   Themes   $10 paid · 0 achievement · 0 subscriber
--
-- Achievement items are price_cents=0 + unlock_method='achievement'.
-- holymog+ exclusives are price_cents=0 + subscriber_only=true +
-- unlock_method='subscriber'.
--
-- All image_url=NULL — every cosmetic is a coded React component
-- registered in lib/customization.ts. The renderer mounts the
-- component for the equipped slug; no asset lookup.
--
-- Idempotent: ON CONFLICT (slug) DO UPDATE so re-running refreshes
-- copy without dropping inventory rows.
-- ============================================================

begin;

insert into catalog_items
  (kind, slug, name, description, price_cents, sort_order, active, subscriber_only, unlock_method)
values
  -- ---- Frames · 16 ------------------------------------------------------------
  -- Paid · 8 × $6
  ('frame', 'frame.lava-lamp',     'lava lamp',     'molten blobs rising and merging in slow viscosity, sunset colors',                                            600, 100, true, false, 'purchase'),
  ('frame', 'frame.oil-slick',     'oil slick',     'iridescent thin-film rainbow drifting across a wet-asphalt black ring',                                       600, 101, true, false, 'purchase'),
  ('frame', 'frame.crt-scanline',  'crt scanline',  'green phosphor scanlines rolling around the ring with subtle screen curvature',                               600, 102, true, false, 'purchase'),
  ('frame', 'frame.mobius',        'möbius',        'a single möbius strip slowly rotating, monochrome',                                                            600, 103, true, false, 'purchase'),
  ('frame', 'frame.cable',         'cable',         'three colored wires braiding around the ring, server-rack feel',                                               600, 104, true, false, 'purchase'),
  ('frame', 'frame.ferrofluid',    'ferrofluid',    'black magnetic liquid spiking outward in living porcupine bristles',                                           600, 105, true, false, 'purchase'),
  ('frame', 'frame.torii',         'torii',         'four torii gate silhouettes at cardinal points with a slow gold pulse',                                        600, 106, true, false, 'purchase'),
  ('frame', 'frame.weather-front', 'weather front', 'swirling pressure-system isobars with a lightning fork sparking once per loop',                                600, 107, true, false, 'purchase'),
  -- Achievement · 5
  ('frame', 'frame.scan-ring',     'scan ring',     'mediapipe face-landmark dots and connecting lines forming the ring',                                             0, 110, true, false, 'achievement'),
  ('frame', 'frame.elo-medal',     'elo medal',     'concentric tier-color bands stacked like a target medallion',                                                    0, 111, true, false, 'achievement'),
  ('frame', 'frame.streak-pyre',   'streak pyre',   'flame ring whose intensity scales with your current streak length',                                              0, 112, true, false, 'achievement'),
  ('frame', 'frame.canthal',       'canthal',       'ring of upward-tilted eye shapes pointing toward the avatar',                                                    0, 113, true, false, 'achievement'),
  ('frame', 'frame.crown-letters', 'crown letters', 'tier-letter glyphs arranged as a crown on the upper arc',                                                        0, 114, true, false, 'achievement'),
  -- holymog+ · 3
  ('frame', 'frame.scoreband',     'scoreband',     'ring rendered as your peak overall-score digits repeating; static gold ring at small sizes',                     0, 120, true, true,  'subscriber'),
  ('frame', 'frame.heartbreaker',  'heartbreaker',  'ring of broken hearts mending and re-breaking on a slow heartbeat pulse',                                        0, 121, true, true,  'subscriber'),
  ('frame', 'frame.stained-glass', 'stained glass', 'cathedral stained-glass panels arranged radially in deep jewel tones, light shifting through them in slow drift', 0, 122, true, true,  'subscriber'),

  -- ---- Badges · 15 ------------------------------------------------------------
  -- Paid · 8 × $4
  ('badge', 'badge.ripple',        'ripple',       'concentric water ripples expanding and fading on a slow loop',                                                  400, 200, true, false, 'purchase'),
  ('badge', 'badge.eclipse',       'eclipse',      'total solar eclipse with corona flares licking outward',                                                        400, 201, true, false, 'purchase'),
  ('badge', 'badge.match',         'match',        'a single match igniting, burning down, regenerating',                                                            400, 202, true, false, 'purchase'),
  ('badge', 'badge.tarot-back',    'tarot back',   'bold geometric tarot motif: sun and crescent moon stacked, gold on black',                                      400, 203, true, false, 'purchase'),
  ('badge', 'badge.compass',       'compass',      'minimalist cardinal-direction rose with the needle drifting like a real compass',                                400, 204, true, false, 'purchase'),
  ('badge', 'badge.honeycomb',     'honeycomb',    'a single hex cell with a slow gold liquid level rising and falling inside',                                      400, 205, true, false, 'purchase'),
  ('badge', 'badge.fractal',       'fractal',      'algorithmic snowflake redrawing one branch at a time',                                                            400, 206, true, false, 'purchase'),
  ('badge', 'badge.morse',         'morse',        'three pulsing dots cycling a slow rhythmic morse pattern',                                                        400, 207, true, false, 'purchase'),
  -- Achievement · 5
  ('badge', 'badge.scan-1',        'first scan',   'scanner reticle with the corner brackets locking onto a center dot',                                               0, 210, true, false, 'achievement'),
  ('badge', 'badge.identity',      'identity',     'face-profile silhouette filled in with a single horizontal scan-line passing',                                     0, 211, true, false, 'achievement'),
  ('badge', 'badge.duelist',       'duelist',      'two profile silhouettes facing each other in 1v1 stance',                                                          0, 212, true, false, 'achievement'),
  ('badge', 'badge.king',          'king',         'chess king piece with a faint pulsing aura',                                                                       0, 213, true, false, 'achievement'),
  ('badge', 'badge.tier-stamp',    'tier stamp',   'your current tier letter stamped into the badge with crisp brand colors',                                          0, 214, true, false, 'achievement'),
  -- holymog+ · 2
  ('badge', 'badge.holy-wordmark', 'holy wordmark','the holymog wordmark inside a thin halo, slow gold rotation',                                                      0, 220, true, true,  'subscriber'),
  ('badge', 'badge.gavel',         'gavel',        'a gavel mid-strike with a radial shockwave pulsing outward on impact',                                             0, 221, true, true,  'subscriber'),

  -- ---- Name FX · 14 -----------------------------------------------------------
  -- Paid · 7 × $8
  ('name_fx', 'name.embossed-gold',    'embossed gold',     'letters appearing 3D-stamped in gold leaf with inner shadow',                                              800, 300, true, false, 'purchase'),
  ('name_fx', 'name.carved-obsidian',  'carved obsidian',   'letters chiseled into volcanic glass with a prismatic edge highlight',                                     800, 301, true, false, 'purchase'),
  ('name_fx', 'name.smoke-trail',      'smoke trail',       'wispy smoke drifting upward off each letter in real time',                                                 800, 302, true, false, 'purchase'),
  ('name_fx', 'name.frosted-glass',    'frosted glass',     'letters as etched frosted glass with subtle prismatic edge refraction',                                    800, 303, true, false, 'purchase'),
  ('name_fx', 'name.ink-bleed',        'ink bleed',         'sumi brush calligraphy with ink wicking outward into paper fibers',                                        800, 304, true, false, 'purchase'),
  ('name_fx', 'name.pixelsort',        'pixelsort',         'refined horizontal pixel-sort distortion sliding through the letters',                                     800, 305, true, false, 'purchase'),
  ('name_fx', 'name.aurora',           'aurora',            'aurora gradient cycling through the letterforms, slow drift',                                              800, 306, true, false, 'purchase'),
  -- Achievement · 5
  ('name_fx', 'name.signed',           'signed',            'clean handwritten signature underline that draws itself once on render',                                     0, 310, true, false, 'achievement'),
  ('name_fx', 'name.tier-prefix',      'tier prefix',       'your live scan tier letter precedes your name everywhere',                                                   0, 311, true, false, 'achievement'),
  ('name_fx', 'name.callout',          'callout',           'your weakest sub-score in brackets next to your name',                                                       0, 312, true, false, 'achievement'),
  ('name_fx', 'name.streak-flame',     'streak flame',      'your current streak digit appears in flame next to your name',                                              0, 313, true, false, 'achievement'),
  ('name_fx', 'name.elo-king',         'elo king',          'your current ELO appears as small superscript next to your name',                                           0, 314, true, false, 'achievement'),
  -- holymog+ · 2
  ('name_fx', 'name.divine-judgment',  'divine judgment',   'letters burning with golden judgment flame, halo above each character',                                     0, 320, true, true,  'subscriber'),
  ('name_fx', 'name.score-overlay',    'score overlay',     'your peak overall-score floats above the name in tiny gold digits',                                          0, 321, true, true,  'subscriber'),

  -- ---- Themes · 15 ------------------------------------------------------------
  -- Paid · 7 × $10
  ('theme', 'theme.rain',         'rain',         'procedural rain streaks falling across a near-black field with cool-toned bokeh',                              1000, 400, true, false, 'purchase'),
  ('theme', 'theme.dust',         'dust',         'slow drifting particles in a warm gradient, faint volumetric light beam',                                      1000, 401, true, false, 'purchase'),
  ('theme', 'theme.spotlight',    'spotlight',    'shifting radial spotlights sweeping across a near-black backdrop',                                             1000, 402, true, false, 'purchase'),
  ('theme', 'theme.corridor',     'corridor',     'infinite perspective grid receding into a vanishing point, single accent color',                               1000, 403, true, false, 'purchase'),
  ('theme', 'theme.aurora',       'aurora',       'full-bleed aurora cycling through tier colors, slow horizontal drift',                                         1000, 404, true, false, 'purchase'),
  ('theme', 'theme.tidewave',     'tidewave',     'single oscillating sine-wave horizon with glow-point foam, near-black field',                                  1000, 405, true, false, 'purchase'),
  ('theme', 'theme.granite',      'granite',      'dark granite-grain noise with a slow caustic light pattern washing across',                                    1000, 406, true, false, 'purchase'),
  -- Achievement · 5
  ('theme', 'theme.match-found',  'match found',  'two profile silhouettes anchored on opposite edges with a slow connecting pulse — matchmaking visualization',     0, 410, true, false, 'achievement'),
  ('theme', 'theme.tier-grid',    'tier grid',    'tier-letter pattern tiling and slowly cycling tier colors',                                                        0, 411, true, false, 'achievement'),
  ('theme', 'theme.win-stack',    'win stack',    'your win count stacking visibly as a column of tier-color bars on one edge',                                      0, 412, true, false, 'achievement'),
  ('theme', 'theme.embers',       'embers',       'particle field of glowing embers rising upward, pyre vibe',                                                       0, 413, true, false, 'achievement'),
  ('theme', 'theme.god-beam',     'god beam',     'volumetric divine light beam descending from above onto a near-black field',                                      0, 414, true, false, 'achievement'),
  -- holymog+ · 3
  ('theme', 'theme.divine-rays',  'divine rays',  'golden god-rays radiating from a centered halo across the full field',                                            0, 420, true, true,  'subscriber'),
  ('theme', 'theme.throne',       'throne',       'centered crown silhouette with a slow-rotating gold particle ring around it',                                     0, 421, true, true,  'subscriber'),
  ('theme', 'theme.shockwave',    'shockwave',    'gold and obsidian radial shockwave pulsing outward on a slow heartbeat',                                          0, 422, true, true,  'subscriber')

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
