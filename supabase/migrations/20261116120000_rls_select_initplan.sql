-- Speed up team-app reads.
--
-- The SELECT policies called security-definer helpers such as has_project_role(project_id, ...)
-- for every row. Postgres cannot inline those, so each row ran its own lookups into
-- team_members and project_members. These policies now compute the viewer's project ids
-- once per statement (`x in (select fn())` runs as a single hashed subplan, and
-- `(select fn())` for no-arg checks runs as an InitPlan) and test each row against that.
-- Who can see what is unchanged.
--
-- Write policies are left alone: they touch one row at a time.
-- Safe to re-run.

-- Projects where the viewer holds any of the wanted roles (null = any role).
create or replace function public.my_project_ids(wanted text[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select project_id
  from public.project_members
  where email = public.jwt_email()
    and (wanted is null or roles && wanted);
$$;

-- Credential ids (as text, to match studio_events.entity_id) the viewer was granted.
create or replace function public.my_credential_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select credential_id::text
  from public.studio_credential_access
  where email = public.jwt_email();
$$;

grant execute on function public.my_project_ids(text[]) to authenticated;
grant execute on function public.my_credential_ids() to authenticated;

-- team_members: was is_team_member() per row.
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated
  using ((select public.is_team_member()));

-- projects: was has_project_access(id).
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (
    (select public.is_super_admin())
    or id in (select public.my_project_ids())
  );

-- project_members: was has_project_access(project_id).
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using (
    (select public.is_super_admin())
    or project_id in (select public.my_project_ids())
  );

-- ledger_entries: was can_studio_finance() / has_project_role(project_id, 'collaborator').
drop policy if exists ledger_select on public.ledger_entries;
create policy ledger_select on public.ledger_entries
  for select to authenticated
  using (
    (project_id is null and (select public.can_studio_finance()))
    or (
      project_id is not null
      and (
        (select public.is_super_admin())
        or project_id in (select public.my_project_ids(array['collaborator', 'lead']))
      )
    )
  );

-- project_contributions: was has_project_role(project_id, 'collaborator').
drop policy if exists contributions_select on public.project_contributions;
create policy contributions_select on public.project_contributions
  for select to authenticated
  using (
    (select public.is_super_admin())
    or project_id in (select public.my_project_ids(array['collaborator', 'lead']))
  );

-- Schedule tables: were can_see_schedule(project_id).
drop policy if exists milestones_select on public.project_milestones;
create policy milestones_select on public.project_milestones
  for select to authenticated
  using (
    (select public.is_super_admin())
    or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa']))
  );

drop policy if exists tasks_select on public.project_tasks;
create policy tasks_select on public.project_tasks
  for select to authenticated
  using (
    (select public.is_super_admin())
    or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa']))
  );

drop policy if exists checkins_select on public.project_checkins;
create policy checkins_select on public.project_checkins
  for select to authenticated
  using (
    (select public.is_super_admin())
    or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa']))
  );

-- studio_credentials: was can_view_credential(id).
drop policy if exists studio_credentials_select on public.studio_credentials;
create policy studio_credentials_select on public.studio_credentials
  for select to authenticated
  using (
    (select public.is_super_admin())
    or id::text in (select public.my_credential_ids())
  );

-- studio_events: was is_team_member() and (... has_project_access / can_view_credential per row).
drop policy if exists studio_events_select on public.studio_events;
create policy studio_events_select on public.studio_events
  for select to authenticated
  using (
    (select public.is_team_member())
    and (
      (select public.is_super_admin())
      or actor_email = (select public.jwt_email())
      or (project_id is not null and project_id in (select public.my_project_ids()))
      or (
        entity_type = 'credential'
        and entity_id <> ''
        and entity_id in (select public.my_credential_ids())
      )
    )
  );

-- Check-ins are read newest-first across all projects on the overview.
create index if not exists project_checkins_created_idx on public.project_checkins (created_at desc);
