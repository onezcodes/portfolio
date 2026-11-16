/**
 * Project health from data the team already records: late stages, late tasks,
 * funding left, and how long since the last check-in. No manual status reports.
 */
export type HealthLevel = 'green' | 'amber' | 'red' | 'idle';

export type Health = {
  level: HealthLevel;
  label: string;
  reasons: string[];
};

type StageLike = { status: string; estimated_on: string | null };
type TaskLike = { status: string; due_on: string | null };
type FundLike = { funded: number; remaining: number };

const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export function projectHealth(input: {
  status: string;
  today: string;
  stages: StageLike[];
  tasks: TaskLike[];
  /** ISO timestamp of the latest check-in, if any. */
  lastCheckin?: string | null;
  /** Funding per currency, when the viewer may see money. */
  funding?: FundLike[] | null;
}): Health {
  if (input.status !== 'active') {
    return { level: 'idle', label: input.status === 'done' ? 'Done' : 'Paused', reasons: [] };
  }
  const reasons: { text: string; weight: 1 | 2 }[] = [];

  // Current (or next unfinished) stage past its date
  const stage = input.stages.find((s) => s.status === 'current') ?? input.stages.find((s) => s.status !== 'done' && s.status !== 'skipped');
  if (stage?.estimated_on && stage.estimated_on < input.today) {
    const late = daysBetween(stage.estimated_on, input.today);
    reasons.push({ text: `Stage ${late} ${late === 1 ? 'day' : 'days'} late`, weight: late > 14 ? 2 : 1 });
  }

  const lateTasks = input.tasks.filter((t) => t.status !== 'done' && t.due_on && t.due_on < input.today).length;
  if (lateTasks > 0) reasons.push({ text: `${lateTasks} late ${lateTasks === 1 ? 'task' : 'tasks'}`, weight: lateTasks >= 3 ? 2 : 1 });

  const blocked = input.tasks.filter((t) => t.status === 'blocked').length;
  if (blocked > 0) reasons.push({ text: `${blocked} blocked`, weight: blocked >= 3 ? 2 : 1 });

  for (const fund of input.funding ?? []) {
    if (fund.funded <= 0) continue;
    if (fund.remaining < 0) reasons.push({ text: 'Funding overspent', weight: 2 });
    else if (fund.remaining < fund.funded * 0.1) reasons.push({ text: 'Under 10% funding left', weight: 1 });
  }

  if (input.lastCheckin) {
    const quiet = daysBetween(input.lastCheckin.slice(0, 10), input.today);
    if (quiet > 7) reasons.push({ text: `No check-in for ${quiet} days`, weight: quiet > 14 ? 2 : 1 });
  } else {
    reasons.push({ text: 'No check-in yet', weight: 1 });
  }

  const score = reasons.reduce((sum, r) => sum + r.weight, 0);
  const level: HealthLevel = reasons.some((r) => r.weight === 2) || score >= 3 ? 'red' : score > 0 ? 'amber' : 'green';
  return {
    level,
    label: level === 'green' ? 'On track' : level === 'amber' ? 'At risk' : 'Off track',
    reasons: reasons.map((r) => r.text),
  };
}
