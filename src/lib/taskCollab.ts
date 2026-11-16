import type { SupabaseClient } from '@supabase/supabase-js';
import type { TeamMember } from './ledger';

/* Task collaboration: followers, attachments, dependencies, activity, saved views,
 * @mentions, and the in-app inbox. Access is enforced by RLS (see the
 * 20261116150000_task_collab migration); these helpers only shape the writes. */

export const TASK_FILES_BUCKET = 'task-files';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const RECUR_OPTIONS = [
  { id: '', label: 'Does not repeat' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekly', label: 'Every week' },
  { id: 'monthly', label: 'Every month' },
] as const;
export type Recur = (typeof RECUR_OPTIONS)[number]['id'];

export function isRecur(value: string): value is Recur {
  return RECUR_OPTIONS.some((option) => option.id === value);
}

export function recurLabel(value: string) {
  return RECUR_OPTIONS.find((option) => option.id === value)?.label ?? 'Does not repeat';
}

export type TaskAttachment = {
  id: string;
  task_id: string;
  project_id: string;
  kind: 'file' | 'link';
  url: string;
  name: string;
  size_bytes: number;
  content_type: string;
  added_by: string;
  created_at: string;
};

export type TaskEvent = {
  id: string;
  task_id: string;
  actor_email: string;
  action: string;
  detail: string;
  created_at: string;
};

export type TaskDependency = { task_id: string; depends_on_id: string };
export type SavedView = { id: string; name: string; query: string; project_id: string | null };

export type TeamNotification = {
  id: string;
  recipient_email: string;
  actor_email: string;
  kind: string;
  project_id: string | null;
  task_id: string | null;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

// ---------- Followers ----------

export async function follow(supabase: SupabaseClient, taskId: string, email: string) {
  if (!taskId || !email) return;
  const { error } = await supabase.from('task_followers').upsert({ task_id: taskId, email }, { onConflict: 'task_id,email', ignoreDuplicates: true });
  if (error && error.code !== '42501') console.error('follow failed', error.message);
}

export async function unfollow(supabase: SupabaseClient, taskId: string, email: string) {
  const { error } = await supabase.from('task_followers').delete().eq('task_id', taskId).eq('email', email);
  return error ? { error: 'invalid' as const } : { error: null };
}

export async function followersOf(supabase: SupabaseClient, taskId: string) {
  const { data } = await supabase.from('task_followers').select('email').eq('task_id', taskId);
  return (data ?? []).map((row) => String(row.email));
}

// ---------- Attachments ----------

function safeFileName(name: string) {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').slice(-120);
  return cleaned || 'file';
}

export async function addFileAttachment(
  supabase: SupabaseClient,
  form: FormData,
  projectId: string,
  actorEmail: string,
) {
  const taskId = String(form.get('task_id') ?? '');
  const file = form.get('file');
  if (!taskId || !(file instanceof File) || file.size === 0) return { error: 'invalid' as const };
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: 'too-large-file' as const };
  const path = `${projectId}/${taskId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const upload = await supabase.storage.from(TASK_FILES_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upload.error) {
    console.error('attachment upload failed', upload.error.message);
    return { error: 'file-type' as const };
  }
  const { error } = await supabase.from('task_attachments').insert({
    task_id: taskId,
    kind: 'file',
    url: path,
    name: file.name.slice(0, 300),
    size_bytes: file.size,
    content_type: file.type,
    added_by: actorEmail,
  });
  if (error) {
    await supabase.storage.from(TASK_FILES_BUCKET).remove([path]);
    console.error('attachment save failed', error.message);
    return { error: 'invalid' as const };
  }
  return { error: null, name: file.name };
}

export async function addLinkAttachment(supabase: SupabaseClient, form: FormData, actorEmail: string) {
  const taskId = String(form.get('task_id') ?? '');
  const raw = String(form.get('link') ?? '').trim();
  const name = String(form.get('link_name') ?? '').trim().slice(0, 300);
  if (!taskId || !raw) return { error: 'invalid' as const };
  let href: string;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'invalid' as const };
    href = url.toString();
  } catch {
    return { error: 'invalid' as const };
  }
  const { error } = await supabase
    .from('task_attachments')
    .insert({ task_id: taskId, kind: 'link', url: href, name: name || href.replace(/^https?:\/\//, ''), added_by: actorEmail });
  return error ? { error: 'invalid' as const } : { error: null, name: name || href };
}

export async function removeAttachment(supabase: SupabaseClient, form: FormData, projectId: string) {
  const id = String(form.get('attachment_id') ?? '');
  if (!id) return { error: 'invalid' as const };
  const { data: row } = await supabase
    .from('task_attachments')
    .select('kind, url')
    .eq('id', id)
    .eq('project_id', projectId)
    .maybeSingle();
  const { error, count } = await supabase
    .from('task_attachments')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('project_id', projectId);
  if (error || !count) return { error: 'forbidden' as const };
  if (row?.kind === 'file') await supabase.storage.from(TASK_FILES_BUCKET).remove([String(row.url)]);
  return { error: null };
}

/** Signed download links for file attachments (1 hour). */
export async function attachmentHrefs(supabase: SupabaseClient, rows: TaskAttachment[]) {
  const hrefs = new Map<string, string>();
  for (const row of rows) if (row.kind === 'link') hrefs.set(row.id, row.url);
  const files = rows.filter((row) => row.kind === 'file');
  if (files.length === 0) return hrefs;
  const { data } = await supabase.storage.from(TASK_FILES_BUCKET).createSignedUrls(
    files.map((row) => row.url),
    60 * 60,
  );
  for (const item of data ?? []) {
    const row = files.find((file) => file.url === item.path);
    if (row && item.signedUrl) hrefs.set(row.id, item.signedUrl);
  }
  return hrefs;
}

export function formatBytes(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- Dependencies ----------

export async function addDependency(supabase: SupabaseClient, form: FormData) {
  const taskId = String(form.get('task_id') ?? '');
  const dependsOn = String(form.get('depends_on_id') ?? '');
  if (!taskId || !dependsOn || taskId === dependsOn) return { error: 'invalid' as const };
  const { error } = await supabase.from('task_dependencies').insert({ task_id: taskId, depends_on_id: dependsOn });
  if (error) {
    console.error('dependency add failed', error.message);
    return { error: error.message.includes('depend on each other') ? ('dependency-loop' as const) : ('invalid' as const) };
  }
  return { error: null };
}

export async function removeDependency(supabase: SupabaseClient, form: FormData, projectId: string) {
  const taskId = String(form.get('task_id') ?? '');
  const dependsOn = String(form.get('depends_on_id') ?? '');
  const { error } = await supabase
    .from('task_dependencies')
    .delete()
    .eq('task_id', taskId)
    .eq('depends_on_id', dependsOn)
    .eq('project_id', projectId);
  return error ? { error: 'invalid' as const } : { error: null };
}

export async function projectDependencies(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase.from('task_dependencies').select('task_id, depends_on_id').eq('project_id', projectId);
  return (data ?? []) as TaskDependency[];
}

// ---------- Activity ----------

export async function logTaskEvent(
  supabase: SupabaseClient,
  taskId: string,
  actorEmail: string,
  action: string,
  detail = '',
) {
  if (!taskId || !actorEmail) return;
  const { error } = await supabase
    .from('task_events')
    .insert({ task_id: taskId, actor_email: actorEmail, action, detail: detail.slice(0, 400) });
  if (error && error.code !== '42501') console.error('task event failed', error.message);
}

const EVENT_COPY: Record<string, (detail: string, name: (email: string) => string) => string> = {
  created: (d) => (d ? `created this task (${d})` : 'created this task'),
  status: (d) =>
    d === 'done' ? 'marked this complete' : d === 'todo' ? 'moved this to To do' : `moved this to ${d === 'doing' ? 'Doing' : 'Blocked'}`,
  assigned: (d, name) => (d ? `assigned this to ${name(d)}` : 'removed the assignee'),
  due: (d) => (d ? `set the due date to ${prettyDay(d)}` : 'removed the due date'),
  start: (d) => (d ? `set the start date to ${prettyDay(d)}` : 'removed the start date'),
  priority: (d) => (d ? `set priority to ${d[0].toUpperCase()}${d.slice(1)}` : 'cleared the priority'),
  renamed: (d) => `renamed this to “${d}”`,
  stage: (d) => (d ? `moved this to stage ${d}` : 'removed the stage'),
  recur: (d) => (d ? `set this to repeat ${d}` : 'stopped this repeating'),
  description: () => 'updated the description',
  subtask_add: (d) => `added subtask “${d}”`,
  subtask_done: (d) => `completed subtask “${d}”`,
  attach: (d) => `attached ${d}`,
  depend_add: (d) => `marked this as waiting on “${d}”`,
  depend_remove: (d) => `removed the wait on “${d}”`,
  follow: (d, name) => `added ${name(d)} as a follower`,
  time: (d) => `logged ${d}`,
};

export function describeEvent(event: TaskEvent, name: (email: string) => string) {
  const copy = EVENT_COPY[event.action];
  return copy ? copy(event.detail, name) : `${event.action} ${event.detail}`.trim();
}

function prettyDay(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- Saved views ----------

export async function savedViews(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase
    .from('task_saved_views')
    .select('id, name, query, project_id')
    .eq('project_id', projectId)
    .order('created_at');
  return (data ?? []) as SavedView[];
}

export async function saveView(supabase: SupabaseClient, form: FormData, projectId: string, ownerEmail: string) {
  const name = String(form.get('view_name') ?? '').trim().slice(0, 60);
  const query = String(form.get('view_query') ?? '').trim().slice(0, 500);
  if (!name) return { error: 'invalid' as const };
  const { error } = await supabase
    .from('task_saved_views')
    .insert({ owner_email: ownerEmail, project_id: projectId, name, query });
  return error ? { error: 'invalid' as const } : { error: null };
}

export async function deleteView(supabase: SupabaseClient, form: FormData) {
  const id = String(form.get('saved_view_id') ?? '');
  const { error } = await supabase.from('task_saved_views').delete().eq('id', id);
  return error ? { error: 'invalid' as const } : { error: null };
}

/** Keep only the task filter params a saved view may store. */
export const VIEW_PARAMS = ['view', 'who', 'sort', 'show', 'pri', 'due', 'kind'] as const;
export function viewQuery(params: URLSearchParams) {
  const out = new URLSearchParams();
  for (const key of VIEW_PARAMS) {
    const value = params.get(key);
    if (value) out.set(key, value);
  }
  return out.toString();
}

// ---------- @mentions ----------

/** Handle used for @mentions: the part of the email before the @. */
export function mentionHandle(email: string) {
  return email.split('@')[0].toLowerCase();
}

export function parseMentions(body: string, people: Pick<TeamMember, 'email'>[]) {
  const handles = new Set([...body.matchAll(/(^|[\s(])@([a-z0-9._+-]+)/gi)].map((m) => m[2].toLowerCase().replace(/[.]+$/, '')));
  return people.map((person) => person.email).filter((email) => handles.has(mentionHandle(email)));
}

/** Split a comment into text and mention parts for highlighting. */
export function commentParts(body: string, people: Pick<TeamMember, 'email' | 'display_name'>[]) {
  const byHandle = new Map(people.map((person) => [mentionHandle(person.email), person]));
  const parts: { text: string; mention?: string }[] = [];
  let last = 0;
  for (const match of body.matchAll(/(^|[\s(])@([a-z0-9._+-]+)/gi)) {
    const handle = match[2].toLowerCase().replace(/[.]+$/, '');
    const person = byHandle.get(handle);
    if (!person) continue;
    const start = (match.index ?? 0) + match[1].length;
    if (start > last) parts.push({ text: body.slice(last, start) });
    parts.push({ text: `@${person.display_name?.trim() || handle}`, mention: person.email });
    last = start + 1 + handle.length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts;
}

// ---------- Inbox ----------

export async function notify(
  supabase: SupabaseClient,
  actorEmail: string,
  recipients: string[],
  input: { kind: string; projectId: string; taskId?: string | null; title: string; body?: string },
) {
  const rows = [...new Set(recipients.map((email) => email.trim().toLowerCase()))]
    .filter((email) => email && email !== actorEmail)
    .map((email) => ({
      recipient_email: email,
      actor_email: actorEmail,
      kind: input.kind,
      project_id: input.projectId,
      task_id: input.taskId ?? null,
      title: input.title.slice(0, 300),
      body: (input.body ?? '').slice(0, 600),
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('team_notifications').insert(rows);
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') console.error('notify failed', error.message);
}

export async function unreadCount(supabase: SupabaseClient) {
  const { count, error } = await supabase
    .from('team_notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  return error ? 0 : (count ?? 0);
}

export function notificationCopy(item: TeamNotification, actorName: string) {
  switch (item.kind) {
    case 'assigned':
      return `${actorName} assigned you`;
    case 'mention':
      return `${actorName} mentioned you`;
    case 'comment':
      return `${actorName} commented`;
    case 'completed':
      return `${actorName} completed`;
    case 'follow':
      return `${actorName} added you as a follower`;
    case 'bug':
      return `${actorName} reported a bug`;
    case 'digest':
      return 'Your weekly summary';
    case 'due':
      return 'Due soon';
    case 'late':
      return 'Overdue';
    default:
      return actorName;
  }
}
