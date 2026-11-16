-- Teamwork and tracking: time logs, bug reports, stage sign-off, chat notifications,
-- templates, a client progress link, and a personal calendar feed.
-- Builds on 20261116150000_task_collab.sql. Safe to re-run.

-- ---------- Time tracking ----------
create table if not exists public.task_time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes integer not null default 0 check (minutes between 0 and 1440),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists task_time_task_idx on public.task_time_entries (task_id, started_at);
create index if not exists task_time_project_idx on public.task_time_entries (project_id, started_at);
create index if not exists task_time_person_idx on public.task_time_entries (email, started_at);
-- At most one running timer per person.
create unique index if not exists task_time_one_running on public.task_time_entries (email) where ended_at is null;

drop trigger if exists task_time_project on public.task_time_entries;
create trigger task_time_project
before insert or update of task_id on public.task_time_entries
for each row execute procedure public.task_child_project();

-- Stopping a timer fills in its minutes.
create or replace function public.task_time_minutes()
returns trigger
language plpgsql
as $$
begin
  if new.ended_at is not null and (tg_op = 'INSERT' or old.ended_at is null) and new.minutes = 0 then
    new.minutes := least(1440, greatest(1, round(extract(epoch from (new.ended_at - new.started_at)) / 60)::int));
  end if;
  return new;
end;
$$;

drop trigger if exists task_time_minutes on public.task_time_entries;
create trigger task_time_minutes
before insert or update on public.task_time_entries
for each row execute procedure public.task_time_minutes();

alter table public.task_time_entries enable row level security;

drop policy if exists task_time_select on public.task_time_entries;
create policy task_time_select on public.task_time_entries for select to authenticated
  using ((select public.is_super_admin()) or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa'])));
drop policy if exists task_time_insert on public.task_time_entries;
create policy task_time_insert on public.task_time_entries for insert to authenticated
  with check (email = (select public.jwt_email()) and public.can_progress_milestones(project_id));
drop policy if exists task_time_update on public.task_time_entries;
create policy task_time_update on public.task_time_entries for update to authenticated
  using (email = (select public.jwt_email()))
  with check (email = (select public.jwt_email()));
drop policy if exists task_time_delete on public.task_time_entries;
create policy task_time_delete on public.task_time_entries for delete to authenticated
  using (email = (select public.jwt_email()) or public.can_plan_milestones(project_id));
grant select, insert, update, delete on public.task_time_entries to authenticated;

-- ---------- Bugs ----------
alter table public.project_tasks add column if not exists kind text not null default 'task';
alter table public.project_tasks drop constraint if exists project_tasks_kind_valid;
alter table public.project_tasks add constraint project_tasks_kind_valid check (kind in ('task', 'bug'));

-- QA and developers may file bugs; only leads/managers create ordinary tasks.
drop policy if exists tasks_insert on public.project_tasks;
create policy tasks_insert on public.project_tasks for insert to authenticated
  with check (
    public.can_plan_milestones(project_id)
    or (kind = 'bug' and public.can_progress_milestones(project_id))
  );

-- ---------- Stage sign-off ----------
alter table public.project_milestones add column if not exists signoff_note text not null default '';
alter table public.project_milestones add column if not exists signed_off_by text not null default '';
alter table public.project_milestones add column if not exists signed_off_at timestamptz;

-- ---------- Chat notifications (Slack / Discord incoming webhook) ----------
alter table public.projects add column if not exists chat_webhook_url text not null default '';

-- ---------- Templates ----------
create table if not exists public.studio_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('project', 'checklist')),
  name text not null check (char_length(name) between 1 and 80),
  body jsonb not null default '{}'::jsonb,
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists studio_templates_name on public.studio_templates (kind, lower(name));

alter table public.studio_templates enable row level security;
drop policy if exists studio_templates_select on public.studio_templates;
create policy studio_templates_select on public.studio_templates for select to authenticated
  using ((select public.is_team_member()));
drop policy if exists studio_templates_insert on public.studio_templates;
create policy studio_templates_insert on public.studio_templates for insert to authenticated
  with check ((select public.is_team_member()) and created_by = (select public.jwt_email()));
drop policy if exists studio_templates_delete on public.studio_templates;
create policy studio_templates_delete on public.studio_templates for delete to authenticated
  using (created_by = (select public.jwt_email()) or (select public.is_super_admin()));
grant select, insert, delete on public.studio_templates to authenticated;

