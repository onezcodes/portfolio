alter table public.team_members
  add column if not exists last_seen_at timestamptz;
