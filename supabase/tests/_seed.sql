-- Deterministic sample data: 12 members + a super_admin, 40 projects with mixed roles,
-- thousands of ledger rows, tasks, check-ins, credentials, and events.
select setseed(0.42);
set session_replication_role = replica; -- skip the add-lead trigger while seeding
insert into team_members(email, role) select 'u' || i || '@x.com', 'member' from generate_series(1, 12) i;
insert into team_members(email, role) values ('boss@x.com', 'owner');
insert into projects(id, name) select gen_random_uuid(), 'P' || i from generate_series(1, 40) i;
insert into project_members(project_id, email, roles)
select p.id, m.email, r.roles
from projects p cross join team_members m
cross join lateral (
  select array(select x from unnest(array['lead', 'manager', 'collaborator', 'developer', 'qa']) x where random() < 0.3 and p.id is not null and m.email is not null) roles
) r
where random() < 0.4 and m.role = 'member' and cardinality(r.roles) > 0;
insert into ledger_entries(project_id, amount, kind, occurred_on, currency)
select case when random() < 0.15 then null else (select id from projects order by random() + g * 0 limit 1) end,
  100, case when random() < .5 then 'income' else 'expense' end, current_date - (random() * 400)::int, 'THB'
from generate_series(1, 3000) g;
insert into project_contributions(project_id, amount, member_email, occurred_on)
select (select id from projects order by random() + g * 0 limit 1), 50, 'u1@x.com', current_date from generate_series(1, 500) g;
insert into project_milestones(project_id, title) select (select id from projects order by random() + g * 0 limit 1), 'M' || g from generate_series(1, 400) g;
insert into project_tasks(project_id, title, status)
select (select id from projects order by random() + g * 0 limit 1), 'T' || g, (array['todo', 'doing', 'blocked', 'done'])[1 + (random() * 3)::int]
from generate_series(1, 2000) g;
insert into project_checkins(project_id, author_email, body) select (select id from projects order by random() + g * 0 limit 1), 'u1@x.com', 'b' from generate_series(1, 800) g;
insert into studio_credentials(id, title) select gen_random_uuid(), 'C' || g from generate_series(1, 30) g;
insert into studio_credential_access(credential_id, email) select c.id, m.email from studio_credentials c, team_members m where random() < 0.2 and m.role = 'member';
insert into studio_events(project_id, entity_type, entity_id, actor_email, action)
select case when random() < .5 then (select id from projects order by random() + g * 0 limit 1) end,
  case when random() < .3 then 'credential' else 'project' end,
  case when random() < .3 then (select id::text from studio_credentials order by random() + g * 0 limit 1) else '' end,
  'u' || (1 + (random() * 11)::int) || '@x.com', 'x'
from generate_series(1, 2000) g;
set session_replication_role = origin;
