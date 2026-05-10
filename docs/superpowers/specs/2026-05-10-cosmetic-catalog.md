# Cosmetic Catalog — 60 items

---

## Context

### What holymog is

holymog is an AI-powered face-rating web app at **holymog.vercel.app**. Users look at their camera, the app sends the captured frame to Google Gemini 2.5 Flash Lite for analysis, and they get a tier letter from **F-** (worst) to **S+** (best) plus a 0–100 overall score and sub-scores across jawline, eyes, skin, and cheekbones.

Beyond solo scanning, holymog has **"mog battles"** — real-time 1v1 video face-offs powered by LiveKit, where two players go head-to-head over 10 seconds and the highest peak score wins. There are also private parties up to 10 people with invite codes. Public 1v1 battles are ELO-ranked.

The vocabulary draws from looksmaxxing / mogging culture: "mog" as a verb means to dominate someone visually. S+ tier is descriptively called "true adam" or "heartbreaker." The product audience is teen / young adult, gen Z. The brand name itself — "holy mog" — combines religious iconography with mogging slang, which is leveraged in the cosmetic catalog's holymog+ exclusive tier (divine/judgment vibes).

### What this catalog is

This document lists the 60 cosmetics that will populate the in-app store at `/account/store`. Users browse, buy, equip, and display these cosmetics across their profile, battle tiles, leaderboard rows, and follower lists. Cosmetics are pure visual decoration with no gameplay impact — pure status flair, same model as Discord Nitro decorations or Fortnite skins.

### Brand-fit philosophy (locked in)

The 60 items split intentionally across the three tiers — and the brand-relationship of each tier is deliberate:

- **Paid items (30) are completely brand-unrelated.** Generic-but-unique aesthetic flair anyone would equip regardless of holymog affiliation — lava lamps, oil slick iridescence, ferrofluid, möbius strips, eclipses. You should NOT be able to pay your way to anything that signals "I play holymog." These are flair you happen to buy here.
- **Achievement items (20) are FULLY holymog-native.** Tier letters, MediaPipe face-landmark dots, ELO references, canthal-tilt eyes, mog culture. Every achievement item is something only a holymog player could have, and the visual immediately broadcasts that. This is the status pyramid — earned, not bought.
- **holymog+ exclusive items (10) are completely brand-unrelated, just elite/distinct.** Divine god-rays, stained-glass cathedral panels, gold shockwaves, halo wordmarks, score overlays. Subscriber flair driven by visual singularity, not by mog culture.

### Where this lives in the codebase

- **Repo**: `/Users/briangao/code/holymog` — Next.js 16 App Router, React 19.2, TypeScript strict, Tailwind v4, Supabase Postgres + Storage, Stripe, LiveKit, Auth.js v5.
- **Asset bucket**: `holymog-cosmetics` on Supabase Storage (public-read). Used only for the few items with auxiliary SVG icons; the bulk of items render in code with zero assets.
- **Catalog table**: `catalog_items` in Postgres. Each item is one row with `slug`, `kind`, `name`, `description`, `price_cents`, `image_url` (typically null for coded items), `subscriber_only`, `unlock_method`.
- **Client registry**: `lib/customization.ts`. Maps slug → display config (component import, halo color, ring inset, smart-cosmetic kind, etc.). Renderers (`<Frame>`, `<Badge>`, `<NameFx>`, `<ThemeAmbient>`) read from this registry and mount the corresponding shader/SVG/CSS component.
- **Cosmetic components**: under `components/cosmetics/{kind}/{slug}.tsx`. One component per item. Frames export a default React component accepting `{ children, size }`; badges accept `{ size }`; name fx accept `{ children }`; themes accept no props.
- **Store page**: `app/account/store/page.tsx`. Discord-style 4-tab UI already built — just needs items populated.

### How each cosmetic kind renders

