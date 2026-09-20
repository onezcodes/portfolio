-- One written status per post. Latest note is the last-known state of a job.

create table public.project_checkins (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_email text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index project_checkins_project_idx on public.project_checkins (project_id, created_at desc);

alter table public.project_checkins enable row level security;

create policy checkins_select on public.project_checkins
  for select to authenticated
  using (public.can_see_schedule(project_id));

create policy checkins_insert on public.project_checkins
  for insert to authenticated
  with check (
    public.can_progress_milestones(project_id)
    and author_email = public.jwt_email()
  );

create policy checkins_delete on public.project_checkins
  for delete to authenticated
  using (
    public.can_plan_milestones(project_id)
    or author_email = public.jwt_email()
  );

grant select, insert, delete on public.project_checkins to authenticated;
