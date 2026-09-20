-- Track the last assignment or due mail so a task is nudged at most once per day.
-- (Applied on remote as due_notice_on when the 20260920140000 stamp was recorded.)

alter table public.project_tasks
  add column if not exists due_notice_on date;
