-- Studio activity log. Never store secret values in detail.

create table public.studio_events (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  project_id uuid references public.projects (id) on delete set null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index studio_events_created_idx on public.studio_events (created_at desc);
create index studio_events_project_idx on public.studio_events (project_id, created_at desc);

alter table public.studio_events enable row level security;

create policy studio_events_select on public.studio_events
  for select to authenticated
  using (
    public.is_team_member()
    and (
      public.is_super_admin()
      or actor_email = public.jwt_email()
      or (project_id is not null and public.has_project_access(project_id))
      or (
        entity_type = 'credential'
        and entity_id <> ''
        and public.can_view_credential(entity_id::uuid)
      )
    )
  );

create policy studio_events_insert on public.studio_events
  for insert to authenticated
  with check (public.is_team_member() and actor_email = public.jwt_email());