| Kind | Surface | Implementation | Renderer |
|---|---|---|---|
| **Frame** | wraps the avatar circle on profile, battle tile, leaderboard row, follower list, settings preview, store card | **Coded React component** — WebGL shader (via `@paper-design/shaders-react` or custom GLSL), animated SVG, or CSS. The frame is a 256×256 absolutely-positioned element with a transparent center; the avatar sits inside via an inner `<div>`. | `<Frame slug={...} size={...}>{avatar}</Frame>` |
| **Badge** | small inline pill next to display name on profile, battle tile, leaderboard row, follower list, settings | **Coded React component** rendered at ~22px. SVG or shader; designed to read clearly at small size. | `<Badge slug={...} />` |
| **Name FX** | wraps the display name text everywhere it renders | CSS class applied to the text span (gradient text, animated shadow, pixelsort), OR a shader/SVG mounted as an absolutely-positioned overlay over the text, OR React data-binding for live-data items (tier prefix, ELO, streak). | `<NameFx slug={...}>{name}</NameFx>` |
| **Theme** | full-bleed fixed background behind the public profile page (`/@username`) | Coded shader, SVG, or CSS rendering full-viewport. Mounted with `prefers-reduced-motion` fallback to a static gradient frame. | `<ThemeAmbient slug={...} />` |

### Acquisition tiers

There are three ways a user gets a cosmetic:

1. **Paid** (30 items) — one-time Stripe Checkout purchase. Flat per-category: frames $6, badges $4, name fx $8, themes $10. Subscribers get 20% off.
2. **Achievement** (20 items) — earned by playing the game. Each has an unlock condition (e.g. "win 5 battles", "maintain 7-day streak", "scan an A-tier"). Free in dollars; earned through engagement. Brand-native — references holymog-specific concepts. Status symbols within the community.
3. **holymog+ exclusive** (10 items) — only equipable while subscribed. Subscribers get all 10 included with their $5/mo or $50/yr subscription. Non-subscribers can see them in the store with "subscribe to unlock" but cannot purchase or equip them. These are the conversion drivers for the subscription.

### About holymog+ (the subscription)

$5/mo or $50/yr. Includes 9 benefits:
1. Unlimited scans (vs 10/day for free users)
2. Visible "holymog+" badge next to your display name everywhere
3. Free monthly cosmetic credit (claim one frame or badge per month)
4. 20% off all paid cosmetics
5. The 10 exclusive cosmetics in this catalog
6. Animated profile banners (free users get static images only)
7. Bigger private parties (10 → 20 participants)
8. Forever scan history retention (vs 90 days for free)
9. Ad-free experience (free users see small display ads on utility pages; subscribers see none)

### Brand voice / aesthetic constraints

- **Everything is lowercase.** No "Aurora" or "Divine Judgment" — it's `aurora`, `divine judgment`. Even product names, even copy.
- **Near-black + near-white.** Background is `#0a0a0a`. Text is `#f5f5f5`. Tailwind's `black` and `white` are overridden to these softer values globally.
- **Minimal, premium, Discord-but-cleaner.** Avoid clutter. Frosted-glass surfaces, subtle backdrop-blur, hover lifts, smooth transitions.
- **Tier color palette**: F = red (`#ef4444`), D = orange (`#f97316`), C = yellow (`#eab308`), B = lime (`#84cc16`), A = green (`#22c55e`), S = cyan→purple gradient (`#22d3ee → #a855f7`). Used in achievement items.

### Build approach: 100% coded

**No generated assets.** Every cosmetic is implemented in code — WebGL shaders (GLSL), SVG (static or animated), or CSS. No Higgsfield, no APNG, no MP4, no PNG textures.

This is a deliberate choice: photoreal generated assets pasted around UI elements always read as foreign. Coded shaders/SVG harmonize with the rest of the interface because they share its rendering pipeline. They also stay sharp at any size, scale to mobile, render at 60fps on the GPU, and weigh kilobytes instead of megabytes.

The build column on each item is one of:

