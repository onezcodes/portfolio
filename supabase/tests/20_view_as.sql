-- "View as": the super admin's preview sees exactly what the teammate sees, and the
-- preview cannot be started by others, leak across sessions, or outlive its expiry.
\ir _seed.sql
create temp table checks(tbl text, key text);
insert into checks values ('team_members','email'),('projects','id::text'),('project_members','project_id::text||email'),
 ('ledger_entries','id::text'),('project_contributions','id::text'),('project_milestones','id::text'),('project_tasks','id::text'),
 ('project_checkins','id::text'),('studio_credentials','id::text'),('studio_events','id::text');
grant select on checks to authenticated;
do $$
declare u text; c record; real_h text; prev_h text; bad int := 0; total int := 0;
begin
  for u in select email from team_members where role = 'member' loop
    for c in select * from checks loop
      perform public.test_as(u);
      set local role authenticated;
      execute format('select md5(coalesce(string_agg(%s, '','' order by %s), '''')) from public.%I', c.key, c.key, c.tbl) into real_h;
      reset role;
      perform set_config('request.jwt.claims', json_build_object('email', 'onezcodes@gmail.com', 'session_id', 'sess-admin')::text, true);
      set local role authenticated;
      delete from public.studio_view_as;
      insert into public.studio_view_as(session_id, admin_email, target_email) values ('sess-admin', 'onezcodes@gmail.com', u);
      execute format('select md5(coalesce(string_agg(%s, '','' order by %s), '''')) from public.%I', c.key, c.key, c.tbl) into prev_h;
      if public.is_super_admin() then raise exception 'FAIL: preview of % still super admin', u; end if;
      delete from public.studio_view_as;
      if public.jwt_email() <> 'onezcodes@gmail.com' then raise exception 'FAIL: stopping did not restore the admin'; end if;
      reset role;
      total := total + 1;
      if real_h <> prev_h then bad := bad + 1; raise warning 'MISMATCH % %', u, c.tbl; end if;
    end loop;
  end loop;
  if bad > 0 then raise exception 'FAIL: % of % previews differ from the real view', bad, total; end if;
  raise notice 'ok: % previews match what the teammate really sees', total;
end $$;

do $$ begin
  perform public.test_as('u1@x.com');
  set local role authenticated;
  begin
    insert into public.studio_view_as(session_id, admin_email, target_email) values ('s-u1@x.com', 'u1@x.com', 'u2@x.com');
    raise exception 'FAIL: member started a preview';
  exception when insufficient_privilege then raise notice 'ok: members cannot start a preview'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('email', 'onezcodes@gmail.com', 'session_id', 'sess-a')::text, true);
  set local role authenticated;
  begin
    insert into public.studio_view_as(session_id, admin_email, target_email) values ('sess-OTHER', 'onezcodes@gmail.com', 'u2@x.com');
    raise exception 'FAIL: preview planted in another session';
  exception when insufficient_privilege then raise notice 'ok: a preview cannot be created for another session'; end;
  insert into public.studio_view_as(session_id, admin_email, target_email, expires_at) values ('sess-a', 'onezcodes@gmail.com', 'u2@x.com', now() - interval '1 minute');
  if public.jwt_email() <> 'onezcodes@gmail.com' then raise exception 'FAIL: expired preview still applied'; end if;
  raise notice 'ok: expired previews are ignored';
  delete from public.studio_view_as;
  insert into public.studio_view_as(session_id, admin_email, target_email) values ('sess-a', 'onezcodes@gmail.com', 'u2@x.com');
  perform set_config('request.jwt.claims', json_build_object('email', 'onezcodes@gmail.com', 'session_id', 'sess-b')::text, true);
  if public.jwt_email() <> 'onezcodes@gmail.com' then raise exception 'FAIL: preview leaked to another session'; end if;
  raise notice 'ok: a preview stays in its own session';
  perform set_config('request.jwt.claims', json_build_object('email', 'u2@x.com', 'session_id', 'sess-a')::text, true);
  if exists (select 1 from public.studio_view_as) or public.jwt_email() <> 'u2@x.com' then raise exception 'FAIL: teammate affected by admin preview row'; end if;
  raise notice 'ok: a colliding session id does not affect the teammate';
  reset role;
end $$;
