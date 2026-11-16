-- Task management phase 2: followers, attachments, dependencies, a per-task activity log,
-- recurring tasks, start dates (timeline), @mentions, saved views, and an in-app inbox.
-- Builds on 20261116140000_task_core.sql. Safe to re-run.

-- ---------- Task columns ----------
alter table public.project_tasks add column if not exists start_on date;
alter table public.project_tasks add column if not exists recur text not null default '';
alter table public.project_tasks drop constraint if exists project_tasks_recur_valid;
alter table public.project_tasks
  add constraint project_tasks_recur_valid check (recur in ('', 'daily', 'weekly', 'monthly'));
-- The next occurrence created when a repeating task was completed (so it is created once).
alter table public.project_tasks add column if not exists recur_next_id uuid references public.project_tasks (id) on delete set null;

alter table public.task_comments add column if not exists mentions text[] not null default '{}';

-- ---------- Followers ----------
create table if not exists public.task_followers (
  task_id uuid not null references public.project_tasks (id) on delete cascade,
  email text not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, email)
);
create index if not exists task_followers_email_idx on public.task_followers (email);
create index if not exists task_followers_project_idx on public.task_followers (project_id);

-- ---------- Attachments (files in storage or links) ----------
create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('file', 'link')),
  url text not null check (char_length(url) between 1 and 2000),
  name text not null default '' check (char_length(name) <= 300),
  size_bytes bigint not null default 0,
  content_type text not null default '',
  added_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists task_attachments_task_idx on public.task_attachments (task_id, created_at);
create index if not exists task_attachments_project_idx on public.task_attachments (project_id);

-- ---------- Dependencies: task_id waits on depends_on_id (same project) ----------
create table if not exists public.task_dependencies (
  task_id uuid not null references public.project_tasks (id) on delete cascade,
  depends_on_id uuid not null references public.project_tasks (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);
create index if not exists task_dependencies_on_idx on public.task_dependencies (depends_on_id);
create index if not exists task_dependencies_project_idx on public.task_dependencies (project_id);

create or replace function public.task_dependency_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Compare the two tasks directly (this may run before project_id is filled in).
  if (select project_id from public.project_tasks where id = new.depends_on_id)
     is distinct from (select project_id from public.project_tasks where id = new.task_id) then
    raise exception 'dependencies must be in the same project';
  end if;
  if exists (
    select 1 from public.task_dependencies
    where task_id = new.depends_on_id and depends_on_id = new.task_id
  ) then
    raise exception 'these tasks already depend on each other';
  end if;
  return new;
end;
$$;

-- ---------- Activity log per task ----------
create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_email text not null default '',
  action text not null,
  detail text not null default '' check (char_length(detail) <= 400),
  created_at timestamptz not null default now()
);
create index if not exists task_events_task_idx on public.task_events (task_id, created_at);
create index if not exists task_events_project_idx on public.task_events (project_id);

