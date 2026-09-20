import type { SupabaseClient } from '@supabase/supabase-js';
import { todayIso } from './ledger';
import { isHttpUrl, storedImageFromForm } from './vouchers';

export const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type ProjectTask = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  assignee_email: string;
  due_on: string | null;
  image_url: string;
  link_url: string;
  due_notice_on: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TaskWriteResult =
  | { error: 'invalid' | 'too-large' }
  | {
      error: null;
      id: string;
      title: string;
      assignee_email: string;
      due_on: string | null;
      previous_assignee?: string;
    };

const statuses = new Set<string>(TASK_STATUSES);

export function isTaskStatus(value: string): value is TaskStatus {
  return statuses.has(value);
}

export function taskStatusLabel(status: TaskStatus) {
  if (status === 'todo') return 'To do';
  if (status === 'doing') return 'Doing';
  if (status === 'blocked') return 'Blocked';
  return 'Done';
}

export function taskIsOpen(row: Pick<ProjectTask, 'status'>) {
  return row.status !== 'done';
}

export function taskIsLate(row: Pick<ProjectTask, 'status' | 'due_on'>, today = todayIso()) {
  return Boolean(row.due_on && taskIsOpen(row) && row.due_on < today);
}

export function taskIsBlocked(row: Pick<ProjectTask, 'status'>) {
  return row.status === 'blocked';
}

export function sortTasks<T extends Pick<ProjectTask, 'status' | 'due_on' | 'sort_order' | 'title'>>(rows: T[]) {
  const rank: Record<TaskStatus, number> = { blocked: 0, doing: 1, todo: 2, done: 3 };
  return [...rows].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.due_on && b.due_on && a.due_on !== b.due_on) return a.due_on.localeCompare(b.due_on);
    if (a.due_on && !b.due_on) return -1;
    if (!a.due_on && b.due_on) return 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.title.localeCompare(b.title);
  });
}

export function myOpenTasks(rows: ProjectTask[], email: string) {
  return sortTasks(rows.filter((row) => taskIsOpen(row) && row.assignee_email === email));
}

export function attentionTasks(rows: ProjectTask[], today = todayIso()) {
  return sortTasks(rows.filter((row) => taskIsBlocked(row) || taskIsLate(row, today)));
}

async function nextSort(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase.from('project_tasks').select('sort_order').eq('project_id', projectId);
  return (data ?? []).reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;
}

function parseHttpUrl(value: string) {
  const pasted = value.trim();
  if (!pasted) return { url: '' as const };
  try {
    const url = new URL(pasted);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'invalid' as const };
    return { url: pasted };
  } catch {
    return { error: 'invalid' as const };
  }
}

async function dropStoredImage(supabase: SupabaseClient, path: string) {
  if (path && !isHttpUrl(path)) {
    await supabase.storage.from('vouchers').remove([path]);
  }
}

function payloadFromForm(form: FormData) {
  const title = String(form.get('title') ?? '').trim();
  if (!title) return null;
  const milestoneRaw = String(form.get('milestone_id') ?? '').trim();
  const assignee = String(form.get('assignee_email') ?? '').trim().toLowerCase();
  const due = String(form.get('due_on') ?? '').trim();
  const link = parseHttpUrl(String(form.get('link_url') ?? ''));
  if ('error' in link) return { error: 'invalid' as const };
  return {
    title,
    notes: String(form.get('notes') ?? '').trim(),
    milestone_id: milestoneRaw || null,
    assignee_email: assignee,
    due_on: due || null,
    link_url: link.url,
  };
}

async function imageFromForm(
  form: FormData,
  supabase: SupabaseClient,
  userId: string | null,
  current = '',
) {
  if (form.get('clear_image') === '1') {
    await dropStoredImage(supabase, current);
    return { image_url: '' };
  }
  if (!userId) {
    const file = form.get('image');
    if (file instanceof File && file.size > 0) return { error: 'invalid' as const };
    const pasted = String(form.get('image_url') ?? '').trim();
    return pasted ? { error: 'invalid' as const } : { image_url: current };
  }
  const stored = await storedImageFromForm(form, supabase, userId, 'image', 'image_url');
  if ('error' in stored) return stored;
  if (stored.path === null) return { image_url: current };
  if (current && current !== stored.path) await dropStoredImage(supabase, current);
  return { image_url: stored.path };
}

