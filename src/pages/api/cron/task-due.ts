import type { APIRoute } from 'astro';
import { sendMail, sendTaskDue, weeklyDigestMail, type DigestItem } from '../../../lib/mail';
import { todayIso } from '../../../lib/ledger';
import { dueNoticeTasks, markTaskMail, taskIsLate } from '../../../lib/tasks';
import { createServiceSupabase, siteUrl } from '../../../lib/supabase';

export const GET: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET?.trim();
  const auth = request.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createServiceSupabase();
  if (!supabase) {
    return new Response(JSON.stringify({ error: 'setup' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const today = todayIso();
  // Mondays: weekly digest (runs inside this daily job; the Hobby plan allows two crons).
  const digests = new Date().getUTCDay() === 1 || new URL(request.url).searchParams.get('digest') === '1'
    ? await sendWeeklyDigests(supabase, request, today)
    : 0;
  const tasks = await dueNoticeTasks(supabase, today);
  if (tasks.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, digests, today }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const projectIds = [...new Set(tasks.map((row) => row.project_id))];
  const { data: projects } = await supabase.from('projects').select('id, name').in('id', projectIds);
  const names = new Map((projects ?? []).map((row) => [row.id as string, String(row.name ?? 'Project')]));

  let sent = 0;
  for (const task of tasks) {
    if (!task.due_on || !task.assignee_email) continue;
    const href = `${siteUrl(request)}/team/projects/${task.project_id}?tab=tasks&task=${task.id}`;
    const mail = await sendTaskDue(
      task.assignee_email,
      names.get(task.project_id) ?? 'a project',
      task.title,
      task.due_on,
      taskIsLate(task, today),
      href,
    );
    // Inbox reminder as well (service role writes past RLS; actor is empty = automation).
    const { error: inboxError } = await supabase.from('team_notifications').insert({
      recipient_email: task.assignee_email,
      actor_email: '',
      kind: taskIsLate(task, today) ? 'late' : 'due',
      project_id: task.project_id,
      task_id: task.id,
      title: task.title,
      body: taskIsLate(task, today) ? `Was due ${task.due_on}` : 'Due today',
    });
    if (inboxError && inboxError.code !== '42P01' && inboxError.code !== 'PGRST205') {
      console.error('due inbox failed', inboxError.message);
    }
    if (!mail.error) {
      sent += 1;
      await markTaskMail(supabase, task.id, today);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, digests, checked: tasks.length, today }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST = GET;

type Supa = NonNullable<ReturnType<typeof createServiceSupabase>>;

async function sendWeeklyDigests(supabase: Supa, request: Request, today: string) {
  const base = siteUrl(request);
  const addDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const weekEnd = addDays(today, 6);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: members }, { data: open }, { data: done }, { data: projects }, { data: deps }, { data: unread }, { data: sentToday }] =
    await Promise.all([
      supabase.from('team_members').select('email, display_name'),
      supabase.from('project_tasks').select('id, project_id, title, assignee_email, due_on, status').neq('status', 'done'),
      supabase.from('project_tasks').select('assignee_email').eq('status', 'done').gte('completed_at', weekAgo),
      supabase.from('projects').select('id, name'),
      supabase.from('task_dependencies').select('task_id, depends_on_id'),
      supabase.from('team_notifications').select('recipient_email').is('read_at', null),
      supabase.from('team_notifications').select('recipient_email').eq('kind', 'digest').gte('created_at', `${today}T00:00:00Z`),
    ]);
  const names = new Map((projects ?? []).map((p) => [String(p.id), String(p.name)]));
  const openTasks = (open ?? []) as { id: string; project_id: string; title: string; assignee_email: string; due_on: string | null }[];
  const byId = new Map(openTasks.map((t) => [t.id, t]));
  const already = new Set((sentToday ?? []).map((r) => String(r.recipient_email)));
  const fmt = (iso: string | null) =>
    iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : null;
  const item = (t: { id: string; project_id: string; title: string; due_on: string | null }): DigestItem => ({
    title: t.title,
    project: names.get(t.project_id) ?? 'Project',
    due: fmt(t.due_on),
    href: `${base}/team/projects/${t.project_id}?tab=tasks&task=${t.id}`,
  });
  let sent = 0;
  for (const member of (members ?? []) as { email: string; display_name: string }[]) {
    if (already.has(member.email)) continue;
    const mine = openTasks.filter((t) => t.assignee_email === member.email);
    const mineIds = new Set(mine.map((t) => t.id));
    const overdue = mine.filter((t) => t.due_on && t.due_on < today).map(item);
    const dueThisWeek = mine.filter((t) => t.due_on && t.due_on >= today && t.due_on <= weekEnd).map(item);
    const waitingOnYou = ((deps ?? []) as { task_id: string; depends_on_id: string }[])
      .filter((d) => mineIds.has(d.depends_on_id) && byId.has(d.task_id))
      .map((d) => item(byId.get(d.task_id)!));
    const doneLastWeek = (done ?? []).filter((r) => r.assignee_email === member.email).length;
    const unreadCount = (unread ?? []).filter((r) => r.recipient_email === member.email).length;
    if (overdue.length + dueThisWeek.length + waitingOnYou.length + doneLastWeek === 0) continue;
    const copy = weeklyDigestMail({
      name: member.display_name?.trim() || member.email.split('@')[0],
      overdue,
      dueThisWeek,
      waitingOnYou,
      doneLastWeek,
      unread: unreadCount,
      href: `${base}/team/tasks`,
    });
    const mail = await sendMail({ to: member.email, ...copy });
    await supabase.from('team_notifications').insert({
      recipient_email: member.email,
      actor_email: '',
      kind: 'digest',
      title: copy.subject.replace(/^Your week: /, 'This week: '),
      body: `${overdue.length} overdue · ${dueThisWeek.length} due this week · ${waitingOnYou.length} waiting on you · ${doneLastWeek} done last week`,
    });
    if (!mail.error) sent += 1;
  }
  return sent;
}
