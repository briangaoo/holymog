-- ============================================================
-- Add avatar_url to leaderboard + update existing rows.
--
-- avatar_url stores the user's profile picture (users.image)
-- as a fallback when they haven't submitted a leaderboard photo
-- (image_url is null). Kept in sync by the API layer:
--   - POST /api/leaderboard       sets avatar_url on insert/update
--   - POST /api/account/avatar    updates avatar_url when avatar changes
--   - PATCH /api/account/me       updates name when username changes
-- ============================================================

alter table leaderboard add column if not exists avatar_url text;

-- Backfill existing rows from users.image.
update leaderboard l
   set avatar_url = u.image
  from users u
 where l.user_id = u.id
   and u.image is not null;
