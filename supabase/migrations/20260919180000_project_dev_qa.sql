-- Developer and QA on a project: schedule and details, not money or people.
-- Developers and QA can move stage status. Only lead/manager can plan stages.

alter table public.project_members drop constraint if exists project_members_roles_valid;

alter table public.project_members
  add constraint project_members_roles_valid check (
    roles <> '{}'
    and roles <@ array['lead', 'manager', 'collaborator', 'developer', 'qa']::text[]
  );

create or replace function public.can_see_schedule(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
  or exists (
    select 1
    from public.project_members
    where project_id = pid
      and email = public.jwt_email()
      and (
        'lead' = any (roles)
        or 'manager' = any (roles)
        or 'developer' = any (roles)
        or 'qa' = any (roles)
      )
  );
$$;

create or replace function public.can_plan_milestones(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_project_role(pid, 'manager');
$$;

create or replace function public.can_progress_milestones(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_see_schedule(pid);
$$;

drop policy if exists milestones_select on public.project_milestones;
drop policy if exists milestones_insert on public.project_milestones;
drop policy if exists milestones_update on public.project_milestones;
drop policy if exists milestones_delete on public.project_milestones;

create policy milestones_select on public.project_milestones
  for select to authenticated
  using (public.can_see_schedule(project_id));

create policy milestones_insert on public.project_milestones
  for insert to authenticated
  with check (public.can_plan_milestones(project_id));

create policy milestones_update on public.project_milestones
  for update to authenticated
  using (public.can_progress_milestones(project_id))
  with check (public.can_progress_milestones(project_id));

create policy milestones_delete on public.project_milestones
  for delete to authenticated
  using (public.can_plan_milestones(project_id));

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (public.has_project_role(id, 'manager'))
  with check (public.has_project_role(id, 'manager'));

grant execute on function public.can_see_schedule(uuid) to authenticated;
grant execute on function public.can_plan_milestones(uuid) to authenticated;
grant execute on function public.can_progress_milestones(uuid) to authenticated;
