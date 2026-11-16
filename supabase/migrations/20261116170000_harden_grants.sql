-- Supabase gives the authenticated role full table privileges by default and relies on
-- RLS for rows. For inbox notifications, rows alone are not enough: recipients should be
-- able to mark their own notifications read, not rewrite what they say.
-- Safe to re-run.
revoke update on public.team_notifications from authenticated, anon;
grant update (read_at) on public.team_notifications to authenticated;
