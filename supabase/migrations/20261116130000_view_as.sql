-- "View as": the super admin can preview the team app with a teammate's permissions.
--
-- A row here, keyed by the admin's login session, makes public.jwt_email() return the
-- teammate's email for that session only. Every RLS policy resolves identity through
-- jwt_email(), so reads match exactly what the teammate would see. The app blocks all
-- writes while a preview is active. Rows expire after two hours.
--
-- Who may start a preview is checked against the *real* login (real_jwt_email), never
-- jwt_email(), so a preview cannot be used to start another one.
-- Safe to re-run.

create table if not exists public.studio_view_as (
  session_id text primary key,
  admin_email text not null,
  target_email text not null references public.team_members (email) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours'
);

alter table public.studio_view_as enable row level security;

-- The signed-in account, ignoring any preview.
create or replace function public.real_jwt_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.real_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.real_jwt_email() = 'onezcodes@gmail.com'
  or exists (
    select 1 from public.team_members
    where email = public.real_jwt_email() and role = 'super_admin'
  );
$$;

grant execute on function public.real_jwt_email() to authenticated;
grant execute on function public.real_is_super_admin() to authenticated;

drop policy if exists studio_view_as_select on public.studio_view_as;
create policy studio_view_as_select on public.studio_view_as
  for select to authenticated
  using (
    session_id = (select auth.jwt() ->> 'session_id')
    and admin_email = (select public.real_jwt_email())
  );

drop policy if exists studio_view_as_insert on public.studio_view_as;
create policy studio_view_as_insert on public.studio_view_as
  for insert to authenticated
  with check (
    (select public.real_is_super_admin())
    and session_id = (select auth.jwt() ->> 'session_id')
    and admin_email = (select public.real_jwt_email())
    and target_email <> admin_email
  );

drop policy if exists studio_view_as_delete on public.studio_view_as;
create policy studio_view_as_delete on public.studio_view_as
  for delete to authenticated
  using (
    session_id = (select auth.jwt() ->> 'session_id')
    and admin_email = (select public.real_jwt_email())
  );

grant select, insert, delete on public.studio_view_as to authenticated;

-- Identity used by every policy: the previewed teammate when this session has an active
-- preview, otherwise the signed-in account.
create or replace function public.jwt_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select v.target_email
      from public.studio_view_as v
      where v.session_id = auth.jwt() ->> 'session_id'
        and v.admin_email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and v.expires_at > now()
    ),
    lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
