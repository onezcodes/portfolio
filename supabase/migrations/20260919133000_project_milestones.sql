-- Estimated milestone trackers per project. Current stage is status = current.

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  estimated_on date,
  status text not null default 'pending' check (status in ('pending', 'current', 'done')),
  sort_order integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index project_milestones_project_id_idx on public.project_milestones (project_id, sort_order);

alter table public.project_milestones enable row level security;

create policy milestones_all on public.project_milestones
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

grant select, insert, update, delete on public.project_milestones to authenticated;