- **`shader`** — WebGL fragment shader (GLSL). Used for procedural materials (flame, ferrofluid, oil slick, aurora, god-rays, smoke, iridescence, dust, granite, rain). Sourced from / inspired by [shaders.com](https://shaders.com), [shadcn.io shaders](https://www.shadcn.io/shaders), and Shadertoy, with brand-specific palette retargeting.
- **`create`** — pure CSS / SVG / HTML. Used for geometric items, brand-typography work, dynamic-data items, simple icons.

Some items are hybrids — e.g. an SVG with a shader effect on hover, or a CSS-driven frame with a single shader element inside. Those get tagged with the dominant technique.

### Performance constraints (mobile-aware)

Inline shader frames mount on lists with many users at once (leaderboard rows, follower lists, battle tiles). Naive rendering would tank mobile Safari. Required behaviors:

- **Intersection-observer gating** — shader frames in scrollable lists initialize their GL context only when in-viewport; pause + release context when out of viewport for more than 1 second.
- **`prefers-reduced-motion`** — every shader item provides a static gradient/SVG fallback. Themes additionally fall back to a flat tier-color gradient.
- **Tab visibility** — shaders pause on `document.hidden`. Mounted via `useDocumentVisibility()` hook.
- **DPR cap** — shader canvases clamp `devicePixelRatio` to 2.0 even on iPhone Pro screens (3.0) to halve fragment cost.
- **Concurrent instance cap** — leaderboard / follower list rendering uses a max of 8 concurrent shader frames; surplus frames render the reduced-motion fallback. List virtualization (already in place) ensures only on-screen rows mount.

These behaviors get implemented once in shared hooks (`useShaderLifecycle`) and consumed by every shader component, not per-item.

### Asset format specs (when an SVG/icon is needed for a `create` item)

- **Frames**: rendered into a 256×256 area, transparent center (perfect circle of transparency at ~20px from the edge). The ring fills the visible region.
- **Badges**: rendered into a 64×64 area, designed to read clearly at 22px. Avoid fine detail under 4px.
- **Themes**: full-viewport (1920×1080+), mounted as a `position: fixed` element behind the profile content. `prefers-reduced-motion` falls back to a static gradient.

### How items get into the live catalog (workflow)

For each item, the steps are:

1. **Build the React component** — under `components/cosmetics/{kind}/{slug}.tsx`. Frames export a default component that accepts `{ children, size }`; badges accept `{ size }`; name fx accept `{ children }`; themes accept no props.
2. **INSERT a row into `catalog_items`** in Supabase Postgres — slug, kind, name, description, price_cents, subscriber_only, unlock_method. (`image_url` is null for coded items; the registry maps to a component instead.)
3. **Add a registry entry to `lib/customization.ts`** — maps slug to component import + display config (ring inset, halo color, etc.).

The plan in `docs/superpowers/plans/2026-05-10-cosmetic-catalog-and-subscription.md` covers all of this.

---

## How to use this document

This is the canonical catalog. Each item below is fully specced: slug, name, tier, unlock condition (or price), description, and build technique.

Pricing reminder: frames $6 · badges $4 · name fx $8 · themes $10. holymog+ subscribers get 20% off all paid items. Achievement items are free (earned). holymog+ exclusive items are free for subscribers, unavailable to free users.

Build column legend:
- `shader` — WebGL fragment shader (GLSL)
- `create` — CSS / SVG / HTML

---

## Frames (16)

| slug | name | tier | price / unlock | description | build |
|---|---|---|---|---|---|
| `frame.lava-lamp` | lava lamp | paid | $6 | molten blobs rising and merging in slow viscosity, sunset colors | shader |
| `frame.oil-slick` | oil slick | paid | $6 | iridescent thin-film rainbow drifting across a wet-asphalt black ring | shader |
| `frame.crt-scanline` | crt scanline | paid | $6 | green phosphor scanlines rolling around the ring with subtle screen curvature | shader |
| `frame.mobius` | möbius | paid | $6 | a single möbius strip slowly rotating, monochrome | shader |
| `frame.cable` | cable | paid | $6 | three colored wires braiding around the ring, server-rack feel | create |
| `frame.ferrofluid` | ferrofluid | paid | $6 | black magnetic liquid spiking outward in living porcupine bristles | shader |
| `frame.torii` | torii | paid | $6 | four torii gate silhouettes at cardinal points with a slow gold pulse | create |
| `frame.weather-front` | weather front | paid | $6 | swirling pressure-system isobars with a lightning fork sparking once per loop | create |
| `frame.scan-ring` | scan ring | achievement | complete 1 scan | mediapipe face-landmark dots and connecting lines forming the ring | create |
| `frame.elo-medal` | elo medal | achievement | gain 100 ELO from base | concentric tier-color bands stacked like a target medallion | create |
| `frame.streak-pyre` | streak pyre | achievement | 7-day streak | flame ring whose intensity scales with your current streak length | shader |
| `frame.canthal` | canthal | achievement | scan A-tier or higher | ring of upward-tilted eye shapes pointing toward the avatar | create |
| `frame.crown-letters` | crown letters | achievement | win 25 battles | tier-letter glyphs (S+, S, A, B...) arranged as a crown on the upper arc | create |
| `frame.scoreband` | scoreband | holymog+ | included with sub | ring rendered as your peak overall-score digits repeating; renders the digit pattern at size ≥ 96px and falls back to a static gold ring outline on inline avatar contexts (battle tiles, leaderboard rows) for readability | create |
| `frame.heartbreaker` | heartbreaker | holymog+ | included with sub | ring of broken hearts mending and re-breaking on a slow heartbeat pulse | create |
| `frame.stained-glass` | stained glass | holymog+ | included with sub | cathedral stained-glass panels arranged radially in deep jewel tones, light shifting through them in slow temperature drift | shader |

## Badges (15)

| slug | name | tier | price / unlock | description | build |
|---|---|---|---|---|---|
| `badge.ripple` | ripple | paid | $4 | concentric water ripples expanding and fading on a slow loop | shader |
| `badge.eclipse` | eclipse | paid | $4 | total solar eclipse with corona flares licking outward | shader |
| `badge.match` | match | paid | $4 | a single match igniting, burning down, regenerating | shader |
| `badge.tarot-back` | tarot back | paid | $4 | bold geometric tarot motif: sun and crescent moon stacked, gold on black | create |
| `badge.compass` | compass | paid | $4 | minimalist cardinal-direction rose with the needle drifting like a real compass | create |
| `badge.honeycomb` | honeycomb | paid | $4 | a single hex cell with a slow gold liquid level rising and falling inside | create |
| `badge.fractal` | fractal | paid | $4 | algorithmic snowflake redrawing one branch at a time | create |
| `badge.morse` | morse | paid | $4 | three pulsing dots cycling a slow rhythmic morse pattern | create |
| `badge.scan-1` | first scan | achievement | complete 1 scan | scanner reticle with the corner brackets locking onto a center dot | create |
| `badge.identity` | identity | achievement | set your bio | face-profile silhouette filled in with a single horizontal scan-line passing | create |
| `badge.duelist` | duelist | achievement | win 5 battles | two profile silhouettes facing each other in 1v1 stance | create |
| `badge.king` | king | achievement | reach 1300 ELO | chess king piece with a faint pulsing aura | create |
| `badge.tier-stamp` | tier stamp | achievement | scan A-tier or higher | your current tier letter stamped into the badge with crisp brand colors | create |
| `badge.holy-wordmark` | holy wordmark | holymog+ | included with sub | the holymog wordmark inside a thin halo, slow gold rotation | create |
| `badge.gavel` | gavel | holymog+ | included with sub | a gavel mid-strike with a radial shockwave pulsing outward on impact | shader |

## Name FX (14)

| slug | name | tier | price / unlock | description | build |
|---|---|---|---|---|---|
| `name.embossed-gold` | embossed gold | paid | $8 | letters appearing 3D-stamped in gold leaf with inner shadow | create |
| `name.carved-obsidian` | carved obsidian | paid | $8 | letters chiseled into volcanic glass with a prismatic edge highlight | create |
| `name.smoke-trail` | smoke trail | paid | $8 | wispy smoke drifting upward off each letter in real time | shader |
| `name.frosted-glass` | frosted glass | paid | $8 | letters as etched frosted glass with subtle prismatic edge refraction | create |
| `name.ink-bleed` | ink bleed | paid | $8 | sumi brush calligraphy with ink wicking outward into paper fibers | shader |
| `name.pixelsort` | pixelsort | paid | $8 | refined horizontal pixel-sort distortion sliding through the letters | create |
| `name.aurora` | aurora | paid | $8 | aurora gradient cycling through the letterforms, slow drift | create |
| `name.signed` | signed | achievement | set your bio | clean handwritten signature underline that draws itself once on render | create |
| `name.tier-prefix` | tier prefix | achievement | scan A-tier or higher | your live scan tier letter precedes your name everywhere ("S+ briangao") | create |
| `name.callout` | callout | achievement | complete 10 scans | your weakest sub-score in brackets cycles per visit ("(jawline)", "(eyes)") | create |
| `name.streak-flame` | streak flame | achievement | 5-game win streak | your current streak digit appears in flame next to your name ("3🔥") | create |
| `name.elo-king` | elo king | achievement | reach 1500 ELO | your current ELO appears as small superscript next to your name | create |
| `name.divine-judgment` | divine judgment | holymog+ | included with sub | letters burning with golden judgment flame, halo above each character | shader |
| `name.score-overlay` | score overlay | holymog+ | included with sub | your peak overall-score floats above the name in tiny gold digits | create |

## Themes (15)

| slug | name | tier | price / unlock | description | build |
|---|---|---|---|---|---|
| `theme.rain` | rain | paid | $10 | procedural rain streaks falling across a near-black field with cool-toned bokeh | shader |
| `theme.dust` | dust | paid | $10 | slow drifting particles in a warm gradient, faint volumetric light beam | shader |
| `theme.spotlight` | spotlight | paid | $10 | shifting radial spotlights sweeping across a near-black backdrop | shader |
| `theme.corridor` | corridor | paid | $10 | infinite perspective grid receding into a vanishing point, single accent color | create |
| `theme.aurora` | aurora | paid | $10 | full-bleed aurora cycling through tier colors, slow horizontal drift | shader |
| `theme.tidewave` | tidewave | paid | $10 | single oscillating sine-wave horizon with glow-point foam, near-black field | shader |
| `theme.granite` | granite | paid | $10 | dark granite-grain noise with a slow caustic light pattern washing across | shader |
| `theme.match-found` | match found | achievement | queue your 1st battle | two profile silhouettes anchored on opposite edges with a slow connecting pulse linking them across the center — matchmaking visualization | create |
| `theme.tier-grid` | tier grid | achievement | complete 50 scans | tier-letter pattern (S+/A/B/C) tiling and slowly cycling tier colors | create |
| `theme.win-stack` | win stack | achievement | win 25 battles | your win count stacking visibly as a column of tier-color bars on one edge | create |
| `theme.embers` | embers | achievement | 14-day streak | particle field of glowing embers rising upward, pyre vibe | create |
| `theme.god-beam` | god beam | achievement | scan an S-tier or higher | volumetric divine light beam descending from above onto a near-black field | shader |
| `theme.divine-rays` | divine rays | holymog+ | included with sub | golden god-rays radiating from a centered halo across the full field | shader |
| `theme.throne` | throne | holymog+ | included with sub | centered crown silhouette with a slow-rotating gold particle ring around it | create |
| `theme.shockwave` | shockwave | holymog+ | included with sub | gold and obsidian radial shockwave pulsing outward on a slow heartbeat | shader |