insert into public.studio_templates (kind, name, body) values
  ('project', 'App build', '{"stages":[{"title":"Brief","days":7},{"title":"Design","days":21},{"title":"Build","days":49},{"title":"QA","days":63},{"title":"App Store","days":70},{"title":"Launch","days":77}],"tasks":[{"title":"Kick-off call and scope","stage":0,"days":2,"priority":"high"},{"title":"Wireframes","stage":1,"days":12},{"title":"UI design","stage":1,"days":20},{"title":"Set up repo and CI","stage":2,"days":24},{"title":"Core features","stage":2,"days":45,"priority":"high"},{"title":"QA pass","stage":3,"days":60},{"title":"Store listing and screenshots","stage":4,"days":68},{"title":"Submit for review","stage":4,"days":70,"priority":"high"}]}'),
  ('project', 'Website', '{"stages":[{"title":"Brief","days":5},{"title":"Design","days":14},{"title":"Build","days":28},{"title":"Review","days":35},{"title":"Launch","days":40}],"tasks":[{"title":"Collect content and assets","stage":0,"days":5},{"title":"Homepage design","stage":1,"days":10},{"title":"Responsive build","stage":2,"days":25},{"title":"SEO and analytics","stage":2,"days":27},{"title":"Client review round","stage":3,"days":33},{"title":"DNS and go-live","stage":4,"days":40,"priority":"high"}]}'),
  ('checklist', 'QA pass', '{"items":["Test on iOS and Android","Test on small and large screens","Check empty, loading, and error states","Check forms and validation","Check copy and spelling","Check accessibility (contrast, labels)"]}'),
  ('checklist', 'Launch checklist', '{"items":["Production env variables set","Backups and monitoring on","Analytics and error tracking live","DNS and SSL verified","Smoke test on production","Announce to the client"]}'),
  ('checklist', 'App Store submission', '{"items":["App icon and screenshots","Privacy policy URL","Store description and keywords","Test account for review","Build uploaded and processed","Submit for review"]}')
on conflict do nothing;

-- ---------- Client progress link ----------
create table if not exists public.project_share_links (
  project_id uuid primary key references public.projects (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  show_checkin boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now()
);
alter table public.project_share_links enable row level security;
drop policy if exists share_links_select on public.project_share_links;
create policy share_links_select on public.project_share_links for select to authenticated
  using (public.is_project_lead(project_id));
drop policy if exists share_links_write on public.project_share_links;
create policy share_links_write on public.project_share_links for all to authenticated
  using (public.is_project_lead(project_id))
  with check (public.is_project_lead(project_id));
grant select, insert, update, delete on public.project_share_links to authenticated;

-- What a client sees: name, client, status, stages, progress, optional latest check-in.
-- No money, people, tasks, credentials, or links.
create or replace function public.public_project_progress(link_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', p.name,
    'client', p.client,
    'status', p.status,
    'started_on', p.started_on,
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object('title', m.title, 'status', m.status, 'estimated_on', m.estimated_on)
                       order by m.estimated_on nulls last, m.sort_order)
      from public.project_milestones m where m.project_id = p.id
    ), '[]'::jsonb),
    'tasks_open', (select count(*) from public.project_tasks t where t.project_id = p.id and t.status <> 'done' and t.kind = 'task'),
    'tasks_done', (select count(*) from public.project_tasks t where t.project_id = p.id and t.status = 'done' and t.kind = 'task'),
    'checkin', case when s.show_checkin then (
      select jsonb_build_object('body', c.body, 'created_at', c.created_at)
      from public.project_checkins c where c.project_id = p.id order by c.created_at desc limit 1
    ) end,
    'updated_at', p.updated_at
  )
  from public.project_share_links s
  join public.projects p on p.id = s.project_id
  where s.token = link_token and char_length(link_token) >= 24;
$$;
revoke all on function public.public_project_progress(text) from public;
grant execute on function public.public_project_progress(text) to anon, authenticated;

-- ---------- Personal calendar feed ----------
create table if not exists public.calendar_feed_tokens (
  email text primary key,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table public.calendar_feed_tokens enable row level security;
drop policy if exists calendar_tokens_own on public.calendar_feed_tokens;
create policy calendar_tokens_own on public.calendar_feed_tokens for all to authenticated
  using (email = (select public.real_jwt_email()))
  with check (email = (select public.real_jwt_email()) and (select public.is_team_member()));
grant select, insert, update, delete on public.calendar_feed_tokens to authenticated;

-- Dated items for one person: their open tasks, plus stage dates on projects they are on.
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
  where m.estimated_on is not null and m.status <> 'done';
$$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
