-- Optional screenshot and related URL on a task.

alter table public.project_tasks
  add column image_url text not null default '',
  add column link_url text not null default '';
