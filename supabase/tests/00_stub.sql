-- Minimal stand-ins for what Supabase provides, so migrations and RLS can be tested on
-- plain Postgres: roles, auth.jwt() from request.jwt.claims, storage tables, and
-- Supabase's default privileges (authenticated/anon get table privileges; RLS decides rows).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create table if not exists auth.users (id uuid primary key, email text);
create table if not exists storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Helper for tests: act as a signed-in user for the rest of the transaction.
create or replace function public.test_as(email text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('email', email, 'session_id', 's-' || email)::text, true)
$$;
