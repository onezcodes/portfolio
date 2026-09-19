import type { SupabaseClient } from '@supabase/supabase-js';
import { asAmount, money } from './ledger';
import { isHttpUrl, storedImageFromForm } from './vouchers';

export type Contribution = {
  id: string;
  project_id: string;
  member_email: string;
  amount: number | string;
  currency: string;
  occurred_on: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  voucher_url: string;
};

export async function updateProjectBank(
  supabase: SupabaseClient,
  form: FormData,
  projectId: string,
  userId: string,
  currentQr: string,
) {
  const bank_name = String(form.get('bank_name') ?? '').trim();
  const account_number = String(form.get('account_number') ?? '').trim();
  const stored = await storedImageFromForm(form, supabase, userId, 'qr', 'qr_url');
  if ('error' in stored) return stored;

  let qr_url = currentQr;
  if (stored.path) {
    if (currentQr && !isHttpUrl(currentQr)) {
      await supabase.storage.from('vouchers').remove([currentQr]);
    }
    qr_url = stored.path;
  }

  const { error } = await supabase
    .from('projects')
    .update({ bank_name, account_number, qr_url })
    .eq('id', projectId);
  if (error) {
    console.error(error.message);
    return { error: 'invalid' as const };
  }
  return { error: null };
}

export async function addContribution(
  supabase: SupabaseClient,
  form: FormData,
  projectId: string,
  userId: string | null,
) {
  const member_email = String(form.get('member_email') ?? '').trim().toLowerCase();
  const amount = asAmount(form.get('amount'));
  const occurred_on = String(form.get('occurred_on') ?? '').trim();
  if (!member_email || !amount || !occurred_on || !userId) return { error: 'invalid' as const };

  const stored = await storedImageFromForm(form, supabase, userId, 'voucher', 'voucher_url');
  if ('error' in stored) return stored;

  const { error } = await supabase.from('project_contributions').insert({
    project_id: projectId,
    member_email,
    amount,
    currency: String(form.get('currency') ?? 'THB').trim().toUpperCase() || 'THB',
    occurred_on,
    notes: String(form.get('notes') ?? '').trim(),
    voucher_url: stored.path ?? '',
    created_by: userId,
  });
  if (error) {
    console.error(error.message);
    return { error: 'invalid' as const };
  }
  return { error: null };
}

export async function removeContribution(
  supabase: SupabaseClient,
  contributionId: string,
  projectId: string,
) {
  const { data } = await supabase
    .from('project_contributions')
    .select('voucher_url')
    .eq('id', contributionId)
    .eq('project_id', projectId)
    .maybeSingle();
  const stored = data?.voucher_url as string | undefined;
  if (stored && !isHttpUrl(stored)) {
    await supabase.storage.from('vouchers').remove([stored]);
  }
  const { error } = await supabase
    .from('project_contributions')
    .delete()
    .eq('id', contributionId)
    .eq('project_id', projectId);
  return error ? { error: 'invalid' as const } : { error: null };
}

export function fundingByCurrency(
  contributions: Pick<Contribution, 'amount' | 'currency'>[],
  expenses: { amount: number | string; currency: string }[],
) {
  const map = new Map<string, { funded: number; spent: number }>();
  for (const row of contributions) {
    const currency = row.currency || 'THB';
    const current = map.get(currency) ?? { funded: 0, spent: 0 };
    current.funded += Number(row.amount) || 0;
    map.set(currency, current);
  }
  for (const row of expenses) {
    const currency = row.currency || 'THB';
    const current = map.get(currency) ?? { funded: 0, spent: 0 };
    current.spent += Number(row.amount) || 0;
    map.set(currency, current);
  }
  return [...map.entries()].map(([currency, totals]) => ({
    currency,
    funded: totals.funded,
    spent: totals.spent,
    remaining: totals.funded - totals.spent,
  }));
}

export type FundPieSlice = {
  key: string;
  label: string;
  amount: number;
  percent: number;
  tone: number;
};

export type FundPie = {
  currency: string;
  funded: number;
  slices: FundPieSlice[];
};

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

