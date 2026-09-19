import type { APIRoute } from 'astro';
import { createTeamSupabase, siteUrl } from '../../lib/supabase';

const providers = new Set(['google', 'github']);

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const provider = String(form.get('provider') ?? '');
  if (!providers.has(provider)) {
    return redirect('/team/login?error=unknown-provider');
  }

  const supabase = createTeamSupabase(request, cookies);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as 'google' | 'github',
    options: {
      redirectTo: `${siteUrl(request)}/auth/callback`,
      scopes: provider === 'github' ? 'read:user user:email' : undefined,
    },
  });

  if (error || !data.url) {
    console.error('OAuth start failed', error?.message);
    return redirect('/team/login?error=oauth');
  }

  return redirect(data.url);
};
