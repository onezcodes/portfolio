-- Task management core: priority, who created a task, when it was completed,
-- a checklist of subtasks, and a comment thread per task.
-- Access mirrors tasks: anyone who can see a project's schedule can read these;
-- anyone who can progress the schedule can tick subtasks and comment.
-- Safe to re-run.

alter table public.project_tasks add column if not exists priority text not null default '';
alter table public.project_tasks drop constraint if exists project_tasks_priority_valid;
alter table public.project_tasks
  add constraint project_tasks_priority_valid check (priority in ('', 'low', 'medium', 'high'));
alter table public.project_tasks add column if not exists created_by_email text not null default '';
alter table public.project_tasks add column if not exists completed_at timestamptz;

update public.project_tasks
set completed_at = updated_at
where status = 'done' and completed_at is null;

-- Stamp completed_at when a task becomes done; clear it when reopened.
create or replace function public.task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists project_tasks_completed_at on public.project_tasks;
create trigger project_tasks_completed_at
before insert or update of status on public.project_tasks
for each row execute procedure public.task_completed_at();

-- Copy the task's project onto children, so RLS can check the project without a join
-- and a child can never claim a different project than its task.
create or replace function public.task_child_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.project_id := (select project_id from public.project_tasks where id = new.task_id);
  if new.project_id is null then
    raise exception 'task not found';
  end if;
  return new;
end;
$$;

-- Subtasks: a checklist inside a task.
create table if not exists public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists task_subtasks_task_idx on public.task_subtasks (task_id, sort_order);
create index if not exists task_subtasks_project_idx on public.task_subtasks (project_id);

drop trigger if exists task_subtasks_project on public.task_subtasks;
create trigger task_subtasks_project
before insert or update of task_id on public.task_subtasks
for each row execute procedure public.task_child_project();

-- Comments: a thread on a task.
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_email text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);
create index if not exists task_comments_project_idx on public.task_comments (project_id);

drop trigger if exists task_comments_project on public.task_comments;
create trigger task_comments_project
before insert or update of task_id on public.task_comments
for each row execute procedure public.task_child_project();

alter table public.task_subtasks enable row level security;
alter table public.task_comments enable row level security;

-- Reads: same rule as project_tasks (schedule roles), set-based for speed.
drop policy if exists task_subtasks_select on public.task_subtasks;
create policy task_subtasks_select on public.task_subtasks
  for select to authenticated
  using (
    (select public.is_super_admin())
    or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa']))
  );

drop policy if exists task_subtasks_insert on public.task_subtasks;
create policy task_subtasks_insert on public.task_subtasks
  for insert to authenticated
  with check (public.can_progress_milestones(project_id));

drop policy if exists task_subtasks_update on public.task_subtasks;
create policy task_subtasks_update on public.task_subtasks
  for update to authenticated
  using (public.can_progress_milestones(project_id))
  with check (public.can_progress_milestones(project_id));

drop policy if exists task_subtasks_delete on public.task_subtasks;
create policy task_subtasks_delete on public.task_subtasks
  for delete to authenticated
  using (public.can_progress_milestones(project_id));

drop policy if exists task_comments_select on public.task_comments;
create policy task_comments_select on public.task_comments
  for select to authenticated
  using (
    (select public.is_super_admin())
    or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa']))
  );

drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments
  for insert to authenticated
  with check (
    public.can_progress_milestones(project_id)
    and author_email = (select public.jwt_email())
  );

-- Authors remove their own comments; project leads and managers can remove any.
drop policy if exists task_comments_delete on public.task_comments;
create policy task_comments_delete on public.task_comments
  for delete to authenticated
  using (
    author_email = (select public.jwt_email())
    or public.can_plan_milestones(project_id)
  );

grant select, insert, update, delete on public.task_subtasks to authenticated;
grant select, insert, delete on public.task_comments to authenticated;
