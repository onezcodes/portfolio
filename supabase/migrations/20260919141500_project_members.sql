-- Per-project privilege. A person can hold several roles on the same job.

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null references public.team_members (email) on delete cascade,
  roles text[] not null,
  created_at timestamptz not null default now(),
  primary key (project_id, email),
  constraint project_members_roles_valid check (
    roles <> '{}'
    and roles <@ array['lead', 'manager', 'collaborator']::text[]
  )
);

create index project_members_email_idx on public.project_members (email);

create or replace function public.project_roles_of(pid uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select roles
      from public.project_members
      where project_id = pid and email = public.jwt_email()
    ),
    '{}'::text[]
  );
$$;

create or replace function public.has_project_access(pid uuid)
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
    where project_id = pid and email = public.jwt_email()
  );
$$;

create or replace function public.is_project_lead(pid uuid)
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
      and 'lead' = any (roles)
  );
$$;

create or replace function public.has_project_role(pid uuid, wanted text)
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
        wanted = any (roles)
        or 'lead' = any (roles)
      )
  );
$$;

create or replace function public.can_studio_finance()
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
    where email = public.jwt_email()
      and ('lead' = any (roles) or 'collaborator' = any (roles))
  );
$$;

create or replace function public.add_project_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text := public.jwt_email();
begin
  if who = '' then
    who := 'onezcodes@gmail.com';
  end if;
  insert into public.project_members (project_id, email, roles)
  values (new.id, who, array['lead']::text[])
  on conflict do nothing;
  if who <> 'onezcodes@gmail.com' then
    insert into public.project_members (project_id, email, roles)
    values (new.id, 'onezcodes@gmail.com', array['lead']::text[])
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger projects_add_lead
after insert on public.projects
for each row execute procedure public.add_project_lead();

insert into public.project_members (project_id, email, roles)
select id, 'onezcodes@gmail.com', array['lead']::text[]
from public.projects
on conflict do nothing;

alter table public.project_members enable row level security;

drop policy if exists projects_all on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.has_project_access(id));
create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.is_team_member());
create policy projects_update on public.projects
  for update to authenticated
  using (public.has_project_access(id))
  with check (public.has_project_access(id));
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_project_lead(id));

drop policy if exists ledger_all on public.ledger_entries;
create policy ledger_select on public.ledger_entries
  for select to authenticated
  using (
    (project_id is null and public.can_studio_finance())
    or (project_id is not null and public.has_project_role(project_id, 'collaborator'))
  );
create policy ledger_write on public.ledger_entries
  for insert to authenticated
  with check (
    (project_id is null and public.can_studio_finance())
    or (project_id is not null and public.has_project_role(project_id, 'collaborator'))
  );
create policy ledger_update on public.ledger_entries
  for update to authenticated
  using (
    (project_id is null and public.can_studio_finance())
    or (project_id is not null and public.has_project_role(project_id, 'collaborator'))
  )
  with check (
    (project_id is null and public.can_studio_finance())
    or (project_id is not null and public.has_project_role(project_id, 'collaborator'))
  );
create policy ledger_delete on public.ledger_entries
  for delete to authenticated
  using (
    (project_id is null and public.can_studio_finance())
    or (project_id is not null and public.has_project_role(project_id, 'collaborator'))
  );

drop policy if exists contributions_all on public.project_contributions;
create policy contributions_select on public.project_contributions
  for select to authenticated
  using (public.has_project_role(project_id, 'collaborator'));
create policy contributions_insert on public.project_contributions
  for insert to authenticated
  with check (public.has_project_role(project_id, 'collaborator'));
create policy contributions_update on public.project_contributions
  for update to authenticated
  using (public.has_project_role(project_id, 'collaborator'))
  with check (public.has_project_role(project_id, 'collaborator'));
create policy contributions_delete on public.project_contributions
  for delete to authenticated
  using (public.has_project_role(project_id, 'collaborator'));

drop policy if exists milestones_all on public.project_milestones;
create policy milestones_select on public.project_milestones
  for select to authenticated
  using (public.has_project_role(project_id, 'manager'));
create policy milestones_insert on public.project_milestones
  for insert to authenticated
  with check (public.has_project_role(project_id, 'manager'));
create policy milestones_update on public.project_milestones
  for update to authenticated
  using (public.has_project_role(project_id, 'manager'))
  with check (public.has_project_role(project_id, 'manager'));
create policy milestones_delete on public.project_milestones
  for delete to authenticated
  using (public.has_project_role(project_id, 'manager'));

create policy project_members_select on public.project_members
  for select to authenticated
  using (public.has_project_access(project_id));
create policy project_members_insert on public.project_members
  for insert to authenticated
  with check (public.is_project_lead(project_id));
create policy project_members_update on public.project_members
  for update to authenticated
  using (public.is_project_lead(project_id))
  with check (public.is_project_lead(project_id));
create policy project_members_delete on public.project_members
  for delete to authenticated
  using (public.is_project_lead(project_id));

grant execute on function public.project_roles_of(uuid) to authenticated;
grant execute on function public.has_project_access(uuid) to authenticated;
grant execute on function public.is_project_lead(uuid) to authenticated;
grant execute on function public.has_project_role(uuid, text) to authenticated;
grant execute on function public.can_studio_finance() to authenticated;

grant select, insert, update, delete on public.project_members to authenticated;
