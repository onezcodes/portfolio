-- Allow zero-amount ledger entries so free trials and comped work stay on the record.

alter table public.ledger_entries
  drop constraint ledger_entries_amount_check;

alter table public.ledger_entries
  add constraint ledger_entries_amount_check check (amount >= 0);
