import { defineMiddleware } from 'astro:middleware';
import { loadStudioAccess } from './lib/access';
import { createTeamSupabase, emailOf, isSuperAdmin, sessionUser, supabaseConfigured } from './lib/supabase';
import { activeViewAs, previewUser, stopViewAs, withParam } from './lib/viewAs';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const gated = path.startsWith('/team') || path.startsWith('/auth');
  if (!gated) return next();

  if (!supabaseConfigured()) {
    if (path === '/team/login') return next();
    return context.redirect('/team/login?error=setup');
  }

  const supabase = createTeamSupabase(context.request, context.cookies);
  context.locals.supabase = supabase;
  context.locals.studio = null;
  context.locals.viewAs = null;
  context.locals.realUser = null;

  const user = await sessionUser(supabase);
  context.locals.user = user;
  context.locals.realUser = user;

  const onLogin = path === '/team/login';
  const onAuth = path.startsWith('/auth');
  if (onAuth) return next();

  if (!user) {
    if (onLogin) return next();
    return context.redirect('/team/login');
  }

  // "View as": only the super admin can have a preview. The database already answers as the
  // teammate for this session; here we load the teammate's capabilities and make it read-only.
  const viewAs = isSuperAdmin(user) ? await activeViewAs(supabase, emailOf(user)) : null;
  const effective = viewAs ? previewUser(user, viewAs.email) : user;

  const studio = await loadStudioAccess(supabase, effective, { preview: Boolean(viewAs) });
  if (!studio.ok) {
    if (viewAs) {
      // The teammate is no longer on the team: end the preview instead of signing out.
      await stopViewAs(supabase, emailOf(user));
      return context.redirect('/team?error=view-as-gone');
    }
    await supabase.auth.signOut();
    return context.redirect('/team/login?error=not-on-team');
  }

  if (viewAs) {
    context.locals.viewAs = viewAs;
    context.locals.user = effective;
    if (!READ_METHODS.has(context.request.method) && path !== '/team/view-as') {
      const ref = new URL(context.request.headers.get('referer') ?? '/team', context.url);
      const back = ref.origin === context.url.origin && ref.pathname.startsWith('/team') ? `${ref.pathname}${ref.search}` : '/team';
      return context.redirect(withParam(back, 'error', 'view-as-readonly'), 303);
    }
  }

  context.locals.studio = studio;
  if (onLogin) return context.redirect('/team');
  return next();
});
