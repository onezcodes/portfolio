-- Time tracking, client link, calendar feed, and templates.
\ir _people.sql
do $$ declare t uuid; e uuid; m int; tok text; j jsonb; n int; begin
  perform public.test_as('lead@x.com'); set local role authenticated;
  insert into project_tasks(project_id, title, assignee_email, due_on) values ('11111111-1111-1111-1111-111111111111', 'Ship it', 'dev@x.com', '2026-11-30') returning id into t;
  reset role;

  perform public.test_as('dev@x.com'); set local role authenticated;
  insert into task_time_entries(task_id, email, started_at) values (t, 'dev@x.com', now() - interval '25 minutes') returning id into e;
  begin insert into task_time_entries(task_id, email) values (t, 'dev@x.com'); raise exception 'FAIL: two timers';
  exception when unique_violation then raise notice 'ok: one running timer per person'; end;
  update task_time_entries set ended_at = now() where id = e;
  select minutes into m from task_time_entries where id = e;
  if m <> 25 then raise exception 'FAIL: minutes %', m; end if;
  raise notice 'ok: stopping a timer records its minutes';
  begin insert into task_time_entries(task_id, email, minutes) values (t, 'lead@x.com', 30); raise exception 'FAIL: logged time for someone else';
  exception when insufficient_privilege then raise notice 'ok: nobody logs time for someone else'; end;
  begin insert into project_share_links(project_id) values ('11111111-1111-1111-1111-111111111111'); raise exception 'FAIL: developer made a client link';
  exception when insufficient_privilege then raise notice 'ok: only leads create client links'; end;
  insert into calendar_feed_tokens(email) values ('dev@x.com') returning token into tok;
  begin insert into calendar_feed_tokens(email) values ('lead@x.com'); raise exception 'FAIL: calendar token for someone else';
  exception when insufficient_privilege then raise notice 'ok: calendar links only for yourself'; end;
  if (select count(*) from studio_templates) <> 5 then raise exception 'FAIL: starter templates'; end if;
  raise notice 'ok: 5 starter templates are readable';
  reset role;

  perform public.test_as('qa@x.com'); set local role authenticated;
  insert into project_tasks(project_id, title, kind) values ('11111111-1111-1111-1111-111111111111', 'Typo on pricing', 'bug');
  raise notice 'ok: QA can file bugs';
  reset role;

  set local role anon;
  select count(*) into n from public.calendar_feed(tok);
  if n <> 2 then raise exception 'FAIL: calendar rows %', n; end if;
  if (select count(*) from public.calendar_feed('short')) <> 0 then raise exception 'FAIL: short token accepted'; end if;
  raise notice 'ok: the calendar feed shows only the owner''s task and stage dates';
  reset role;

  perform public.test_as('lead@x.com'); set local role authenticated;
  insert into project_share_links(project_id, created_by) values ('11111111-1111-1111-1111-111111111111', 'lead@x.com') returning token into tok;
  reset role;
  set local role anon;
  j := public.public_project_progress(tok);
  if j ->> 'name' <> 'A' or jsonb_array_length(j -> 'stages') <> 1 then raise exception 'FAIL: client payload %', j; end if;
  if j::text like '%SECRET%' or j::text like '%secret notes%' then raise exception 'FAIL: client link leaked private fields'; end if;
  if (j ->> 'tasks_open')::int <> 1 then raise exception 'FAIL: bugs counted as client work'; end if;
  if public.public_project_progress('nope') is not null then raise exception 'FAIL: bad token accepted'; end if;
  -- Supabase grants anon table privileges by default; RLS must still return no rows.
  if exists (select 1 from project_share_links) then raise exception 'FAIL: anon can list client links'; end if;
  raise notice 'ok: client links expose only name, stages, and progress';
  if exists (select 1 from projects) or exists (select 1 from ledger_entries) then raise exception 'FAIL: anon reads app data'; end if;
  raise notice 'ok: signed-out visitors read no app tables';
  reset role;
end $$;
