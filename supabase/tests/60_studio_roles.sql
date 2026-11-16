-- Studio roles: owner, admin, member.
\ir _people.sql
set session_replication_role = replica;
insert into team_members(email, role) values ('own@x.com', 'owner'), ('adm@x.com', 'admin'), ('adm2@x.com', 'admin');
insert into ledger_entries(project_id, amount, kind, occurred_on, currency) values (null, 100, 'expense', current_date, 'THB');
update project_members set roles = '{lead,collaborator}' where email = 'lead@x.com';
set session_replication_role = origin;

do $$ declare n int; pid uuid; begin
  -- Members: no new projects, no project deletion even as lead, no overhead money.
  perform public.test_as('lead@x.com'); set local role authenticated;
  begin insert into projects(name) values ('Member project'); raise exception 'FAIL: member created a project';
  exception when insufficient_privilege then raise notice 'ok: members cannot create projects'; end;
  delete from projects where id = '11111111-1111-1111-1111-111111111111'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: project lead deleted a project'; end if;
  raise notice 'ok: project leads cannot delete projects';
  if exists (select 1 from ledger_entries where project_id is null) then raise exception 'FAIL: member sees overhead'; end if;
  raise notice 'ok: members do not see studio overhead money';
  if (select count(*) from projects) <> 1 then raise exception 'FAIL: member sees unassigned projects'; end if;
  raise notice 'ok: members see only their assigned projects';
  begin perform public.set_member_role('dev@x.com', 'admin'); raise exception 'FAIL: member changed a role';
  exception when insufficient_privilege then raise notice 'ok: members cannot change roles'; end;
  reset role;

  -- Admins: all projects, create and delete, overhead, invite/remove members only.
  perform public.test_as('adm@x.com'); set local role authenticated;
  if (select count(*) from projects) <> 2 then raise exception 'FAIL: admin does not see all projects'; end if;
  insert into projects(name) values ('Admin project') returning id into pid;
  raise notice 'ok: admins see all projects and create projects';
  delete from projects where id = pid; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin could not delete a project'; end if;
  raise notice 'ok: admins delete projects';
  if not exists (select 1 from ledger_entries where project_id is null) then raise exception 'FAIL: admin cannot see overhead'; end if;
  raise notice 'ok: admins see studio overhead money';
  insert into team_members(email, role) values ('new@x.com', 'member');
  begin insert into team_members(email, role) values ('new-admin@x.com', 'admin'); raise exception 'FAIL: admin invited an admin';
  exception when insufficient_privilege then raise notice 'ok: admins invite members (not admins)'; end;
  delete from team_members where email = 'new@x.com'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin could not remove a member'; end if;
  delete from team_members where email in ('adm2@x.com', 'own@x.com', 'onezcodes@gmail.com'); get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: admin removed an admin or owner'; end if;
  raise notice 'ok: admins remove members but not admins or owners';
  begin perform public.set_member_role('dev@x.com', 'admin'); raise exception 'FAIL: admin changed a role';
  exception when insufficient_privilege then raise notice 'ok: admins cannot change roles'; end;
  begin
    insert into studio_view_as(session_id, admin_email, target_email) values ('s-adm@x.com', 'adm@x.com', 'dev@x.com');
    raise exception 'FAIL: admin started View as';
  exception when insufficient_privilege then raise notice 'ok: View as is owner-only'; end;
  reset role;

  -- Owners: change roles, remove admins; the permanent owner is untouchable.
  perform public.test_as('own@x.com'); set local role authenticated;
  perform public.set_member_role('dev@x.com', 'admin');
  if (select role from team_members where email = 'dev@x.com') <> 'admin' then raise exception 'FAIL: promote'; end if;
  perform public.set_member_role('dev@x.com', 'member');
  raise notice 'ok: owners promote and demote';
  begin perform public.set_member_role('onezcodes@gmail.com', 'member'); raise exception 'FAIL: demoted the permanent owner';
  exception when insufficient_privilege then raise notice 'ok: the permanent owner cannot be demoted'; end;
  delete from team_members where email = 'adm2@x.com'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner could not remove an admin'; end if;
  raise notice 'ok: owners remove admins';
  begin update team_members set role = 'owner' where email = 'dev@x.com'; raise exception 'FAIL: role updated directly';
  exception when insufficient_privilege then raise notice 'ok: roles change only through set_member_role'; end;
  reset role;
end $$;
