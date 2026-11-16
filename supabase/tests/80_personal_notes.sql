-- Private notes and to-dos: only the author sees them, even the owner and with View as.
\ir _people.sql
set session_replication_role = replica;
insert into team_members(email, role) values ('own@x.com', 'owner');
set session_replication_role = origin;

do $$ declare n int; begin
  perform public.test_as('dev@x.com'); set local role authenticated;
  insert into project_personal_items(project_id, kind, body) values ('11111111-1111-1111-1111-111111111111', 'todo', 'Ask about fonts');
  if (select email from project_personal_items) <> 'dev@x.com' then raise exception 'FAIL: author not stamped'; end if;
  begin
    insert into project_personal_items(project_id, body) values ('22222222-2222-2222-2222-222222222222', 'x');
    raise exception 'FAIL: note on a project they are not on';
  exception when insufficient_privilege then raise notice 'ok: notes only on your own projects'; end;
  begin
    insert into project_personal_items(project_id, email, body) values ('11111111-1111-1111-1111-111111111111', 'lead@x.com', 'x');
    raise exception 'FAIL: wrote a note as someone else';
  exception when insufficient_privilege then raise notice 'ok: nobody writes notes as someone else'; end;
  reset role;

  perform public.test_as('lead@x.com'); set local role authenticated;
  if exists (select 1 from project_personal_items) then raise exception 'FAIL: lead sees a teammate''s notes'; end if;
  update project_personal_items set body = 'hacked'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: lead edited a teammate''s note'; end if;
  reset role;

  perform public.test_as('own@x.com'); set local role authenticated;
  if exists (select 1 from project_personal_items) then raise exception 'FAIL: owner sees a member''s notes'; end if;
  raise notice 'ok: teammates, leads, and owners never see your notes';
  reset role;
end $$;
