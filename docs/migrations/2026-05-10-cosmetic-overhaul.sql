-- ============================================================
-- Cosmetic overhaul: image-asset-based architecture.
--
-- Wipes the old CSS-driven catalog (frame.gold-conic, badge.founder,
-- theme.solar, etc.). Replaces with an empty catalog ready for
-- tomorrow's Higgsfield-generated assets.
--
-- New cosmetic kind: name_fx (display-name treatments).
-- New profile slot:  equipped_name_fx.
-- New storage bucket: holymog-cosmetics (public-read, png/jpeg/webp/mp4).
--
-- Pre-launch — no real users — so the user_inventory + catalog_items
-- wipe is safe. Existing equipped_frame / equipped_theme / equipped_flair
-- values on profiles will reference deleted slugs after this; renderers
-- handle unknown slugs gracefully (render nothing). Tomorrow's catalog
-- seed restores the inventory.
-- ============================================================

begin;

-- 1) Extend the kind constraint to allow name_fx.
alter table catalog_items drop constraint if exists catalog_items_kind_check;
alter table catalog_items
  add constraint catalog_items_kind_check
  check (kind in ('badge', 'theme', 'frame', 'flair', 'name_fx'));

-- 2) New equipped slot.
alter table profiles
  add column if not exists equipped_name_fx text;

-- 3) Wipe old catalog + inventory. Safe because we have no real users
--    (pre-launch). Tomorrow's seed migration replaces with 26 items.
delete from user_inventory;
delete from catalog_items;

-- 4) Public-read cosmetics bucket. Higgsfield assets land here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'holymog-cosmetics',
  'holymog-cosmetics',
  true,                     -- public-read; nothing sensitive in here
  10485760,                 -- 10 MB cap (themes may be ~3 MB MP4s)
  array['image/png', 'image/jpeg', 'image/webp', 'video/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
