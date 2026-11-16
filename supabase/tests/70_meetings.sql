-- Recurring project meetings: assigned people see them, leads set them up, outsiders do not.
\ir _people.sql
set session_replication_role = replica;
insert into project_meetings(id, project_id, title, slots, meeting_url) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sync', '[{"day":2,"time":"21:00"}]', 'https://meet.example/a'),
  ('cccccccc-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'B sync', '[{"day":5,"time":"21:00"}]', 'https://meet.example/b');
insert into calendar_feed_tokens(email, token) values ('dev@x.com', 'tok-dev-000000000000000000000000');
set session_replication_role = origin;

do $$ declare n int; begin
  perform public.test_as('dev@x.com'); set local role authenticated;
  if (select count(*) from project_meetings) <> 1 then raise exception 'FAIL: developer sees other projects'' meetings'; end if;
  raise notice 'ok: members see only their projects'' meetings';
  begin
    insert into project_meetings(project_id, title, slots, meeting_url) values ('11111111-1111-1111-1111-111111111111', 'X', '[]', 'https://x');
    raise exception 'FAIL: developer created a meeting';
  exception when insufficient_privilege then raise notice 'ok: developers cannot create meetings'; end;
  update project_meetings set title = 'hacked'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: developer edited a meeting'; end if;
  raise notice 'ok: developers cannot edit meetings';
  reset role;

  perform public.test_as('lead@x.com'); set local role authenticated;
  insert into project_meetings(project_id, title, slots, meeting_url, backup_url)
    values ('11111111-1111-1111-1111-111111111111', 'Review', '[{"day":5,"time":"09:00"}]', 'https://meet.example/r', 'https://backup.example/r');
  update project_meetings set skip_dates = '{2026-12-01}' where id = 'cccccccc-0000-0000-0000-000000000001'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: lead could not edit a meeting'; end if;
  update project_meetings set title = 'hacked' where project_id = '22222222-2222-2222-2222-222222222222'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: lead edited another project''s meeting'; end if;
  raise notice 'ok: leads set up meetings for their own project only';
  reset role;

  set local role anon;
  if (select count(*) from public.calendar_meetings('tok-dev-000000000000000000000000')) <> 2 then raise exception 'FAIL: calendar feed meetings'; end if;
  if (select count(*) from public.calendar_meetings('nope')) <> 0 then raise exception 'FAIL: bad token sees meetings'; end if;
  raise notice 'ok: calendar feed lists the member''s meetings by token only';
  reset role;
end $$;

-- Skipped stages.
do $$ begin
  perform public.test_as('lead@x.com'); set local role authenticated;
  update project_milestones set status = 'skipped', signoff_note = 'Not needed' where project_id = '11111111-1111-1111-1111-111111111111';
  if (select status from project_milestones where project_id = '11111111-1111-1111-1111-111111111111') <> 'skipped' then raise exception 'FAIL: skip'; end if;
  begin update project_milestones set status = 'bogus'; raise exception 'FAIL: bad stage status accepted';
  exception when check_violation then raise notice 'ok: stages can be skipped (and only valid statuses saved)'; end;
  reset role;
end $$;

-- Series end date defaults to 30 days out.
do $$ begin
  if (select ends_on from project_meetings where title = 'Review') <> current_date + 30 then raise exception 'FAIL: default end date'; end if;
  if (select count(*) from public.calendar_meetings('tok-dev-000000000000000000000000') where ends_on is not null) <> 2 then raise exception 'FAIL: feed end date'; end if;
  raise notice 'ok: meetings end 30 days out by default, and the feed carries the end date';
end $$;
