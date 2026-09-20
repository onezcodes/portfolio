import type { APIRoute } from 'astro';
import { sendTaskDue } from '../../../lib/mail';
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
  const tasks = await dueNoticeTasks(supabase, today);
  if (tasks.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, today }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const projectIds = [...new Set(tasks.map((row) => row.project_id))];
  const { data: projects } = await supabase.from('projects').select('id, name').in('id', projectIds);
  const names = new Map((projects ?? []).map((row) => [row.id as string, String(row.name ?? 'Project')]));

  let sent = 0;
  for (const task of tasks) {
    if (!task.due_on || !task.assignee_email) continue;
    const href = `${siteUrl(request)}/team/projects/${task.project_id}?tab=schedule`;
    const mail = await sendTaskDue(
      task.assignee_email,
      names.get(task.project_id) ?? 'a project',
      task.title,
      task.due_on,
      taskIsLate(task, today),
      href,
    );
    if (!mail.error) {
      sent += 1;
      await markTaskMail(supabase, task.id, today);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: tasks.length, today }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST = GET;
