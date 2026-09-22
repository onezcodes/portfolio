import { asAmount, type LedgerKind, type ProjectStatus } from './ledger';

const statuses = new Set<ProjectStatus>(['active', 'paused', 'done']);
const kinds = new Set<LedgerKind>(['income', 'expense']);

export function projectFromForm(form: FormData) {
  const name = String(form.get('name') ?? '').trim();
  if (!name) return null;
  const status = String(form.get('status') ?? 'active') as ProjectStatus;
  if (!statuses.has(status)) return null;
  const started = String(form.get('started_on') ?? '').trim();
  return {
    name,
    client: String(form.get('client') ?? '').trim(),
    status,
    notes: String(form.get('notes') ?? '').trim(),
    started_on: started || null,
  };
}

export function entryFromForm(form: FormData) {
  const amount = asAmount(form.get('amount'), true);
  const kind = String(form.get('kind') ?? '') as LedgerKind;
  if (amount === null || !kinds.has(kind)) return null;
  const occurred = String(form.get('occurred_on') ?? '').trim();
  if (!occurred) return null;
  const projectRaw = String(form.get('project_id') ?? '').trim();
  return {
    project_id: projectRaw || null,
    kind,
    amount,
    currency: String(form.get('currency') ?? 'THB').trim().toUpperCase() || 'THB',
    occurred_on: occurred,
    category: String(form.get('category') ?? '').trim(),
    notes: String(form.get('notes') ?? '').trim(),
  };
}
