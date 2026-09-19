import { defineMiddleware } from 'astro:middleware';
import { loadStudioAccess } from './lib/access';
import { createTeamSupabase, isTeamMember, supabaseConfigured } from './lib/supabase';

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  context.locals.user = user;

  const onLogin = path === '/team/login';
  const onAuth = path.startsWith('/auth');
  if (onLogin || onAuth) return next();

  if (!user) {
    return context.redirect('/team/login');
  }

  if (!(await isTeamMember(supabase, user))) {
    await supabase.auth.signOut();
    return context.redirect('/team/login?error=not-on-team');
  }

  context.locals.studio = await loadStudioAccess(supabase, user);
  return next();
});
