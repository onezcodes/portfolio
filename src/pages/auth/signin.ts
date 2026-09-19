import type { APIRoute } from 'astro';
import { createTeamSupabase, siteUrl } from '../../lib/supabase';

const providers = new Set(['google', 'github']);

async function startOAuth(
  request: Request,
  cookies: Parameters<APIRoute>[0]['cookies'],
  redirect: Parameters<APIRoute>[0]['redirect'],
  provider: string,
) {
  if (!providers.has(provider)) {
    return redirect('/team/login?error=unknown-provider');
  }

  const supabase = createTeamSupabase(request, cookies);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as 'google' | 'github',
    options: {
      redirectTo: `${siteUrl(request)}/auth/callback`,
      skipBrowserRedirect: true,
      scopes: provider === 'github' ? 'read:user user:email' : undefined,
    },
  });

  if (error || !data.url) {
    console.error('OAuth start failed', error?.message);
    return redirect('/team/login?error=oauth');
  }

  return redirect(data.url);
}

export const GET: APIRoute = async ({ request, cookies, redirect, url }) => {
  const provider = url.searchParams.get('provider') ?? '';
  if (!provider) return redirect('/team/login');
  return startOAuth(request, cookies, redirect, provider);
};

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  return startOAuth(request, cookies, redirect, String(form.get('provider') ?? ''));
};
