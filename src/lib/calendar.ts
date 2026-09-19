import { money, type LedgerEntry } from './ledger';
import type { Contribution } from './funding';
import type { Milestone } from './milestones';

export type CalKind = 'milestone' | 'income' | 'expense' | 'contribution' | 'start';

export type CalEvent = {
  date: string;
  kind: CalKind;
  title: string;
  detail: string;
};

export type CalCell = {
  iso: string;
  day: number;
  inMonth: boolean;
  today: boolean;
  events: CalEvent[];
};

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function parseMonth(value: string | null, fallback: Date) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7)) - 1;
    if (year >= 2000 && year <= 2100 && month >= 0 && month <= 11) {
      return new Date(year, month, 1);
    }
  }
  return new Date(fallback.getFullYear(), fallback.getMonth(), 1);
}

export function shiftMonth(cursor: Date, delta: number) {
  return monthKey(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
}

export function projectEvents(
  startedOn: string | null,
  milestones: Milestone[],
  contributions: Pick<Contribution, 'amount' | 'currency' | 'occurred_on' | 'member_email' | 'notes'>[],
  entries: Pick<LedgerEntry, 'kind' | 'amount' | 'currency' | 'occurred_on' | 'category' | 'notes'>[],
  includeMoney = true,
): CalEvent[] {
  const events: CalEvent[] = [];
  if (startedOn) {
    events.push({ date: startedOn, kind: 'start', title: 'Start', detail: 'Project started' });
  }
  for (const row of milestones) {
    if (!row.estimated_on) continue;
    const state = row.status === 'current' ? 'Current stage' : row.status === 'done' ? 'Done' : 'Estimated';
    events.push({
      date: row.estimated_on,
      kind: 'milestone',
      title: row.title,
      detail: `${state} milestone`,
    });
  }
  if (includeMoney) {
  for (const row of contributions) {
    events.push({
      date: row.occurred_on,
      kind: 'contribution',
      title: `+ ${money(row.amount, row.currency)}`,
      detail: row.notes || row.member_email,
    });
  }
  for (const row of entries) {
    events.push({
      date: row.occurred_on,
      kind: row.kind,
      title: `${row.kind === 'income' ? '+' : '−'} ${money(row.amount, row.currency)}`,
      detail: row.category || row.notes || (row.kind === 'income' ? 'Income' : 'Expense'),
    });
  }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function monthGrid(cursor: Date, events: CalEvent[], todayIso: string): CalCell[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const pad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDate = new Map<string, CalEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.date) ?? [];
    list.push(event);
    byDate.set(event.date, list);
  }

  const cells: CalCell[] = [];
  for (let i = 0; i < pad; i++) {
    const date = new Date(year, month, 1 - (pad - i));
    const iso = isoDate(date);
    cells.push({
      iso,
      day: date.getDate(),
      inMonth: false,
      today: iso === todayIso,
      events: byDate.get(iso) ?? [],
    });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = isoDate(new Date(year, month, day));
    cells.push({
      iso,
      day,
      inMonth: true,
      today: iso === todayIso,
      events: byDate.get(iso) ?? [],
    });
  }
  while (cells.length % 7 !== 0) {
    const extra = cells.length - pad - daysInMonth + 1;
    const date = new Date(year, month + 1, extra);
    const iso = isoDate(date);
    cells.push({
      iso,
      day: date.getDate(),
      inMonth: false,
      today: iso === todayIso,
      events: byDate.get(iso) ?? [],
    });
  }
  return cells;
}
