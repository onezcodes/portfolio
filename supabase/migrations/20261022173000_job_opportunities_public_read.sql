-- Open roles are public. Drafts and closed posts stay behind the super-admin policy.

grant select on public.job_opportunities to anon;

create policy job_opportunities_public_select on public.job_opportunities
  for select to anon
  using (status = 'open');
