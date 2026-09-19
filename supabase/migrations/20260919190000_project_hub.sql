-- Per-project logo, URLs, Slack, and encrypted login (not published to /work).

alter table public.projects
  add column logo_url text not null default '',
  add column website_url text not null default '',
  add column staging_url text not null default '',
  add column admin_url text not null default '',
  add column repo_url text not null default '',
  add column slack_url text not null default '',
  add column login_url text not null default '',
  add column login_username text not null default '',
  add column login_email text not null default '',
  add column login_password_enc text not null default '',
  add column extra_links jsonb not null default '[]'::jsonb;
