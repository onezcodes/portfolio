-- Optional last day to apply. Past it, the public site treats the role as closed.

alter table public.job_opportunities add column if not exists deadline date;
