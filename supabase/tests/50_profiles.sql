-- Profiles: people edit their own profile and status, never their role or anyone else.
\ir _people.sql
do $$ declare n int; begin
  perform public.test_as('dev@x.com'); set local role authenticated;
  update team_members set display_name = 'Dev', status_emoji = '🏖', status_text = 'On leave', away = true,
    status_until = now() + interval '3 days', time_zone = 'Asia/Bangkok', work_days = '{1,2,3,4}', work_start = '10:00', work_end = '19:00'
  where email = 'dev@x.com';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: could not update own profile'; end if;
  raise notice 'ok: people update their own profile, status, and hours';
  begin
    update team_members set role = 'super_admin' where email = 'dev@x.com';
    raise exception 'FAIL: member made themselves super admin';
  exception when insufficient_privilege then raise notice 'ok: nobody can change their own role'; end;
  update team_members set display_name = 'hacked' where email = 'lead@x.com';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: edited someone else''s profile'; end if;
  raise notice 'ok: nobody edits someone else''s profile';
  begin
    update team_members set work_days = '{1,9}' where email = 'dev@x.com';
    raise exception 'FAIL: invalid work day accepted';
  exception when check_violation then raise notice 'ok: invalid working days are rejected'; end;
  reset role;
end $$;
