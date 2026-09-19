-- Meeting / stand-up link on each project workspace.

alter table public.projects
  add column meeting_url text not null default '';
