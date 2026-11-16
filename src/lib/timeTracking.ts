import type { SupabaseClient } from '@supabase/supabase-js';

/* Time logs per task. One running timer per person (enforced by a unique index);
 * stopping a timer fills in its minutes in the database. */

export type TimeEntry = {
  id: string;
  task_id: string;
  project_id: string;
  email: string;
  started_at: string;
  ended_at: string | null;
  minutes: number;
  note: string;
};

export type RunningTimer = TimeEntry & { project_tasks: { title: string } | null };

export function formatMinutes(total: number) {
  if (!total) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** "1h 30m", "90", "1.5h", "45m" → minutes. */
export function parseDuration(raw: string) {
  const text = raw.trim().toLowerCase();
  if (!text) return 0;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * (Number(text) <= 12 ? 60 : 1));
  let total = 0;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const mins = text.match(/(\d+)\s*m/);
  if (hours) total += Math.round(Number(hours[1]) * 60);
  if (mins) total += Number(mins[1]);
  return Math.min(total, 1440);
}

export async function runningTimer(supabase: SupabaseClient, email: string) {
  const { data, error } = await supabase
    .from('task_time_entries')
    .select('*, project_tasks(title)')
    .eq('email', email)
    .is('ended_at', null)
    .maybeSingle();
  return error ? null : ((data as RunningTimer | null) ?? null);
}

/** Start a timer on a task, stopping any other running timer first. */
export async function startTimer(supabase: SupabaseClient, taskId: string, email: string) {
  await stopTimer(supabase, email);
  const { error } = await supabase.from('task_time_entries').insert({ task_id: taskId, email });
  if (error) console.error('timer start failed', error.message);
  return error ? { error: 'invalid' as const } : { error: null };
}

export async function stopTimer(supabase: SupabaseClient, email: string) {
  const { data, error } = await supabase
    .from('task_time_entries')
    .update({ ended_at: new Date().toISOString() })
    .eq('email', email)
    .is('ended_at', null)
    .select('task_id, minutes');
  if (error) return { error: 'invalid' as const, taskId: '', minutes: 0 };
  const row = (data ?? [])[0] as { task_id: string; minutes: number } | undefined;
  return { error: null, taskId: row?.task_id ?? '', minutes: row?.minutes ?? 0 };
}

export async function logTime(supabase: SupabaseClient, form: FormData, email: string) {
  const taskId = String(form.get('task_id') ?? '');
  const minutes = parseDuration(String(form.get('duration') ?? ''));
  const day = String(form.get('day') ?? '').trim();
  const note = String(form.get('note') ?? '').trim().slice(0, 300);
  if (!taskId || minutes <= 0) return { error: 'invalid' as const, minutes: 0 };
  const started = day ? new Date(`${day}T09:00:00Z`) : new Date(Date.now() - minutes * 60_000);
  const ended = new Date(started.getTime() + minutes * 60_000);
  const { error } = await supabase.from('task_time_entries').insert({
    task_id: taskId,
    email,
    started_at: started.toISOString(),
    ended_at: ended.toISOString(),
    minutes,
    note,
  });
  return error ? { error: 'invalid' as const, minutes: 0 } : { error: null, minutes };
}

export async function removeTime(supabase: SupabaseClient, form: FormData, projectId: string) {
  const id = String(form.get('time_id') ?? '');
  const { error, count } = await supabase
    .from('task_time_entries')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('project_id', projectId);
  return error || !count ? { error: 'forbidden' as const } : { error: null };
}

export async function taskTime(supabase: SupabaseClient, taskId: string) {
  const { data } = await supabase
    .from('task_time_entries')
    .select('*')
    .eq('task_id', taskId)
    .order('started_at', { ascending: false });
  return (data ?? []) as TimeEntry[];
}

/** Minutes of a running entry so far, for display. */
export function liveMinutes(entry: Pick<TimeEntry, 'started_at' | 'ended_at' | 'minutes'>) {
  if (entry.ended_at) return entry.minutes;
  return Math.max(0, Math.round((Date.now() - Date.parse(entry.started_at)) / 60_000));
}
