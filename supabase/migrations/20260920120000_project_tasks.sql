-- Owned work on a job. Stages stay the backbone; tasks are the slices people actually do.

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  milestone_id uuid references public.project_milestones (id) on delete set null,
  title text not null,
  notes text not null default '',
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  assignee_email text not null default '',
  due_on date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_tasks_project_id_idx on public.project_tasks (project_id, sort_order);
create index project_tasks_assignee_idx on public.project_tasks (assignee_email, status);
create index project_tasks_due_idx on public.project_tasks (due_on);

create trigger project_tasks_set_updated_at
before update on public.project_tasks
for each row execute procedure public.set_updated_at();

alter table public.project_tasks enable row level security;

create policy tasks_select on public.project_tasks
  for select to authenticated
  using (public.can_see_schedule(project_id));

create policy tasks_insert on public.project_tasks
  for insert to authenticated
  with check (public.can_plan_milestones(project_id));

create policy tasks_update on public.project_tasks
  for update to authenticated
  using (public.can_progress_milestones(project_id))
  with check (public.can_progress_milestones(project_id));

create policy tasks_delete on public.project_tasks
  for delete to authenticated
  using (public.can_plan_milestones(project_id));

grant select, insert, update, delete on public.project_tasks to authenticated;