export function donutPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const span = end - start;
  if (span >= 359.99) {
    return '';
  }
  const o1 = polar(cx, cy, outer, start);
  const o2 = polar(cx, cy, outer, end);
  const i1 = polar(cx, cy, inner, end);
  const i2 = polar(cx, cy, inner, start);
  const large = span > 180 ? 1 : 0;
  return `M ${o1.x.toFixed(3)} ${o1.y.toFixed(3)} A ${outer} ${outer} 0 ${large} 1 ${o2.x.toFixed(3)} ${o2.y.toFixed(3)} L ${i1.x.toFixed(3)} ${i1.y.toFixed(3)} A ${inner} ${inner} 0 ${large} 0 ${i2.x.toFixed(3)} ${i2.y.toFixed(3)} Z`;
}

export function fundingPies(
  contributions: Pick<Contribution, 'member_email' | 'amount' | 'currency'>[],
): FundPie[] {
  const byCurrency = new Map<string, Map<string, number>>();
  for (const row of contributions) {
    const currency = row.currency || 'THB';
    const members = byCurrency.get(currency) ?? new Map<string, number>();
    members.set(row.member_email, (members.get(row.member_email) ?? 0) + (Number(row.amount) || 0));
    byCurrency.set(currency, members);
  }

  return [...byCurrency.entries()].map(([currency, members]) => {
    const funded = [...members.values()].reduce((sum, amount) => sum + amount, 0);
    const slices = [...members.entries()]
      .map(([email, amount]) => ({ email, amount }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount || a.email.localeCompare(b.email))
      .map((row, index) => ({
        key: row.email,
        label: row.email,
        amount: row.amount,
        percent: funded > 0 ? (row.amount / funded) * 100 : 0,
        tone: index % 8,
      }));
    return { currency, funded, slices };
  });
}

export function remainingLabel(
  projectId: string,
  contributions: { project_id: string; amount: number | string; currency: string }[],
  expenses: { project_id: string | null; amount: number | string; currency: string; kind?: string }[],
) {
  const funding = fundingByCurrency(
    contributions.filter((row) => row.project_id === projectId),
    expenses
      .filter((row) => row.project_id === projectId && (!row.kind || row.kind === 'expense'))
      .map((row) => ({ amount: row.amount, currency: row.currency })),
  );
  if (funding.length === 0) return 'No team funding';
  return funding.map((row) => `${money(row.remaining, row.currency)} left`).join(' · ');
}

export type FundTx = {
  id: string;
  kind: 'in' | 'out';
  date: string;
  sort: string;
  title: string;
  detail: string;
  amount: number;
  currency: string;
  voucher_url: string;
  delete?: { intent: string; id: string };
};

export function fundTransactions(
  contributions: Contribution[],
  expenses: {
    id: string;
    amount: number | string;
    currency: string;
    occurred_on: string;
    created_at: string;
    category: string;
    notes: string;
    voucher_url?: string;
  }[],
): FundTx[] {
  const incoming: FundTx[] = contributions.map((row) => ({
    id: `in-${row.id}`,
    kind: 'in',
    date: row.occurred_on,
    sort: `${row.occurred_on}T${row.created_at}`,
    title: row.member_email,
    detail: row.notes || 'Contribution',
    amount: Number(row.amount) || 0,
    currency: row.currency || 'THB',
    voucher_url: row.voucher_url || '',
    delete: { intent: 'delete-contribution', id: row.id },
  }));
  const outgoing: FundTx[] = expenses.map((row) => ({
    id: `out-${row.id}`,
    kind: 'out',
    date: row.occurred_on,
    sort: `${row.occurred_on}T${row.created_at}`,
    title: row.category || 'Expense',
    detail: row.notes || 'Paid from funding',
    amount: Number(row.amount) || 0,
    currency: row.currency || 'THB',
    voucher_url: row.voucher_url || '',
    delete: { intent: 'delete-entry', id: row.id },
  }));
  return [...incoming, ...outgoing].sort((a, b) => b.sort.localeCompare(a.sort));
}

export function contributionsByMember(contributions: Contribution[]) {
  const map = new Map<string, Map<string, number>>();
  for (const row of contributions) {
    const byCurrency = map.get(row.member_email) ?? new Map<string, number>();
    const currency = row.currency || 'THB';
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + (Number(row.amount) || 0));
    map.set(row.member_email, byCurrency);
  }
  return [...map.entries()]
    .map(([email, byCurrency]) => ({
      email,
      totals: [...byCurrency.entries()].map(([currency, amount]) => ({ currency, amount })),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}
