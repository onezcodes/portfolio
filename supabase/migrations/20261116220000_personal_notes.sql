-- Private notes and to-dos: one person's scratchpad on a project. Only the author ever sees
-- them (by real login, so "View as" never exposes a teammate's notes). Safe to re-run.

create table if not exists public.project_personal_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null default public.real_jwt_email(),
  kind text not null default 'todo' check (kind in ('note', 'todo')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_personal_items_owner_idx on public.project_personal_items (email, project_id);

drop trigger if exists project_personal_items_set_updated_at on public.project_personal_items;
create trigger project_personal_items_set_updated_at
before update on public.project_personal_items
for each row execute procedure public.set_updated_at();

alter table public.project_personal_items enable row level security;

drop policy if exists project_personal_items_own on public.project_personal_items;
create policy project_personal_items_own on public.project_personal_items for all to authenticated
  using (email = (select public.real_jwt_email()))
  with check (
    email = (select public.real_jwt_email())
    and ((select public.real_is_super_admin()) or (select public.is_super_admin()) or project_id in (select public.my_project_ids()))
  );

revoke all on public.project_personal_items from anon;
grant select, insert, update, delete on public.project_personal_items to authenticated;
