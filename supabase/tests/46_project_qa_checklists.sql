-- Project QA checklists: fan-out to QA, assignee-only toggle, planner delete.
\ir _people.sql
do $$ declare list_id uuid; c1 uuid; c2 uuid; n int; begin
  perform public.test_as('lead@x.com'); set local role authenticated;
  insert into project_qa_checklists(project_id, title, created_by_email)
    values ('11111111-1111-1111-1111-111111111111', 'End users pass', 'lead@x.com')
    returning id into list_id;
  insert into project_qa_checks(checklist_id, project_id, title, assignee_email, sort_order)
    values (list_id, '11111111-1111-1111-1111-111111111111', 'Smoke login', 'qa@x.com', 0)
    returning id into c1;
  insert into project_qa_checks(checklist_id, project_id, title, assignee_email, sort_order)
    values (list_id, '11111111-1111-1111-1111-111111111111', 'Smoke login', 'dev@x.com', 1)
    returning id into c2;
  if (select completed_at from project_qa_checklists where id = list_id) is not null then
    raise exception 'FAIL: list marked complete while open';
  end if;
  raise notice 'ok: open QA checklist is not complete';
  reset role;

  perform public.test_as('dev@x.com'); set local role authenticated;
  begin
    update project_qa_checks set done = true where id = c1;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: developer checked another person''s QA row'; end if;
  exception when insufficient_privilege then
    null;
  end;
  if (select done from project_qa_checks where id = c1) then
    raise exception 'FAIL: developer checked another person''s QA row';
  end if;
  update project_qa_checks set done = true where id = c2;
  if not (select done from project_qa_checks where id = c2) then
    raise exception 'FAIL: assignee could not check own row';
  end if;
  raise notice 'ok: only assignee (or planner) can toggle a QA check';
  reset role;

  perform public.test_as('qa@x.com'); set local role authenticated;
  update project_qa_checks set done = true where id = c1;
  if (select completed_at from project_qa_checklists where id = list_id) is null then
    raise exception 'FAIL: list not completed after all checks';
  end if;
  raise notice 'ok: checklist completes when every check is done';
  reset role;

  perform public.test_as('dev@x.com'); set local role authenticated;
  begin
    delete from project_qa_checklists where id = list_id;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: developer deleted a QA checklist'; end if;
  exception when insufficient_privilege then
    null;
  end;
  if not exists (select 1 from project_qa_checklists where id = list_id) then
    raise exception 'FAIL: developer deleted a QA checklist';
  end if;
  raise notice 'ok: only planners delete QA checklists';
  reset role;

  perform public.test_as('lead@x.com'); set local role authenticated;
  delete from project_qa_checklists where id = list_id;
  if exists (select 1 from project_qa_checks where checklist_id = list_id) then
    raise exception 'FAIL: checks not cascaded';
  end if;
  raise notice 'ok: deleting a checklist removes its checks';
  reset role;
end $$;
