-- Studio roles: owner, admin, member (replaces super_admin / member).
--
--   owner  - everything, including changing roles and removing admins/owners.
--   admin  - all projects, create/delete projects, invite/remove members, careers,
--            credentials vault, studio overhead ledger. Cannot change roles.
--   member - only projects they are assigned to, per their project role.
--
-- is_super_admin() now means "studio admin" (owner or admin), so every existing policy
-- built on it extends to admins. Owner-only powers use is_studio_owner() and, for
-- View as, the real login (real_is_super_admin). onezcodes@gmail.com is always owner.
-- Safe to re-run.

alter table public.team_members drop constraint if exists team_members_role_check;
update public.team_members set role = 'owner' where role = 'super_admin';
alter table public.team_members drop constraint if exists team_members_role_valid;
alter table public.team_members
  add constraint team_members_role_valid check (role in ('owner', 'admin', 'member'));

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.jwt_email() = 'onezcodes@gmail.com'
  or exists (
    select 1 from public.team_members
    where email = public.jwt_email() and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_studio_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.jwt_email() = 'onezcodes@gmail.com'
  or exists (select 1 from public.team_members where email = public.jwt_email() and role = 'owner');
$$;
grant execute on function public.is_studio_owner() to authenticated;

-- View as stays owner-only, checked against the real login.
create or replace function public.real_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.real_jwt_email() = 'onezcodes@gmail.com'
  or exists (select 1 from public.team_members where email = public.real_jwt_email() and role = 'owner');
$$;

-- Only studio admins create or delete projects (project leads no longer delete).
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check ((select public.is_super_admin()));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using ((select public.is_super_admin()));

-- Studio overhead money (entries with no project) is for studio admins only.
create or replace function public.can_studio_finance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin();
$$;

-- Removing people: owners remove anyone but the permanent owner; admins remove members.
drop policy if exists team_members_delete on public.team_members;
create policy team_members_delete on public.team_members
  for delete to authenticated
  using (
    email <> 'onezcodes@gmail.com'
    and email <> (select public.jwt_email())
    and ((select public.is_studio_owner()) or ((select public.is_super_admin()) and role = 'member'))
  );

-- Changing roles goes through this function (the role column is not directly updatable).
create or replace function public.set_member_role(target_email text, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_studio_owner() then
    raise exception 'only owners can change roles' using errcode = '42501';
  end if;
  if new_role not in ('owner', 'admin', 'member') then
    raise exception 'unknown role' using errcode = '22023';
  end if;
  if lower(target_email) = 'onezcodes@gmail.com' then
    raise exception 'the permanent owner cannot be changed' using errcode = '42501';
  end if;
  update public.team_members set role = new_role where email = lower(target_email);
  if not found then
    raise exception 'not on the team' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.set_member_role(text, text) from public, anon;
grant execute on function public.set_member_role(text, text) to authenticated;
