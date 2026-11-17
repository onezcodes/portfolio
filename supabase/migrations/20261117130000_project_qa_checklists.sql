-- Project-level QA checklists: standalone from tasks. Admin creates a list with
-- items; each item is fanned out to every project QA. Only the assignee (or a
-- planner) can tick a check. Safe to re-run.

create table if not exists public.project_qa_checklists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '',
  created_by_email text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_qa_checklists_project_idx
  on public.project_qa_checklists (project_id, created_at desc);

create table if not exists public.project_qa_checks (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.project_qa_checklists (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  assignee_email text not null,
  done boolean not null default false,
  sort_order integer not null default 0,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists project_qa_checks_list_idx
  on public.project_qa_checks (checklist_id, sort_order);

create index if not exists project_qa_checks_project_idx
  on public.project_qa_checks (project_id);

create index if not exists project_qa_checks_assignee_idx
  on public.project_qa_checks (project_id, assignee_email)
  where not done;

-- Keep project_id in sync with the parent checklist.
create or replace function public.qa_check_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.project_id := (select project_id from public.project_qa_checklists where id = new.checklist_id);
  if new.project_id is null then
    raise exception 'checklist not found';
  end if;
  return new;
end;
$$;

drop trigger if exists project_qa_checks_project on public.project_qa_checks;
create trigger project_qa_checks_project
before insert or update of checklist_id on public.project_qa_checks
for each row execute procedure public.qa_check_project();

-- Stamp checked_at; refresh parent completed_at when all checks are done.
create or replace function public.qa_check_done_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.done then
    if tg_op = 'INSERT' or not old.done then
      new.checked_at := now();
    end if;
  else
    new.checked_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists project_qa_checks_done_stamp on public.project_qa_checks;
create trigger project_qa_checks_done_stamp
before insert or update of done on public.project_qa_checks
for each row execute procedure public.qa_check_done_stamp();

create or replace function public.qa_checklist_refresh_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  list_id uuid;
  open_n int;
begin
  list_id := coalesce(new.checklist_id, old.checklist_id);
  select count(*) into open_n
  from public.project_qa_checks
  where checklist_id = list_id and not done;

  update public.project_qa_checklists
  set
    completed_at = case when open_n = 0 and exists (
      select 1 from public.project_qa_checks where checklist_id = list_id
    ) then coalesce(completed_at, now()) else null end,
    updated_at = now()
  where id = list_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists project_qa_checks_refresh_list on public.project_qa_checks;
create trigger project_qa_checks_refresh_list
after insert or update of done or delete on public.project_qa_checks
for each row execute procedure public.qa_checklist_refresh_completed();

alter table public.project_qa_checklists enable row level security;
alter table public.project_qa_checks enable row level security;

drop policy if exists project_qa_checklists_select on public.project_qa_checklists;
create policy project_qa_checklists_select on public.project_qa_checklists
  for select to authenticated
  using (
    (select public.is_super_admin())
    or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa']))
  );

drop policy if exists project_qa_checklists_insert on public.project_qa_checklists;
create policy project_qa_checklists_insert on public.project_qa_checklists
  for insert to authenticated
  with check (public.can_plan_milestones(project_id));

drop policy if exists project_qa_checklists_update on public.project_qa_checklists;
create policy project_qa_checklists_update on public.project_qa_checklists
  for update to authenticated
  using (public.can_plan_milestones(project_id))
  with check (public.can_plan_milestones(project_id));

drop policy if exists project_qa_checklists_delete on public.project_qa_checklists;
create policy project_qa_checklists_delete on public.project_qa_checklists
  for delete to authenticated
  using (public.can_plan_milestones(project_id));

drop policy if exists project_qa_checks_select on public.project_qa_checks;
create policy project_qa_checks_select on public.project_qa_checks
  for select to authenticated
  using (
    (select public.is_super_admin())
    or project_id in (select public.my_project_ids(array['lead', 'manager', 'developer', 'qa']))
  );

drop policy if exists project_qa_checks_insert on public.project_qa_checks;
create policy project_qa_checks_insert on public.project_qa_checks
  for insert to authenticated
  with check (public.can_plan_milestones(project_id));

drop policy if exists project_qa_checks_update on public.project_qa_checks;
create policy project_qa_checks_update on public.project_qa_checks
  for update to authenticated
  using (
    public.can_progress_milestones(project_id)
    and (
      assignee_email = (select public.jwt_email())
      or public.can_plan_milestones(project_id)
    )
  )
  with check (
    public.can_progress_milestones(project_id)
    and (
      assignee_email = (select public.jwt_email())
      or public.can_plan_milestones(project_id)
    )
  );

drop policy if exists project_qa_checks_delete on public.project_qa_checks;
create policy project_qa_checks_delete on public.project_qa_checks
  for delete to authenticated
  using (public.can_plan_milestones(project_id));

grant select, insert, update, delete on public.project_qa_checklists to authenticated;
grant select, insert, update, delete on public.project_qa_checks to authenticated;
