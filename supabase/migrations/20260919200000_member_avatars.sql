-- Cache each member's sign-in photo so vault sharing can show faces.

alter table public.team_members
  add column if not exists avatar_url text not null default '';
