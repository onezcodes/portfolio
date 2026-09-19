-- Optional voucher slip: uploaded file path in storage, or an external URL.

alter table public.ledger_entries
  add column voucher_url text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vouchers',
  'vouchers',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy vouchers_select on storage.objects
  for select to authenticated
  using (bucket_id = 'vouchers' and public.is_team_member());

create policy vouchers_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vouchers' and public.is_team_member());

create policy vouchers_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'vouchers' and public.is_team_member());
