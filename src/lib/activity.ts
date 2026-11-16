import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Per-person activity by day, for the heatmap. Counts the person's actions in the
 * studio activity log plus minutes of logged time. Reads go through RLS, so a viewer
 * only counts activity they are allowed to see. Days are in the studio's time zone.
 */
export const STUDIO_TZ = 'Asia/Bangkok';
export const HEATMAP_WEEKS = 53;

export type DayActivity = { actions: number; minutes: number };

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: STUDIO_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const studioDay = (iso: string | Date) => dayFormat.format(typeof iso === 'string' ? new Date(iso) : iso);

export async function activityByDay(supabase: SupabaseClient, email: string, days = HEATMAP_WEEKS * 7 + 7) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data: events }, { data: time }] = await Promise.all([
    supabase.from('studio_events').select('created_at').eq('actor_email', email).gte('created_at', since).limit(10000),
    supabase.from('task_time_entries').select('started_at, minutes').eq('email', email).gte('started_at', since).limit(5000),
  ]);
  const map = new Map<string, DayActivity>();
  const bump = (day: string) => {
    const row = map.get(day) ?? { actions: 0, minutes: 0 };
    map.set(day, row);
    return row;
  };
  for (const row of (events ?? []) as { created_at: string }[]) bump(studioDay(row.created_at)).actions += 1;
  for (const row of (time ?? []) as { started_at: string; minutes: number }[]) bump(studioDay(row.started_at)).minutes += row.minutes || 0;
  return map;
}

/** One number per day for colouring: an action counts 1, half an hour of logged time counts 1. */
export function dayScore(day: DayActivity | undefined) {
  if (!day) return 0;
  return day.actions + Math.floor(day.minutes / 30);
}

export function heatLevel(score: number) {
  if (score <= 0) return 0;
  if (score <= 2) return 1;
  if (score <= 5) return 2;
  if (score <= 10) return 3;
  return 4;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Weeks (Monday first) ending with the week containing `today`. */
export function heatmapGrid(today: string, weeks = HEATMAP_WEEKS) {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(today, -weekday - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDays(start, w * 7 + d);
      return { day, future: day > today };
    }),
  );
}

export function activityStats(map: Map<string, DayActivity>, today: string, days = HEATMAP_WEEKS * 7) {
  let actions = 0;
  let minutes = 0;
  let activeDays = 0;
  let longest = 0;
  let run = 0;
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const row = map.get(day);
    const active = dayScore(row) > 0;
    if (row) {
      actions += row.actions;
      minutes += row.minutes;
      byWeekday[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7] += dayScore(row);
    }
    if (active) {
      activeDays += 1;
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  // Current streak counts back from today, or from yesterday if today has no activity yet.
  let current = 0;
  for (let i = dayScore(map.get(today)) > 0 ? 0 : 1; i < days; i++) {
    if (dayScore(map.get(addDays(today, -i))) > 0) current += 1;
    else break;
  }
  const names = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
  const top = byWeekday.indexOf(Math.max(...byWeekday));
  return {
    actions,
    minutes,
    activeDays,
    current,
    longest,
    busiest: byWeekday[top] > 0 ? names[top] : '',
  };
}