export async function addTask(
  supabase: SupabaseClient,
  form: FormData,
  projectId: string,
  userId: string | null,
): Promise<TaskWriteResult> {
  const payload = payloadFromForm(form);
  if (!payload || 'error' in payload) return { error: 'invalid' };
  const image = await imageFromForm(form, supabase, userId);
  if ('error' in image) return image;
  const sort_order = await nextSort(supabase, projectId);
  const { data, error } = await supabase
    .from('project_tasks')
    .insert({
      project_id: projectId,
      ...payload,
      ...image,
      sort_order,
      status: 'todo',
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error(error?.message);
    return { error: 'invalid' };
  }
  return {
    error: null,
    id: data.id as string,
    title: payload.title,
    assignee_email: payload.assignee_email,
    due_on: payload.due_on,
  };
}

export async function updateTask(
  supabase: SupabaseClient,
  form: FormData,
  projectId: string,
  userId: string | null,
): Promise<TaskWriteResult> {
  const taskId = String(form.get('task_id') ?? '');
  const payload = payloadFromForm(form);
  if (!taskId || !payload || 'error' in payload) return { error: 'invalid' };
  const { data: current } = await supabase
    .from('project_tasks')
    .select('image_url, assignee_email')
    .eq('id', taskId)
    .eq('project_id', projectId)
    .maybeSingle();
  const image = await imageFromForm(form, supabase, userId, String(current?.image_url ?? ''));
  if ('error' in image) return image;
  const { error } = await supabase
    .from('project_tasks')
    .update({ ...payload, ...image })
    .eq('id', taskId)
    .eq('project_id', projectId);
  if (error) {
    console.error(error.message);
    return { error: 'invalid' };
  }
  return {
    error: null,
    id: taskId,
    title: payload.title,
    assignee_email: payload.assignee_email,
    due_on: payload.due_on,
    previous_assignee: String(current?.assignee_email ?? '').trim().toLowerCase(),
  };
}

export function shouldNotifyAssignee(
  assignee: string,
  actorEmail: string,
  previousAssignee = '',
) {
  const next = assignee.trim().toLowerCase();
  if (!next || next === actorEmail.trim().toLowerCase()) return false;
  return next !== previousAssignee.trim().toLowerCase();
}

export async function dueNoticeTasks(supabase: SupabaseClient, today = todayIso()) {
  const { data, error } = await supabase
    .from('project_tasks')
    .select('id, project_id, title, assignee_email, due_on, status, due_notice_on')
    .neq('status', 'done')
    .neq('assignee_email', '')
    .lte('due_on', today)
    .or(`due_notice_on.is.null,due_notice_on.lt.${today}`);
  if (error) {
    console.error(error.message);
    return [] as Pick<
      ProjectTask,
      'id' | 'project_id' | 'title' | 'assignee_email' | 'due_on' | 'status' | 'due_notice_on'
    >[];
  }
  return (data ?? []) as Pick<
    ProjectTask,
    'id' | 'project_id' | 'title' | 'assignee_email' | 'due_on' | 'status' | 'due_notice_on'
  >[];
}

export async function markTaskMail(supabase: SupabaseClient, taskId: string, today = todayIso()) {
  await supabase.from('project_tasks').update({ due_notice_on: today }).eq('id', taskId);
}

export async function setTaskStatus(supabase: SupabaseClient, projectId: string, taskId: string, status: TaskStatus) {
  if (!taskId || !isTaskStatus(status)) return { error: 'invalid' as const };
  const { error } = await supabase.from('project_tasks').update({ status }).eq('id', taskId).eq('project_id', projectId);
  if (error) {
    console.error(error.message);
    return { error: 'invalid' as const };
  }
  return { error: null };
}

export async function removeTask(supabase: SupabaseClient, taskId: string, projectId: string) {
  if (!taskId) return { error: 'invalid' as const };
  const { data: current } = await supabase
    .from('project_tasks')
    .select('image_url')
    .eq('id', taskId)
    .eq('project_id', projectId)
    .maybeSingle();
  const { error } = await supabase.from('project_tasks').delete().eq('id', taskId).eq('project_id', projectId);
  if (error) return { error: 'invalid' as const };
  await dropStoredImage(supabase, String(current?.image_url ?? ''));
  return { error: null };
}
