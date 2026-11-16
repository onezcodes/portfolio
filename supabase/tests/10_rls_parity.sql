-- The set-based read policies (20261116120000) must show every user exactly the rows
-- the original per-row helper functions allowed.
\ir _seed.sql
create temp table checks(tbl text, old_pred text, key text);
insert into checks values
('team_members', 'public.is_team_member()', 'email'),
('projects', 'public.has_project_access(id)', 'id::text'),
('project_members', 'public.has_project_access(project_id)', 'project_id::text||email'),
('ledger_entries', '(project_id is null and public.can_studio_finance()) or (project_id is not null and public.has_project_role(project_id, ''collaborator''))', 'id::text'),
('project_contributions', 'public.has_project_role(project_id, ''collaborator'')', 'id::text'),
('project_milestones', 'public.can_see_schedule(project_id)', 'id::text'),
('project_tasks', 'public.can_see_schedule(project_id)', 'id::text'),
('project_checkins', 'public.can_see_schedule(project_id)', 'id::text'),
('studio_credentials', 'public.can_view_credential(id)', 'id::text'),
('studio_events', 'public.is_team_member() and (public.is_super_admin() or actor_email = public.jwt_email() or (project_id is not null and public.has_project_access(project_id)) or (entity_type = ''credential'' and entity_id <> '''' and public.can_view_credential(entity_id::uuid)))', 'id::text');
grant select on checks to authenticated;
do $$
declare u text; c record; o text; n text; bad int := 0; total int := 0;
begin
  for u in select email from team_members union all select 'onezcodes@gmail.com' union all select 'stranger@x.com' loop
    perform public.test_as(u);
    for c in select * from checks loop
      execute format('select md5(coalesce(string_agg(%s, '','' order by %s), '''')) from public.%I where %s', c.key, c.key, c.tbl, c.old_pred) into o;
      set local role authenticated;
      execute format('select md5(coalesce(string_agg(%s, '','' order by %s), '''')) from public.%I', c.key, c.key, c.tbl) into n;
      reset role;
      total := total + 1;
      if o <> n then bad := bad + 1; raise warning 'MISMATCH % %', u, c.tbl; end if;
    end loop;
  end loop;
  if bad > 0 then raise exception 'FAIL: % of % (user, table) pairs differ', bad, total; end if;
  raise notice 'ok: % (user, table) pairs see the same rows as before', total;
end $$;
