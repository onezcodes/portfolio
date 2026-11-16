import type { APIRoute } from 'astro';
import { capsFor } from '../../lib/access';
import { logTaskEvent } from '../../lib/taskCollab';
import { formatMinutes, startTimer, stopTimer } from '../../lib/timeTracking';
import { safeBack, withParam } from '../../lib/viewAs';

// Start or stop the signed-in person's timer from anywhere (header pill, My tasks).
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const back = safeBack(form.get('back'));
  const studio = locals.studio;
  if (!studio) return redirect('/team/login');
  const supabase = locals.supabase;
  const intent = String(form.get('intent') ?? 'stop');

  if (intent === 'start') {
    const taskId = String(form.get('task_id') ?? '');
    const { data: task } = await supabase.from('project_tasks').select('project_id').eq('id', taskId).maybeSingle();
    if (!task || !capsFor(studio, String(task.project_id)).canProgress) return redirect(withParam(back, 'error', 'forbidden'));
    const result = await startTimer(supabase, taskId, studio.email);
    return redirect(result.error ? withParam(back, 'error', 'invalid') : back);
  }

  const result = await stopTimer(supabase, studio.email);
  if (!result.error && result.taskId) {
    await logTaskEvent(supabase, result.taskId, studio.email, 'time', formatMinutes(result.minutes));
  }
  return redirect(back);
};
