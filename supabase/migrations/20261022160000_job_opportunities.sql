-- Public hiring posts. Super admin writes them; the site reads open rows with the service role.

create table public.job_opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  location text not null default 'Remote',
  employment_type text not null default 'full-time',
  summary text not null default '',
  body text not null default '',
  status text not null default 'draft',
  apply_email text not null default '',
  published_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_opportunities_slug_key unique (slug),
  constraint job_opportunities_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint job_opportunities_status_check check (status in ('draft', 'open', 'closed')),
  constraint job_opportunities_type_check check (employment_type in ('full-time', 'contract', 'internship'))
);

create index job_opportunities_status_idx on public.job_opportunities (status, published_at desc);

create trigger job_opportunities_set_updated_at
before update on public.job_opportunities
for each row execute procedure public.set_updated_at();

alter table public.job_opportunities enable row level security;

create policy job_opportunities_select on public.job_opportunities
  for select to authenticated
  using (public.is_super_admin());

create policy job_opportunities_insert on public.job_opportunities
  for insert to authenticated
  with check (public.is_super_admin());

create policy job_opportunities_update on public.job_opportunities
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy job_opportunities_delete on public.job_opportunities
  for delete to authenticated
  using (public.is_super_admin());

grant select, insert, update, delete on public.job_opportunities to authenticated;
