import type { APIRoute } from 'astro';
import { createTeamSupabase, isTeamMember } from '../../lib/supabase';

export const GET: APIRoute = async ({ request, cookies, redirect, url }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/team';
  if (!code) {
    return redirect('/team/login?error=missing-code');
  }

  const supabase = createTeamSupabase(request, cookies);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('OAuth exchange failed', error.message);
    return redirect('/team/login?error=oauth');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!(await isTeamMember(supabase, user))) {
    await supabase.auth.signOut();
    return redirect('/team/login?error=not-on-team');
  }

  const safeNext = next.startsWith('/team') ? next : '/team';
  return redirect(safeNext);
};
