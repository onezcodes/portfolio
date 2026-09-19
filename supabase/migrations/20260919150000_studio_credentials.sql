-- Studio-wide shared credentials. Super admin assigns who can view.
-- Secret values are stored ciphertext from the app (CREDENTIALS_SECRET).

create table public.studio_credentials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  website text not null default '',
  username text not null default '',
  login_email text not null default '',
  password_enc text not null default '',
  api_key_enc text not null default '',
  api_token_enc text not null default '',
  notes_enc text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.studio_credential_access (
  credential_id uuid not null references public.studio_credentials (id) on delete cascade,
  email text not null references public.team_members (email) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (credential_id, email)
);

create index studio_credential_access_email_idx on public.studio_credential_access (email);

create trigger studio_credentials_set_updated_at
before update on public.studio_credentials
for each row execute procedure public.set_updated_at();

create or replace function public.can_view_credential(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
  or exists (
    select 1
    from public.studio_credential_access
    where credential_id = cid and email = public.jwt_email()
  );
$$;

create or replace function public.has_credential_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
  or exists (
    select 1 from public.studio_credential_access where email = public.jwt_email()
  );
$$;

alter table public.studio_credentials enable row level security;
alter table public.studio_credential_access enable row level security;

create policy studio_credentials_select on public.studio_credentials
  for select to authenticated
  using (public.can_view_credential(id));

create policy studio_credentials_insert on public.studio_credentials
  for insert to authenticated
  with check (public.is_super_admin());

create policy studio_credentials_update on public.studio_credentials
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy studio_credentials_delete on public.studio_credentials
  for delete to authenticated
  using (public.is_super_admin());

create policy studio_credential_access_select on public.studio_credential_access
  for select to authenticated
  using (public.can_view_credential(credential_id));

create policy studio_credential_access_write on public.studio_credential_access
  for insert to authenticated
  with check (public.is_super_admin());

create policy studio_credential_access_update on public.studio_credential_access
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy studio_credential_access_delete on public.studio_credential_access
  for delete to authenticated
  using (public.is_super_admin());

grant execute on function public.can_view_credential(uuid) to authenticated;
grant execute on function public.has_credential_access() to authenticated;
grant select, insert, update, delete on public.studio_credentials to authenticated;
grant select, insert, update, delete on public.studio_credential_access to authenticated;
