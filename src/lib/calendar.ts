import { money, type LedgerEntry } from './ledger';
import type { Contribution } from './funding';
import type { Milestone } from './milestones';
import { taskStatusLabel, type ProjectTask } from './tasks';

export type CalKind = 'milestone' | 'income' | 'expense' | 'contribution' | 'start' | 'task';

export type CalEvent = {
  date: string;
  kind: CalKind;
  title: string;
  detail: string;
  href?: string;
  project?: string;
  chip?: string;
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
  tasks: Pick<ProjectTask, 'title' | 'due_on' | 'status' | 'assignee_email'>[] = [],
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
  for (const row of tasks) {
    if (!row.due_on || row.status === 'done') continue;
    events.push({
      date: row.due_on,
      kind: 'task',
      title: row.title,
      detail: `${taskStatusLabel(row.status)}${row.assignee_email ? ` · ${row.assignee_email}` : ''}`,
    });
  }
  if (includeMoney) {
  for (const row of contributions) {
    if (!row.occurred_on) continue;
    events.push({
      date: row.occurred_on,
      kind: 'contribution',
      title: `+ ${money(row.amount, row.currency)}`,
      detail: row.notes || row.member_email,
    });
  }
  for (const row of entries) {
    if (!row.occurred_on) continue;
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

function eventTab(kind: CalKind, canFinance: boolean) {
  if (!canFinance) return 'schedule';
  if (kind === 'contribution') return 'funding';
  if (kind === 'income' || kind === 'expense') return 'ledger';
  return 'schedule';
}

export function studioEvents(
  projects: { id: string; name: string; started_on: string | null }[],
  milestones: Milestone[],
  contributions: (Pick<Contribution, 'amount' | 'currency' | 'occurred_on' | 'member_email' | 'notes'> & {
    project_id: string;
  })[],
  entries: Pick<LedgerEntry, 'kind' | 'amount' | 'currency' | 'occurred_on' | 'category' | 'notes' | 'project_id'>[],
  access: {
    canSchedule: (projectId: string) => boolean;
    canFinance: (projectId: string) => boolean;
    includeOverhead?: boolean;
  },
  tasks: (Pick<ProjectTask, 'title' | 'due_on' | 'status' | 'assignee_email'> & { project_id: string })[] = [],
): CalEvent[] {
  const events: CalEvent[] = [];

  for (const project of projects) {
    const schedule = access.canSchedule(project.id);
    const finance = access.canFinance(project.id);
    if (!schedule && !finance) continue;
    const rows = projectEvents(
      schedule ? project.started_on : null,
      schedule ? milestones.filter((row) => row.project_id === project.id) : [],
      finance ? contributions.filter((row) => row.project_id === project.id) : [],
      finance ? entries.filter((row) => row.project_id === project.id) : [],
      finance,
      schedule ? tasks.filter((row) => row.project_id === project.id) : [],
    );
    for (const event of rows) {
      events.push({
        ...event,
        project: project.name,
        href: `/team/projects/${project.id}?tab=${eventTab(event.kind, finance)}&month=${event.date.slice(0, 7)}#calendar`,
        title: `${project.name} · ${event.title}`,
        chip: event.title,
      });
    }
  }

  if (access.includeOverhead) {
    for (const row of entries) {
      if (row.project_id || !row.occurred_on) continue;
      events.push({
        date: row.occurred_on,
        kind: row.kind,
        title: `Overhead · ${row.kind === 'income' ? '+' : '−'} ${money(row.amount, row.currency)}`,
        detail: row.category || row.notes || (row.kind === 'income' ? 'Income' : 'Expense'),
        href: '/team/ledger',
        project: 'Overhead',
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
