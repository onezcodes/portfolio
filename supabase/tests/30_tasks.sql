-- Tasks, subtasks, comments, followers, attachments, dependencies, repeating tasks,
-- activity, inbox, saved views, and attachment storage.
\ir _people.sql
do $$ declare t1 uuid; t2 uuid; nxt uuid; n int; d date; pid uuid; begin
  perform public.test_as('lead@x.com'); set local role authenticated;
  insert into project_tasks(project_id, title, due_on, recur, assignee_email)
    values ('11111111-1111-1111-1111-111111111111', 'Weekly report', '2026-11-20', 'weekly', 'dev@x.com') returning id into t1;
  insert into project_tasks(project_id, title) values ('11111111-1111-1111-1111-111111111111', 'Other') returning id into t2;
  if (select count(*) from task_events where task_id = t1 and action = 'created' and actor_email = 'lead@x.com') <> 1 then raise exception 'FAIL: creation not logged'; end if;
  raise notice 'ok: creating a task is logged with who did it';
  insert into task_subtasks(task_id, project_id, title) values (t1, '22222222-2222-2222-2222-222222222222', 'collect numbers');
  select project_id into pid from task_subtasks where task_id = t1;
  if pid <> '11111111-1111-1111-1111-111111111111' then raise exception 'FAIL: subtask project spoofed'; end if;
  raise notice 'ok: subtasks take their project from the task';
  insert into task_followers(task_id, email) values (t1, 'lead@x.com'), (t1, 'dev2@x.com');
  insert into task_dependencies(task_id, depends_on_id) values (t2, t1);
  begin insert into task_dependencies(task_id, depends_on_id) values (t1, t2); raise exception 'FAIL: dependency loop';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: direct dependency loops are rejected'; end;
  begin insert into task_dependencies(task_id, depends_on_id) values (t2, 'bbbbbbbb-0000-0000-0000-000000000001'); raise exception 'FAIL: cross-project dependency';
  exception when raise_exception or insufficient_privilege then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: cross-project dependencies are rejected'; end;
  reset role;

  perform public.test_as('dev@x.com'); set local role authenticated;
  update project_tasks set status = 'done' where id = t1;
  if (select completed_at from project_tasks where id = t1) is null then raise exception 'FAIL: completed_at not set'; end if;
  select recur_next_id into nxt from project_tasks where id = t1;
  select due_on into d from project_tasks where id = nxt;
  if nxt is null or d <> '2026-11-27' then raise exception 'FAIL: next occurrence %', d; end if;
  if (select count(*) from task_subtasks where task_id = nxt and not done) <> 1 then raise exception 'FAIL: subtasks not copied'; end if;
  if (select count(*) from task_followers where task_id = nxt) <> 2 then raise exception 'FAIL: followers not copied'; end if;
  raise notice 'ok: completing a weekly task creates the next one with subtasks and followers';
  update project_tasks set status = 'todo' where id = t1;
  if (select completed_at from project_tasks where id = t1) is not null then raise exception 'FAIL: completed_at not cleared'; end if;
  update project_tasks set status = 'done' where id = t1;
  if (select count(*) from project_tasks where title = 'Weekly report') <> 2 then raise exception 'FAIL: duplicate occurrence'; end if;
  raise notice 'ok: reopening and completing again does not duplicate';
  begin insert into project_tasks(project_id, title) values ('11111111-1111-1111-1111-111111111111', 'Sneaky'); raise exception 'FAIL: developer created a task';
  exception when insufficient_privilege then raise notice 'ok: developers cannot create ordinary tasks'; end;
  insert into project_tasks(project_id, title, kind) values ('11111111-1111-1111-1111-111111111111', 'Crash on login', 'bug');
  raise notice 'ok: developers can file bugs';
  begin insert into task_dependencies(task_id, depends_on_id) values (t1, t2); raise exception 'FAIL: developer added dependency';
  exception when insufficient_privilege or raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: developers cannot add dependencies'; end;
  insert into task_followers(task_id, email) values (t2, 'dev@x.com');
  begin insert into task_followers(task_id, email) values (t2, 'lead@x.com'); raise exception 'FAIL: developer added another follower';
  exception when insufficient_privilege then raise notice 'ok: developers follow themselves but cannot add others'; end;
  insert into task_comments(task_id, author_email, body) values (t1, 'dev@x.com', 'hello');
  begin insert into task_comments(task_id, author_email, body) values (t1, 'lead@x.com', 'fake'); raise exception 'FAIL: comment as someone else';
  exception when insufficient_privilege then raise notice 'ok: nobody can comment as someone else'; end;
  insert into team_notifications(recipient_email, actor_email, kind, title) values ('lead@x.com', 'dev@x.com', 'mention', 'hi');
  begin insert into team_notifications(recipient_email, actor_email, kind, title) values ('dev2@x.com', 'lead@x.com', 'mention', 'spoof'); raise exception 'FAIL: spoofed notification';
  exception when insufficient_privilege then raise notice 'ok: notifications are sent only as yourself'; end;
  if exists (select 1 from team_notifications) then raise exception 'FAIL: read someone else''s inbox'; end if;
  insert into task_saved_views(owner_email, name, query) values ('dev@x.com', 'Mine', 'who=me');
  insert into storage.objects(bucket_id, name) values ('task-files', '11111111-1111-1111-1111-111111111111/x/a.pdf');
  begin insert into storage.objects(bucket_id, name) values ('task-files', '22222222-2222-2222-2222-222222222222/x/a.pdf'); raise exception 'FAIL: upload into another project';
  exception when insufficient_privilege then raise notice 'ok: files go only into your own projects'; end;
  reset role;

  perform public.test_as('dev2@x.com'); set local role authenticated;
  delete from task_comments where body = 'hello'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: deleted someone else''s comment'; end if;
  raise notice 'ok: developers cannot delete others'' comments';
  reset role;

  perform public.test_as('lead@x.com'); set local role authenticated;
  if (select count(*) from task_saved_views) <> 0 then raise exception 'FAIL: saw someone else''s saved views'; end if;
  update team_notifications set read_at = now(); get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: could not mark own notification read'; end if;
  begin update team_notifications set body = 'rewritten'; raise exception 'FAIL: rewrote a notification';
  exception when insufficient_privilege then raise notice 'ok: inbox items can be marked read but not rewritten'; end;
  delete from task_comments where body = 'hello'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: lead could not delete comment'; end if;
  raise notice 'ok: leads can delete any comment';
  reset role;

  perform public.test_as('out@x.com'); set local role authenticated;
  if exists (select 1 from task_subtasks) or exists (select 1 from task_events) or exists (select 1 from storage.objects where bucket_id = 'task-files') then
    raise exception 'FAIL: outsider sees project data';
  end if;
  begin insert into task_subtasks(task_id, title) values (t1, 'evil'); raise exception 'FAIL: outsider added subtask';
  exception when insufficient_privilege then raise notice 'ok: outsiders see and add nothing'; end;
  reset role;
end $$;
