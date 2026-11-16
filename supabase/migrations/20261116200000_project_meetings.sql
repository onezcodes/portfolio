-- Recurring project meetings: weekly slots (e.g. Tue 21:00 and Fri 21:00), a main link and
-- a backup link. Everyone on the project sees them; leads, managers, and studio admins
-- set them up. Single sessions can be skipped. Also feeds personal calendars.
-- Safe to re-run.

create table if not exists public.project_meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null default 'Team meeting' check (char_length(title) between 1 and 80),
  -- [{"day": 0-6 (0 = Sunday), "time": "HH:MM"}]
  slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) between 1 and 14),
  time_zone text not null default 'Asia/Bangkok' check (char_length(time_zone) between 1 and 64),
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 480),
  meeting_url text not null default '' check (char_length(meeting_url) <= 2000),
  backup_url text not null default '' check (char_length(backup_url) <= 2000),
  notes text not null default '' check (char_length(notes) <= 500),
  skip_dates date[] not null default '{}',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_meetings_project_idx on public.project_meetings (project_id);

drop trigger if exists project_meetings_set_updated_at on public.project_meetings;
create trigger project_meetings_set_updated_at
before update on public.project_meetings
for each row execute procedure public.set_updated_at();

alter table public.project_meetings enable row level security;

drop policy if exists project_meetings_select on public.project_meetings;
create policy project_meetings_select on public.project_meetings for select to authenticated
  using ((select public.is_super_admin()) or project_id in (select public.my_project_ids()));

drop policy if exists project_meetings_insert on public.project_meetings;
create policy project_meetings_insert on public.project_meetings for insert to authenticated
  with check (public.can_plan_milestones(project_id));

drop policy if exists project_meetings_update on public.project_meetings;
create policy project_meetings_update on public.project_meetings for update to authenticated
  using (public.can_plan_milestones(project_id))
  with check (public.can_plan_milestones(project_id));

drop policy if exists project_meetings_delete on public.project_meetings;
create policy project_meetings_delete on public.project_meetings for delete to authenticated
  using (public.can_plan_milestones(project_id));

grant select, insert, update, delete on public.project_meetings to authenticated;

-- Meetings for a personal calendar feed: series on projects the token owner belongs to.
create or replace function public.calendar_meetings(feed_token text)
returns table (
  id uuid, title text, project text, project_id uuid, slots jsonb, time_zone text,
  duration_minutes integer, meeting_url text, backup_url text, skip_dates date[], updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.title, p.name, p.id, m.slots, m.time_zone, m.duration_minutes,
         m.meeting_url, m.backup_url, m.skip_dates, m.updated_at
  from public.calendar_feed_tokens f
  join public.team_members tm on tm.email = f.email
  join public.project_members pm on pm.email = f.email
  join public.projects p on p.id = pm.project_id
  join public.project_meetings m on m.project_id = p.id
  where f.token = feed_token and char_length(feed_token) >= 24;
$$;
revoke all on function public.calendar_meetings(text) from public;
grant execute on function public.calendar_meetings(text) to anon, authenticated;
