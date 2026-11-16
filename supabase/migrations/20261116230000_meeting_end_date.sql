-- Meeting series end on a date (default: 30 days after they are set up). Safe to re-run.
alter table public.project_meetings add column if not exists ends_on date;
update public.project_meetings set ends_on = created_at::date + 30 where ends_on is null;
alter table public.project_meetings alter column ends_on set default (current_date + 30);
alter table public.project_meetings alter column ends_on set not null;

-- Calendar feed rows now carry the end date (return type changed, so drop first).
drop function if exists public.calendar_meetings(text);
create function public.calendar_meetings(feed_token text)
returns table (
  id uuid, title text, project text, project_id uuid, slots jsonb, time_zone text,
  duration_minutes integer, meeting_url text, backup_url text, notes text, skip_dates date[],
  ends_on date, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.title, p.name, p.id, m.slots, m.time_zone, m.duration_minutes,
         m.meeting_url, m.backup_url, m.notes, m.skip_dates, m.ends_on, m.updated_at
  from public.calendar_feed_tokens f
  join public.team_members tm on tm.email = f.email
  join public.project_members pm on pm.email = f.email
  join public.projects p on p.id = pm.project_id
  join public.project_meetings m on m.project_id = p.id
  where f.token = feed_token and char_length(feed_token) >= 24;
$$;
revoke all on function public.calendar_meetings(text) from public;
grant execute on function public.calendar_meetings(text) to anon, authenticated;
