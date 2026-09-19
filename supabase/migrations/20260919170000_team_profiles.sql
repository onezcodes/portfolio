-- Display profile for each team email. People set their own name and details.

alter table public.team_members
  add column if not exists display_name text not null default '',
  add column if not exists job_title text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists updated_at timestamptz not null default now();

create trigger team_members_set_updated_at
before update on public.team_members
for each row execute procedure public.set_updated_at();

drop policy if exists team_members_update on public.team_members;

create policy team_members_update on public.team_members
  for update to authenticated
  using (email = public.jwt_email() or public.is_super_admin())
  with check (email = public.jwt_email() or public.is_super_admin());

grant update on public.team_members to authenticated;
