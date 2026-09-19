import { defineMiddleware } from 'astro:middleware';
import { loadStudioAccess } from './lib/access';
import { createTeamSupabase, sessionUser, supabaseConfigured } from './lib/supabase';

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

  const user = await sessionUser(supabase);
  context.locals.user = user;

  const onLogin = path === '/team/login';
  const onAuth = path.startsWith('/auth');
  if (onAuth) return next();

  if (!user) {
    if (onLogin) return next();
    return context.redirect('/team/login');
  }

  const studio = await loadStudioAccess(supabase, user);
  if (!studio.ok) {
    await supabase.auth.signOut();
    return context.redirect('/team/login?error=not-on-team');
  }

  context.locals.studio = studio;
  if (onLogin) return context.redirect('/team');
  return next();
});
