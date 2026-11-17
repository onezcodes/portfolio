-- QA checklist sign-off: subtasks can be assigned to a person. Assigned items may
-- only be checked by that person (or a planner). Completing a task is blocked while
-- any assigned subtask is still open. Safe to re-run.

alter table public.task_subtasks
  add column if not exists assignee_email text not null default '';

create index if not exists task_subtasks_assignee_idx
  on public.task_subtasks (project_id, assignee_email)
  where assignee_email <> '';

-- Copy assignee when a repeating task spawns its next occurrence.
create or replace function public.spawn_next_occurrence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  step interval;
  base date;
  next_id uuid;
begin
  if new.status <> 'done' or old.status = 'done' or new.recur = '' or new.recur_next_id is not null then
    return new;
  end if;
  step := case new.recur when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end;
  base := coalesce(new.due_on, current_date);
  insert into public.project_tasks (
    project_id, milestone_id, title, notes, status, assignee_email, due_on, start_on,
    priority, recur, created_by_email, sort_order
  )
  values (
    new.project_id, new.milestone_id, new.title, new.notes, 'todo', new.assignee_email,
    (base + step)::date,
    case when new.start_on is null then null else (new.start_on + (base + step - base))::date end,
    new.priority, new.recur, new.created_by_email,
    coalesce((select max(sort_order) + 1 from public.project_tasks where project_id = new.project_id), 0)
  )
  returning id into next_id;

  insert into public.task_subtasks (task_id, project_id, title, sort_order, assignee_email)
  select next_id, new.project_id, title, sort_order, assignee_email
  from public.task_subtasks
  where task_id = new.id;

  insert into public.task_followers (task_id, email, project_id)
  select next_id, email, new.project_id from public.task_followers where task_id = new.id
  on conflict do nothing;

  update public.project_tasks set recur_next_id = next_id where id = new.id;
  return new;
end;
$$;

-- Assigned checklist items: only the assignee or a planner may tick/untick.
-- Unassigned items stay open to anyone who can progress the schedule.
drop policy if exists task_subtasks_update on public.task_subtasks;
create policy task_subtasks_update on public.task_subtasks
  for update to authenticated
  using (
    public.can_progress_milestones(project_id)
    and (
      assignee_email = ''
      or assignee_email = (select public.jwt_email())
      or public.can_plan_milestones(project_id)
    )
  )
  with check (
    public.can_progress_milestones(project_id)
    and (
      assignee_email = ''
      or assignee_email = (select public.jwt_email())
      or public.can_plan_milestones(project_id)
    )
  );

-- Only planners remove assigned QA checklist rows; anyone who can progress may
-- still remove unassigned subtasks.
drop policy if exists task_subtasks_delete on public.task_subtasks;
create policy task_subtasks_delete on public.task_subtasks
  for delete to authenticated
  using (
    public.can_progress_milestones(project_id)
    and (
      assignee_email = ''
      or public.can_plan_milestones(project_id)
    )
  );

-- Defense in depth: refuse marking a task done while assigned checklist items remain open.
create or replace function public.task_requires_qa_signoff()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    if exists (
      select 1
      from public.task_subtasks
      where task_id = new.id
        and assignee_email <> ''
        and not done
    ) then
      raise exception 'qa sign-off required'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists project_tasks_qa_signoff on public.project_tasks;
create trigger project_tasks_qa_signoff
before insert or update of status on public.project_tasks
for each row execute procedure public.task_requires_qa_signoff();
