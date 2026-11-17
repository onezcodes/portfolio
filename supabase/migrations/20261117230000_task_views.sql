-- Who opened a task recently (Notion-style "seen by" in the drawer header).

create table if not exists public.task_views (
  task_id uuid not null references public.project_tasks (id) on delete cascade,
  email text not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (task_id, email)
);

create index if not exists task_views_task_seen_idx on public.task_views (task_id, seen_at desc);
create index if not exists task_views_project_idx on public.task_views (project_id);

drop trigger if exists task_views_project on public.task_views;
create trigger task_views_project
before insert or update of task_id on public.task_views
for each row execute procedure public.task_child_project();

alter table public.task_views enable row level security;

drop policy if exists task_views_select on public.task_views;
create policy task_views_select on public.task_views for select to authenticated
  using ((select public.is_super_admin()) or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa'])));

-- You can only write your own view row, and only on projects you can work on.
drop policy if exists task_views_upsert on public.task_views;
create policy task_views_upsert on public.task_views for insert to authenticated
  with check (public.can_progress_milestones(project_id) and email = (select public.jwt_email()));

drop policy if exists task_views_update on public.task_views;
create policy task_views_update on public.task_views for update to authenticated
  using (email = (select public.jwt_email()))
  with check (email = (select public.jwt_email()));

grant select, insert, update on public.task_views to authenticated;
