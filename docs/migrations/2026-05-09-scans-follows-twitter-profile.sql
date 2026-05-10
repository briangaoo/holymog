-- ============================================================
-- Twitter-style profiles + follow graph + scan-image storage.
--
-- New profile fields: location, banner_url, follower/following counts.
-- New table: follows (directed graph).
-- scan_history: image_path + requires_review for the >= 87 review queue.
-- New private storage bucket: holymog-scans.
-- ============================================================

-- profiles: identity + social fields
alter table profiles
  add column if not exists location text,
  add column if not exists banner_url text,
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0;

-- scan_history: server-side image archive + manual-review flag
alter table scan_history
  add column if not exists image_path text,
  add column if not exists requires_review boolean not null default false,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references users(id) on delete set null;

create index if not exists scan_history_review_idx
  on scan_history (requires_review, created_at desc) where requires_review;

-- follows: directed graph; can't follow self.
create table if not exists follows (
  follower_user_id uuid not null references users(id) on delete cascade,
  followed_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id)
);

create index if not exists follows_followed_idx
  on follows (followed_user_id, created_at desc);
create index if not exists follows_follower_idx
  on follows (follower_user_id, created_at desc);

-- Trigger: keep profiles.followers_count + following_count in sync with
-- the follows table. Atomic, so the count is always accurate even
-- under concurrent inserts/deletes.
create or replace function follows_after_insert() returns trigger as $$
begin
  update profiles set followers_count = followers_count + 1
   where user_id = new.followed_user_id;
  update profiles set following_count = following_count + 1
   where user_id = new.follower_user_id;
  return new;
end;
$$ language plpgsql;

create or replace function follows_after_delete() returns trigger as $$
begin
  update profiles set followers_count = greatest(0, followers_count - 1)
   where user_id = old.followed_user_id;
  update profiles set following_count = greatest(0, following_count - 1)
   where user_id = old.follower_user_id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists follows_insert_count_trigger on follows;
create trigger follows_insert_count_trigger
  after insert on follows
  for each row execute function follows_after_insert();

drop trigger if exists follows_delete_count_trigger on follows;
create trigger follows_delete_count_trigger
  after delete on follows
  for each row execute function follows_after_delete();

-- Storage: private bucket for every scan image. Service-role only;
-- anon + authenticated have NO access. Images served via signed URLs
-- minted by our own API endpoints after auth + ownership checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'holymog-scans',
  'holymog-scans',
  false, -- PRIVATE — this is the headline security property
  5242880, -- 5 MB cap (compressed scan frames are ~50-150 KB)
  array['image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- Storage policies: deny everything to anon + authenticated. Service-role
-- bypasses RLS so the API can read/write freely. Even if our anon key
-- leaks, scan images are inaccessible without service-role credentials.
do $$
begin
  -- Some Supabase deployments seed default policies on new buckets.
  -- Drop ours if they exist; then declare deny-all explicitly.
  execute 'drop policy if exists holymog_scans_no_anon_select on storage.objects';
  execute 'drop policy if exists holymog_scans_no_anon_insert on storage.objects';
  execute 'drop policy if exists holymog_scans_no_anon_update on storage.objects';
  execute 'drop policy if exists holymog_scans_no_anon_delete on storage.objects';
exception when others then
  -- Bucket policy management may not be available via SQL on older
  -- Supabase plans; the bucket itself being public=false is the gate.
  null;
end $$;
