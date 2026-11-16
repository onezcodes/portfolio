import type { APIRoute } from 'astro';
import { logEvent } from '../../lib/events';
import { isSuperAdmin } from '../../lib/supabase';
import { safeBack, startViewAs, stopViewAs, withParam } from '../../lib/viewAs';

// Start or stop a "view as" preview. Only the signed-in super admin may start one;
// the database checks the real login again before it accepts the row.
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const back = safeBack(form.get('back'));
  const realUser = locals.realUser ?? locals.user;
  const realEmail = realUser?.email?.trim().toLowerCase() ?? '';
  const supabase = locals.supabase;

  if (!realUser || !isSuperAdmin(realUser)) return redirect(withParam(back, 'error', 'forbidden'));

  if (intent === 'stop') {
    await stopViewAs(supabase, realEmail);
    return redirect(withParam(back, 'notice', 'view-as-off'));
  }

  if (intent === 'start') {
    const target = String(form.get('email') ?? '').trim().toLowerCase();
    if (!target || target === realEmail) return redirect(withParam(back, 'error', 'invalid'));
    // Log before the preview starts, while the session still acts as the admin.
    await logEvent(supabase, realEmail, { action: 'view_as', entityType: 'member', detail: target });
    const ok = await startViewAs(supabase, realEmail, target);
    return redirect(ok ? withParam(back, 'notice', 'view-as-on') : withParam(back, 'error', 'invalid'));
  }

  return redirect(withParam(back, 'error', 'invalid'));
};
