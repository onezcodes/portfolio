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
  priority: TaskPriority;
  created_by_email: string;
  completed_at: string | null;
  start_on: string | null;
  recur: string;
  recur_next_id: string | null;
  kind?: 'task' | 'bug';
  created_at: string;
  updated_at: string;
};

export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number] | '';

export function isTaskPriority(value: string): value is TaskPriority {
  return value === '' || (TASK_PRIORITIES as readonly string[]).includes(value);
}

export function priorityLabel(priority: TaskPriority | string | null | undefined) {
  if (priority === 'high') return 'High';
  if (priority === 'medium') return 'Medium';
  if (priority === 'low') return 'Low';
  return 'No priority';
}

/** Higher number sorts first. */
export function priorityRank(priority: TaskPriority | string | null | undefined) {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  if (priority === 'low') return 1;
  return 0;
}

export type TaskSubtask = {
  id: string;
  task_id: string;
  project_id: string;
  title: string;
  done: boolean;
  sort_order: number;
  /** When set, only this person (or a planner) may check the item. */
  assignee_email?: string;
  created_at: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  project_id: string;
  author_email: string;
  body: string;
  created_at: string;
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

// Only fields present in the form are written, so a form that edits a few fields
// (the task panel, quick add) never clears the others.
function payloadFromForm(form: FormData) {
  const title = String(form.get('title') ?? '').trim();
  if (!title) return null;
  const payload: {
    title: string;
    notes?: string;
    milestone_id?: string | null;
    assignee_email?: string;
    due_on?: string | null;
    link_url?: string;
    priority?: TaskPriority;
    start_on?: string | null;
    recur?: string;
  } = { title };
  if (form.has('notes')) payload.notes = String(form.get('notes') ?? '').trim();
  if (form.has('milestone_id')) payload.milestone_id = String(form.get('milestone_id') ?? '').trim() || null;
  if (form.has('assignee_email')) payload.assignee_email = String(form.get('assignee_email') ?? '').trim().toLowerCase();
  if (form.has('due_on')) payload.due_on = String(form.get('due_on') ?? '').trim() || null;
  if (form.has('link_url')) {
    const link = parseHttpUrl(String(form.get('link_url') ?? ''));
    if ('error' in link) return { error: 'invalid' as const };
    payload.link_url = link.url;
  }
  if (form.has('start_on')) payload.start_on = String(form.get('start_on') ?? '').trim() || null;
  if (form.has('recur')) {
    const recur = String(form.get('recur') ?? '');
    if (!['', 'daily', 'weekly', 'monthly'].includes(recur)) return { error: 'invalid' as const };
    payload.recur = recur;
  }
  // A start date after the due date is a typo; keep them in order.
  if (payload.start_on && payload.due_on && payload.start_on > payload.due_on) payload.start_on = payload.due_on;
  if (form.has('priority')) {
    const priority = String(form.get('priority') ?? '');
    if (!isTaskPriority(priority)) return { error: 'invalid' as const };
    payload.priority = priority;
  }
  return payload;
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
  actorEmail = '',
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
      created_by_email: actorEmail,
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
    assignee_email: payload.assignee_email ?? '',
    due_on: payload.due_on ?? null,
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
    .select('image_url, assignee_email, due_on')
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
    assignee_email: payload.assignee_email ?? String(current?.assignee_email ?? '').trim().toLowerCase(),
    due_on: payload.due_on !== undefined ? payload.due_on : ((current?.due_on as string | null) ?? null),
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

/** Open checklist items that must be checked by their assignee (QA sign-off). */
export async function openAssignedSubtasks(supabase: SupabaseClient, taskId: string) {
  const { data } = await supabase
    .from('task_subtasks')
    .select('id, title, assignee_email, done')
    .eq('task_id', taskId)
    .neq('assignee_email', '')
    .eq('done', false);
  return (data ?? []) as Pick<TaskSubtask, 'id' | 'title' | 'assignee_email' | 'done'>[];
}

export async function setTaskStatus(supabase: SupabaseClient, projectId: string, taskId: string, status: TaskStatus) {
  if (!taskId || !isTaskStatus(status)) return { error: 'invalid' as const };
  if (status === 'done') {
    const pending = await openAssignedSubtasks(supabase, taskId);
    if (pending.length > 0) return { error: 'qa-pending' as const, pending };
  }
  const { error } = await supabase.from('project_tasks').update({ status }).eq('id', taskId).eq('project_id', projectId);
  if (error) {
    if (/qa sign-off required/i.test(error.message)) return { error: 'qa-pending' as const };
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

// ---------- Subtasks ----------

function checklistTitles(form: FormData, key = 'subtask_title') {
  return String(form.get(key) ?? '')
    .split('\n')
    .map((line) => line.replace(/^[-*•\s]+/, '').trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 40);
}

/** Project members who have the QA role (leads are not implied). */
export async function qaEmailsForProject(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase.from('project_members').select('email, roles').eq('project_id', projectId);
  return [...new Set(
    ((data ?? []) as { email: string; roles: string[] | null }[])
      .filter((row) => Array.isArray(row.roles) && row.roles.includes('qa'))
      .map((row) => row.email.trim().toLowerCase())
      .filter(Boolean),
  )].sort();
}

async function nextSubtaskSort(supabase: SupabaseClient, taskId: string) {
  const { data: last } = await supabase
    .from('task_subtasks')
    .select('sort_order')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (last?.sort_order ?? -1) + 1;
}

export async function addSubtask(supabase: SupabaseClient, form: FormData) {
  const taskId = String(form.get('task_id') ?? '');
  const title = String(form.get('subtask_title') ?? '').trim().slice(0, 300);
  if (!taskId || !title) return { error: 'invalid' as const };
  const sortOrder = await nextSubtaskSort(supabase, taskId);
  // project_id is filled from the task by a database trigger.
  const { error } = await supabase
    .from('task_subtasks')
    .insert({ task_id: taskId, title, sort_order: sortOrder });
  if (error) {
    console.error('subtask add failed', error.message);
    return { error: 'invalid' as const };
  }
  return { error: null, title };
}

/**
 * Admin/planner checklist: each title is duplicated once per QA member so every
 * assigned QA must check their own flag before the task can be completed.
 */
export async function addQaChecklist(supabase: SupabaseClient, form: FormData, projectId: string) {
  const taskId = String(form.get('task_id') ?? '');
  const titles = checklistTitles(form);
  if (!taskId || titles.length === 0) return { error: 'invalid' as const, count: 0, assignees: [] as string[] };
  const qas = await qaEmailsForProject(supabase, projectId);
  if (qas.length === 0) return { error: 'no-qa' as const, count: 0, assignees: [] as string[] };
  const base = await nextSubtaskSort(supabase, taskId);
  const rows: { task_id: string; title: string; sort_order: number; assignee_email: string }[] = [];
  let order = base;
  for (const title of titles) {
    for (const email of qas) {
      rows.push({ task_id: taskId, title, sort_order: order++, assignee_email: email });
    }
  }
  const { error } = await supabase.from('task_subtasks').insert(rows);
  if (error) {
    console.error('qa checklist add failed', error.message);
    return { error: 'invalid' as const, count: 0, assignees: [] as string[] };
  }
  return { error: null, count: rows.length, assignees: qas, titles };
}

export async function toggleSubtask(
  supabase: SupabaseClient,
  form: FormData,
  projectId: string,
  actorEmail: string,
  canPlan: boolean,
) {
  const subtaskId = String(form.get('subtask_id') ?? '');
  if (!subtaskId) return { error: 'invalid' as const };
  const done = String(form.get('done') ?? '') === '1';
  const { data: current } = await supabase
    .from('task_subtasks')
    .select('task_id, title, assignee_email, done')
    .eq('id', subtaskId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (!current) return { error: 'invalid' as const };
  const assignee = String(current.assignee_email ?? '');
  if (assignee && assignee !== actorEmail && !canPlan) return { error: 'forbidden' as const };
  const { data, error } = await supabase
    .from('task_subtasks')
    .update({ done })
    .eq('id', subtaskId)
    .eq('project_id', projectId)
    .select('task_id, title, assignee_email')
    .maybeSingle();
  return error
    ? { error: 'invalid' as const }
    : {
        error: null,
        done,
        taskId: String(data?.task_id ?? ''),
        title: String(data?.title ?? ''),
        assignee_email: String(data?.assignee_email ?? ''),
      };
}

export async function removeSubtask(
  supabase: SupabaseClient,
  form: FormData,
  projectId: string,
  canPlan: boolean,
) {
  const subtaskId = String(form.get('subtask_id') ?? '');
  if (!subtaskId) return { error: 'invalid' as const };
  const { data: current } = await supabase
    .from('task_subtasks')
    .select('assignee_email')
    .eq('id', subtaskId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (!current) return { error: 'invalid' as const };
  if (String(current.assignee_email ?? '') && !canPlan) return { error: 'forbidden' as const };
  const { error } = await supabase.from('task_subtasks').delete().eq('id', subtaskId).eq('project_id', projectId);
  return error ? { error: 'invalid' as const } : { error: null };
}

// ---------- Comments ----------

export async function addComment(supabase: SupabaseClient, form: FormData, authorEmail: string, mentions: string[] = []) {
  const taskId = String(form.get('task_id') ?? '');
  const body = String(form.get('body') ?? '').trim().slice(0, 2000);
  const file = form.get('file');
  const hasFile = file instanceof File && file.size > 0;
  if (!taskId || !authorEmail || (!body && !hasFile)) return { error: 'invalid' as const };
  const row: Record<string, unknown> = {
    task_id: taskId,
    author_email: authorEmail,
    body: body || (hasFile ? `Attached ${file.name.slice(0, 200)}` : ''),
  };
  if (mentions.length > 0) row.mentions = mentions;
  const { data, error } = await supabase.from('task_comments').insert(row).select('id, body').single();
  if (error) {
    console.error('comment add failed', error.message);
    return { error: 'invalid' as const };
  }
  return { error: null, body: String(data.body ?? body), id: String(data.id) };
}

export async function removeComment(supabase: SupabaseClient, form: FormData, projectId: string) {
  const commentId = String(form.get('comment_id') ?? '');
  if (!commentId) return { error: 'invalid' as const };
  // RLS decides: authors remove their own; leads/managers remove any.
  const { error, count } = await supabase
    .from('task_comments')
    .delete({ count: 'exact' })
    .eq('id', commentId)
    .eq('project_id', projectId);
  return error || !count ? { error: 'forbidden' as const } : { error: null };
}

// ---------- Reads ----------

/** Subtask progress and comment counts for a set of tasks. */
export async function taskCounts(supabase: SupabaseClient, projectIds: string[]) {
  const counts = new Map<string, { subtasks: number; subtasksDone: number; comments: number }>();
  if (projectIds.length === 0) return counts;
  const [subs, notes] = await Promise.all([
    supabase.from('task_subtasks').select('task_id, done').in('project_id', projectIds),
    supabase.from('task_comments').select('task_id').in('project_id', projectIds),
  ]);
  const bump = (taskId: string) => {
    const row = counts.get(taskId) ?? { subtasks: 0, subtasksDone: 0, comments: 0 };
    counts.set(taskId, row);
    return row;
  };
  for (const row of (subs.data ?? []) as { task_id: string; done: boolean }[]) {
    const tally = bump(row.task_id);
    tally.subtasks += 1;
    if (row.done) tally.subtasksDone += 1;
  }
  for (const row of (notes.data ?? []) as { task_id: string }[]) bump(row.task_id).comments += 1;
  return counts;
}

export async function taskDetail(supabase: SupabaseClient, projectId: string, taskId: string) {
  const [task, subtasks, comments, followers, attachments, events, waitsOn, blocks] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('id', taskId).eq('project_id', projectId).maybeSingle(),
    supabase.from('task_subtasks').select('*').eq('task_id', taskId).order('sort_order'),
    supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at'),
    supabase.from('task_followers').select('email').eq('task_id', taskId).order('created_at'),
    supabase.from('task_attachments').select('*').eq('task_id', taskId).order('created_at'),
    supabase.from('task_events').select('id, task_id, actor_email, action, detail, created_at').eq('task_id', taskId).order('created_at'),
    supabase.from('task_dependencies').select('depends_on_id').eq('task_id', taskId),
    supabase.from('task_dependencies').select('task_id').eq('depends_on_id', taskId),
  ]);
  if (!task.data) return null;
  return {
    task: task.data as ProjectTask,
    subtasks: (subtasks.data ?? []) as TaskSubtask[],
    comments: (comments.data ?? []) as TaskComment[],
    followers: (followers.data ?? []).map((row) => String(row.email)),
    attachments: (attachments.data ?? []) as import('./taskCollab').TaskAttachment[],
    events: (events.data ?? []) as import('./taskCollab').TaskEvent[],
    waitsOn: (waitsOn.data ?? []).map((row) => String(row.depends_on_id)),
    blocks: (blocks.data ?? []).map((row) => String(row.task_id)),
  };
}

/** Sort for task lists: open before done, late and high priority first, then by due date. */
export function sortTaskQueue<T extends Pick<ProjectTask, 'status' | 'due_on' | 'priority' | 'sort_order' | 'title'>>(
  rows: T[],
) {
  return [...rows].sort((a, b) => {
    const doneA = a.status === 'done' ? 1 : 0;
    const doneB = b.status === 'done' ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    if (a.due_on && b.due_on && a.due_on !== b.due_on) return a.due_on.localeCompare(b.due_on);
    if (a.due_on && !b.due_on) return -1;
    if (!a.due_on && b.due_on) return 1;
    const pr = priorityRank(b.priority) - priorityRank(a.priority);
    if (pr) return pr;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.title.localeCompare(b.title);
  });
}
