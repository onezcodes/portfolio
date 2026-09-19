-- Internal team ledger. Public site is not a CMS.
-- Super admin: onezcodes@gmail.com (seeded). Only they can whitelist team emails.

create table public.team_members (
  email text primary key,
  role text not null default 'member' check (role in ('super_admin', 'member')),
  created_at timestamptz not null default now()
);

insert into public.team_members (email, role)
values ('onezcodes@gmail.com', 'super_admin');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  notes text not null default '',
  started_on date,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'THB',
  occurred_on date not null default (current_date),
  category text not null default '',
  notes text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index ledger_entries_project_id_idx on public.ledger_entries (project_id);
create index ledger_entries_occurred_on_idx on public.ledger_entries (occurred_on desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
before update on public.projects
for each row execute procedure public.set_updated_at();

create or replace function public.jwt_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members where email = public.jwt_email()
  )
  or public.jwt_email() = 'onezcodes@gmail.com';
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.jwt_email() = 'onezcodes@gmail.com'
  or exists (
    select 1 from public.team_members
    where email = public.jwt_email() and role = 'super_admin'
  );
$$;

alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.ledger_entries enable row level security;

create policy team_members_select on public.team_members
  for select to authenticated
  using (public.is_team_member());

create policy team_members_insert on public.team_members
  for insert to authenticated
  with check (public.is_super_admin() and role = 'member');

create policy team_members_delete on public.team_members
  for delete to authenticated
  using (public.is_super_admin() and email <> 'onezcodes@gmail.com');

create policy projects_all on public.projects
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

create policy ledger_all on public.ledger_entries
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

grant execute on function public.jwt_email() to authenticated;
grant execute on function public.is_team_member() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

grant select, insert, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.ledger_entries to authenticated;
