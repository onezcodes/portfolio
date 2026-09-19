-- Optional voucher slip on team contributions: storage path or external URL.

alter table public.project_contributions
  add column voucher_url text not null default '';