-- ---------- Saved views (per person) ----------
create table if not exists public.task_saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  project_id uuid references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  query text not null default '' check (char_length(query) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists task_saved_views_owner_idx on public.task_saved_views (owner_email, project_id);

-- ---------- Inbox ----------
create table if not exists public.team_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  actor_email text not null default '',
  kind text not null,
  project_id uuid references public.projects (id) on delete cascade,
  task_id uuid references public.project_tasks (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 300),
  body text not null default '' check (char_length(body) <= 600),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists team_notifications_inbox_idx
  on public.team_notifications (recipient_email, read_at, created_at desc);

-- ---------- Child rows take their project from the task ----------
drop trigger if exists task_followers_project on public.task_followers;
create trigger task_followers_project
before insert or update of task_id on public.task_followers
for each row execute procedure public.task_child_project();

drop trigger if exists task_attachments_project on public.task_attachments;
create trigger task_attachments_project
before insert or update of task_id on public.task_attachments
for each row execute procedure public.task_child_project();

drop trigger if exists task_dependencies_project on public.task_dependencies;
create trigger task_dependencies_project
before insert or update on public.task_dependencies
for each row execute procedure public.task_child_project();

drop trigger if exists task_dependencies_guard on public.task_dependencies;
create trigger task_dependencies_guard
before insert or update on public.task_dependencies
for each row execute procedure public.task_dependency_guard();

drop trigger if exists task_events_project on public.task_events;
create trigger task_events_project
before insert on public.task_events
for each row execute procedure public.task_child_project();

-- ---------- Log task changes automatically ----------
create or replace function public.log_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text := public.jwt_email();
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, project_id, actor_email, action, detail)
    values (new.id, new.project_id, who, 'created', case when new.recur <> '' then 'repeats ' || new.recur else '' end);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.task_events (task_id, project_id, actor_email, action, detail)
    values (new.id, new.project_id, who, 'status', new.status);
  end if;
  if new.assignee_email is distinct from old.assignee_email then
    insert into public.task_events (task_id, project_id, actor_email, action, detail)
    values (new.id, new.project_id, who, 'assigned', new.assignee_email);
  end if;
  if new.due_on is distinct from old.due_on then
    insert into public.task_events (task_id, project_id, actor_email, action, detail)
    values (new.id, new.project_id, who, 'due', coalesce(new.due_on::text, ''));
  end if;
  if new.start_on is distinct from old.start_on then
    insert into public.task_events (task_id, project_id, actor_email, action, detail)
    values (new.id, new.project_id, who, 'start', coalesce(new.start_on::text, ''));
  end if;
  if new.priority is distinct from old.priority then
    insert into public.task_events (task_id, project_id, actor_email, action, detail)
    values (new.id, new.project_id, who, 'priority', new.priority);
  end if;
  if new.title is distinct from old.title then
    insert into public.task_events (task_id, project_id, actor_email, action, detail)
    values (new.id, new.project_id, who, 'renamed', left(new.title, 400));
  end if;
  if new.milestone_id is distinct from old.milestone_id then
    insert into public.task_events (task_id, project_id, actor_email, action, detail)
    values (new.id, new.project_id, who, 'stage', coalesce((select title from public.project_milestones where id = new.milestone_id), ''));
  end if;
  if new.recur is distinct from old.recur then
    insert into public.task_events (task_id, project_id, actor_email, action, detail)
    values (new.id, new.project_id, who, 'recur', new.recur);
  end if;
  if new.notes is distinct from old.notes then
    insert into public.task_events (task_id, project_id, actor_email, action, detail)
    values (new.id, new.project_id, who, 'description', '');
  end if;
  return new;
end;
$$;

drop trigger if exists project_tasks_log on public.project_tasks;
create trigger project_tasks_log
after insert or update on public.project_tasks
for each row execute procedure public.log_task_change();

-- ---------- Repeating tasks: completing one creates the next ----------
create or replace function public.spawn_next_occurrence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  step interval;
  base date;
  next_id uuid;
begin
  if new.status <> 'done' or old.status = 'done' or new.recur = '' or new.recur_next_id is not null then
    return new;
  end if;
  step := case new.recur when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end;
  base := coalesce(new.due_on, current_date);
  insert into public.project_tasks (
    project_id, milestone_id, title, notes, status, assignee_email, due_on, start_on,
    priority, recur, created_by_email, sort_order
  )
  values (
    new.project_id, new.milestone_id, new.title, new.notes, 'todo', new.assignee_email,
    (base + step)::date,
    case when new.start_on is null then null else (new.start_on + (base + step - base))::date end,
    new.priority, new.recur, new.created_by_email,
    coalesce((select max(sort_order) + 1 from public.project_tasks where project_id = new.project_id), 0)
  )
  returning id into next_id;

  insert into public.task_subtasks (task_id, project_id, title, sort_order)
  select next_id, new.project_id, title, sort_order from public.task_subtasks where task_id = new.id;

  insert into public.task_followers (task_id, email, project_id)
  select next_id, email, new.project_id from public.task_followers where task_id = new.id
  on conflict do nothing;

  update public.project_tasks set recur_next_id = next_id where id = new.id;
  return new;
end;
$$;

drop trigger if exists project_tasks_recur on public.project_tasks;
create trigger project_tasks_recur
after update of status on public.project_tasks
for each row execute procedure public.spawn_next_occurrence();

-- ---------- Row-level security ----------
alter table public.task_followers enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.task_events enable row level security;
alter table public.task_saved_views enable row level security;
alter table public.team_notifications enable row level security;

