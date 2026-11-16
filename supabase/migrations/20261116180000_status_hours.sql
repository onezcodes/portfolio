-- Status, availability, and working hours on team profiles, plus a privilege fix.
--
-- Security: authenticated users had UPDATE on every team_members column, and the row
-- policy lets people update their own row, so anyone could set their own role to
-- 'super_admin' through the REST API. Updates are now limited to profile columns.
-- (Inserts and deletes stay super-admin only through the existing row policies.)
-- Safe to re-run.

alter table public.team_members add column if not exists status_emoji text not null default '';
alter table public.team_members add column if not exists status_text text not null default '';
alter table public.team_members add column if not exists status_until timestamptz;
alter table public.team_members add column if not exists away boolean not null default false;
alter table public.team_members add column if not exists time_zone text not null default 'Asia/Bangkok';
alter table public.team_members add column if not exists work_days smallint[] not null default '{1,2,3,4,5}';
alter table public.team_members add column if not exists work_start time not null default '09:00';
alter table public.team_members add column if not exists work_end time not null default '18:00';

alter table public.team_members drop constraint if exists team_members_status_valid;
alter table public.team_members add constraint team_members_status_valid check (
  char_length(status_emoji) <= 16
  and char_length(status_text) <= 80
  and char_length(time_zone) between 1 and 64
  and work_days <@ '{1,2,3,4,5,6,7}'::smallint[]
);

revoke update on public.team_members from authenticated, anon;
grant update (
  display_name, job_title, phone, avatar_url, last_seen_at,
  status_emoji, status_text, status_until, away,
  time_zone, work_days, work_start, work_end
) on public.team_members to authenticated;
