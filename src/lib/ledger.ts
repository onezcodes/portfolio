export type ProjectStatus = 'active' | 'paused' | 'done';
export type LedgerKind = 'income' | 'expense';
export type MemberRole = 'super_admin' | 'member';

export type Project = {
  id: string;
  name: string;
  client: string;
  status: ProjectStatus;
  notes: string;
  started_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  bank_name: string;
  account_number: string;
  qr_url: string;
  logo_url: string;
  website_url: string;
  staging_url: string;
  admin_url: string;
  repo_url: string;
  slack_url: string;
  meeting_url: string;
  login_url: string;
  login_username: string;
  login_email: string;
  login_password_enc: string;
  extra_links: unknown;
};

export type LedgerEntry = {
  id: string;
  project_id: string | null;
  kind: LedgerKind;
  amount: number | string;
  currency: string;
  occurred_on: string;
  category: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  voucher_url: string;
};

export type TeamMember = {
  email: string;
  role: MemberRole;
  display_name: string;
  job_title: string;
  phone: string;
  avatar_url: string;
  created_at: string;
  last_seen_at: string | null;
};

export function money(amount: number | string, currency = 'THB') {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat('en-TH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function asAmount(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export function totalsByCurrency(entries: Pick<LedgerEntry, 'kind' | 'amount' | 'currency'>[]) {
  const map = new Map<string, { income: number; expense: number }>();
  for (const entry of entries) {
    const currency = entry.currency || 'THB';
    const current = map.get(currency) ?? { income: 0, expense: 0 };
    const amount = Number(entry.amount) || 0;
    if (entry.kind === 'income') current.income += amount;
    else current.expense += amount;
    map.set(currency, current);
  }
  return [...map.entries()].map(([currency, totals]) => ({
    currency,
    income: totals.income,
    expense: totals.expense,
    profit: totals.income - totals.expense,
  }));
}

export type MonthPoint = {
  key: string;
  label: string;
  income: number;
  expense: number;
};

export type IncomeExpenseChart = {
  currency: string;
  income: number;
  expense: number;
  profit: number;
  months: MonthPoint[];
};

function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en', { month: 'short' });
}

function lastMonths(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    const key = monthKeyFromDate(date);
    return { key, label: monthLabel(key) };
  });
}

export function incomeExpenseCharts(
  entries: Pick<LedgerEntry, 'kind' | 'amount' | 'currency' | 'occurred_on'>[],
): IncomeExpenseChart[] {
  const totals = totalsByCurrency(entries);
  if (totals.length === 0) return [];
  const months = lastMonths(6);

  return totals.map((total) => {
    const points = months.map((month) => {
      const bucket = { income: 0, expense: 0 };
      for (const entry of entries) {
        if ((entry.currency || 'THB') !== total.currency) continue;
        if ((entry.occurred_on || '').slice(0, 7) !== month.key) continue;
        const amount = Number(entry.amount) || 0;
        if (entry.kind === 'income') bucket.income += amount;
        else bucket.expense += amount;
      }
      return { ...month, ...bucket };
    });
    return { ...total, months: points };
  });
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function emailFromForm(value: FormDataEntryValue | null) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