-- Reads on task children follow the schedule roles.
drop policy if exists task_followers_select on public.task_followers;
create policy task_followers_select on public.task_followers for select to authenticated
  using ((select public.is_super_admin()) or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa'])));
drop policy if exists task_attachments_select on public.task_attachments;
create policy task_attachments_select on public.task_attachments for select to authenticated
  using ((select public.is_super_admin()) or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa'])));
drop policy if exists task_dependencies_select on public.task_dependencies;
create policy task_dependencies_select on public.task_dependencies for select to authenticated
  using ((select public.is_super_admin()) or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa'])));
drop policy if exists task_events_select on public.task_events;
create policy task_events_select on public.task_events for select to authenticated
  using ((select public.is_super_admin()) or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa'])));

-- Follow yourself; leads/managers may add or remove anyone.
drop policy if exists task_followers_insert on public.task_followers;
create policy task_followers_insert on public.task_followers for insert to authenticated
  with check (
    public.can_progress_milestones(project_id)
    and (email = (select public.jwt_email()) or public.can_plan_milestones(project_id))
  );
drop policy if exists task_followers_delete on public.task_followers;
create policy task_followers_delete on public.task_followers for delete to authenticated
  using (email = (select public.jwt_email()) or public.can_plan_milestones(project_id));

-- Attachments: anyone who works on the project adds; uploader or lead/manager removes.
drop policy if exists task_attachments_insert on public.task_attachments;
create policy task_attachments_insert on public.task_attachments for insert to authenticated
  with check (public.can_progress_milestones(project_id) and added_by = (select public.jwt_email()));
drop policy if exists task_attachments_delete on public.task_attachments;
create policy task_attachments_delete on public.task_attachments for delete to authenticated
  using (added_by = (select public.jwt_email()) or public.can_plan_milestones(project_id));

-- Dependencies are planning: leads and managers.
drop policy if exists task_dependencies_insert on public.task_dependencies;
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
  with check (public.can_plan_milestones(project_id));
drop policy if exists task_dependencies_delete on public.task_dependencies;
create policy task_dependencies_delete on public.task_dependencies for delete to authenticated
  using (public.can_plan_milestones(project_id));

-- Events: written by triggers; the app may add its own entries as itself.
drop policy if exists task_events_insert on public.task_events;
create policy task_events_insert on public.task_events for insert to authenticated
  with check (public.can_progress_milestones(project_id) and actor_email = (select public.jwt_email()));

-- Saved views belong to one person.
drop policy if exists task_saved_views_own on public.task_saved_views;
create policy task_saved_views_own on public.task_saved_views for all to authenticated
  using (owner_email = (select public.jwt_email()))
  with check (owner_email = (select public.jwt_email()));

-- Inbox: you read and mark your own; any team member may notify another as themselves.
drop policy if exists team_notifications_select on public.team_notifications;
create policy team_notifications_select on public.team_notifications for select to authenticated
  using (recipient_email = (select public.jwt_email()));
drop policy if exists team_notifications_update on public.team_notifications;
create policy team_notifications_update on public.team_notifications for update to authenticated
  using (recipient_email = (select public.jwt_email()))
  with check (recipient_email = (select public.jwt_email()));
drop policy if exists team_notifications_delete on public.team_notifications;
create policy team_notifications_delete on public.team_notifications for delete to authenticated
  using (recipient_email = (select public.jwt_email()));
drop policy if exists team_notifications_insert on public.team_notifications;
create policy team_notifications_insert on public.team_notifications for insert to authenticated
  with check (
    actor_email = (select public.jwt_email())
    and recipient_email <> actor_email
    and (select public.is_team_member())
  );

grant select, insert, delete on public.task_followers to authenticated;
grant select, insert, delete on public.task_attachments to authenticated;
grant select, insert, delete on public.task_dependencies to authenticated;
grant select, insert on public.task_events to authenticated;
grant select, insert, update, delete on public.task_saved_views to authenticated;
grant select, insert, delete on public.team_notifications to authenticated;
grant update (read_at) on public.team_notifications to authenticated;

-- ---------- File storage for attachments ----------
-- Paths are <project_id>/<task_id>/<file>, so access follows the project.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-files',
  'task-files',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'application/json', 'application/zip',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do nothing;

drop policy if exists task_files_select on storage.objects;
create policy task_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'task-files'
    and (
      (select public.is_super_admin())
      or split_part(name, '/', 1) in (
        select p::text from public.my_project_ids(array['lead', 'manager', 'developer', 'qa']) p
      )
    )
  );

drop policy if exists task_files_insert on storage.objects;
create policy task_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-files'
    and (
      (select public.is_super_admin())
      or split_part(name, '/', 1) in (
        select p::text from public.my_project_ids(array['lead', 'manager', 'developer', 'qa']) p
      )
    )
  );

drop policy if exists task_files_delete on storage.objects;
create policy task_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-files'
    and (
      (select public.is_super_admin())
      or split_part(name, '/', 1) in (
        select p::text from public.my_project_ids(array['lead', 'manager', 'developer', 'qa']) p
      )
    )
  );
