-- Per-project funding: bank account + QR, team contributions. Expenses draw from this pot.

alter table public.projects
  add column bank_name text not null default '',
  add column account_number text not null default '',
  add column qr_url text not null default '';

create table public.project_contributions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  member_email text not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'THB',
  occurred_on date not null default (current_date),
  notes text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index project_contributions_project_id_idx on public.project_contributions (project_id);
create index project_contributions_member_email_idx on public.project_contributions (member_email);

alter table public.project_contributions enable row level security;

create policy contributions_all on public.project_contributions
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

grant select, insert, update, delete on public.project_contributions to authenticated;
