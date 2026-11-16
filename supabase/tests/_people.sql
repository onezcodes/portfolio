-- Small fixed cast: a lead, two developers, QA, and the lead of another project.
set session_replication_role = replica;
insert into team_members(email, role) values ('lead@x.com', 'member'), ('dev@x.com', 'member'), ('dev2@x.com', 'member'), ('qa@x.com', 'member'), ('out@x.com', 'member');
insert into projects(id, name, client, notes, account_number) values
  ('11111111-1111-1111-1111-111111111111', 'A', 'ACME', 'secret notes', '123-SECRET'),
  ('22222222-2222-2222-2222-222222222222', 'B', '', '', '');
insert into project_members values
  ('11111111-1111-1111-1111-111111111111', 'lead@x.com', '{lead}'),
  ('11111111-1111-1111-1111-111111111111', 'dev@x.com', '{developer}'),
  ('11111111-1111-1111-1111-111111111111', 'dev2@x.com', '{developer}'),
  ('11111111-1111-1111-1111-111111111111', 'qa@x.com', '{qa}'),
  ('22222222-2222-2222-2222-222222222222', 'out@x.com', '{lead}');
insert into project_milestones(project_id, title, status, estimated_on) values ('11111111-1111-1111-1111-111111111111', 'Build', 'current', '2026-12-01');
insert into project_tasks(id, project_id, title) values ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B task');
set session_replication_role = origin;
