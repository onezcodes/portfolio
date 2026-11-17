-- QA checklist: assigned subtasks, who may tick them, and done blocked until all check.
\ir _people.sql
do $$ declare t uuid; s1 uuid; s2 uuid; n int; begin
  perform public.test_as('lead@x.com'); set local role authenticated;
  insert into project_tasks(project_id, title)
    values ('11111111-1111-1111-1111-111111111111', 'Ready for QA')
    returning id into t;
  insert into task_subtasks(task_id, project_id, title, assignee_email)
    values (t, '11111111-1111-1111-1111-111111111111', 'Smoke test', 'qa@x.com')
    returning id into s1;
  insert into task_subtasks(task_id, project_id, title, assignee_email)
    values (t, '11111111-1111-1111-1111-111111111111', 'Smoke test', 'dev@x.com')
    returning id into s2;
  begin
    update project_tasks set status = 'done' where id = t;
    raise exception 'FAIL: done allowed with open QA checks';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok: cannot complete while assigned checklist items are open';
  end;
  reset role;

  perform public.test_as('dev@x.com'); set local role authenticated;
  begin
    update task_subtasks set done = true where id = s1;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: developer checked another person''s QA item'; end if;
  exception when insufficient_privilege then
    null;
  end;
  if (select done from task_subtasks where id = s1) then
    raise exception 'FAIL: developer checked another person''s QA item';
  end if;
  update task_subtasks set done = true where id = s2;
  if not (select done from task_subtasks where id = s2) then
    raise exception 'FAIL: assignee could not check own item';
  end if;
  raise notice 'ok: only the assignee (or planner) can check an assigned item';
  reset role;

  perform public.test_as('qa@x.com'); set local role authenticated;
  update task_subtasks set done = true where id = s1;
  if not (select done from task_subtasks where id = s1) then
    raise exception 'FAIL: QA could not check own item';
  end if;
  update project_tasks set status = 'done' where id = t;
  if (select status from project_tasks where id = t) <> 'done' then
    raise exception 'FAIL: task not done after all QA checked';
  end if;
  raise notice 'ok: task completes after every assigned QA checks off';
  reset role;

  perform public.test_as('dev@x.com'); set local role authenticated;
  begin
    delete from task_subtasks where id = s1;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: developer deleted assigned QA item'; end if;
  exception when insufficient_privilege then
    null;
  end;
  if not exists (select 1 from task_subtasks where id = s1) then
    raise exception 'FAIL: developer deleted assigned QA item';
  end if;
  raise notice 'ok: non-planners cannot delete assigned QA checklist items';
  reset role;
end $$;
