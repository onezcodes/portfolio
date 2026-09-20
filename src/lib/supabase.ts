import { createServerClient, parseCookieHeader, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import type { User } from '@supabase/supabase-js';

export const SUPER_ADMIN_EMAIL = 'onezcodes@gmail.com';

export function supabaseConfigured() {
  return Boolean(import.meta.env.PUBLIC_SUPABASE_URL && import.meta.env.PUBLIC_SUPABASE_ANON_KEY);
}

export function createServiceSupabase() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TeamSupabase = ReturnType<typeof createTeamSupabase>;

export function createTeamSupabase(request: Request, cookies: AstroCookies) {
  return createServerClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '');
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[], _headers: Record<string, string>) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, {
            ...options,
            path: options.path ?? '/',
            sameSite: options.sameSite ?? 'lax',
            secure: import.meta.env.PROD || options.secure,
          });
        });
      },
    },
  });
}

export function siteUrl(request?: Request) {
  const fromEnv = import.meta.env.PUBLIC_SITE_URL?.replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  if (request) return new URL(request.url).origin;
  return 'https://www.onezcodes.com';
}

export function emailOf(user: User | null) {
  return user?.email?.trim().toLowerCase() ?? '';
}

export function isSuperAdmin(user: User | null) {
  return emailOf(user) === SUPER_ADMIN_EMAIL;
}

export async function sessionUser(supabase: TeamSupabase) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const current = session?.user ?? null;
  if (!current) return null;
  const expiresAt = (session?.expires_at ?? 0) * 1000;
  if (expiresAt && expiresAt < Date.now() + 15_000) {
    const { data } = await supabase.auth.getUser();
    return data.user ?? current;
  }
  return current;
}

export async function isTeamMember(supabase: TeamSupabase, user: User | null) {
  const email = emailOf(user);
  if (!email) return false;
  if (email === SUPER_ADMIN_EMAIL) return true;
  const { data, error } = await supabase.from('team_members').select('email').eq('email', email).maybeSingle();
  if (error) {
    console.error('team_members lookup failed', error.message);
    return false;
  }
  return Boolean(data);
}
