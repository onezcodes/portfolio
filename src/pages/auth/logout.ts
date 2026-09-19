import type { APIRoute } from 'astro';
import { createTeamSupabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createTeamSupabase(request, cookies);
  await supabase.auth.signOut();
  return redirect('/team/login');
};
