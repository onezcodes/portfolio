-- Stages can be skipped (with an optional note). A skipped stage is closed but not "done":
-- it drops out of progress counts and calendar feeds. The note reuses signoff_note.
alter table public.project_milestones drop constraint if exists project_milestones_status_check;
alter table public.project_milestones add constraint project_milestones_status_check
  check (status in ('pending', 'current', 'done', 'skipped'));

create or replace function public.calendar_feed(feed_token text)
returns table (uid text, kind text, title text, project text, day date, project_id uuid, task_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with who as (
    select f.email from public.calendar_feed_tokens f
    where f.token = feed_token and char_length(feed_token) >= 24
      and exists (select 1 from public.team_members m where m.email = f.email)
  )
  select 'task-' || t.id::text, 'task', t.title, p.name, t.due_on, p.id, t.id
  from public.project_tasks t
  join public.projects p on p.id = t.project_id
  join who on who.email = t.assignee_email
  where t.due_on is not null and t.status <> 'done'
  union all
  select 'stage-' || m.id::text, 'stage', m.title, p.name, m.estimated_on, p.id, null
  from public.project_milestones m
  join public.projects p on p.id = m.project_id
  join public.project_members pm on pm.project_id = p.id
  join who on who.email = pm.email
  where m.estimated_on is not null and m.status not in ('done', 'skipped');
$$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
