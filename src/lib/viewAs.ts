import type { User } from '@supabase/supabase-js';
import type { TeamSupabase } from './supabase';

/**
 * "View as" preview: the super admin sees the team app with a teammate's permissions.
 * The database does the real work (public.jwt_email() returns the teammate for this login
 * session), so every RLS-filtered read matches what that teammate sees. The app's job is
 * to recompute the teammate's capabilities and to block writes while a preview is active.
 */
export type ViewAs = {
  email: string;
  realEmail: string;
  expiresAt: string;
};

/** The active preview for this login session, if any. RLS limits rows to this session. */
export async function activeViewAs(supabase: TeamSupabase, realEmail: string): Promise<ViewAs | null> {
  const { data, error } = await supabase
    .from('studio_view_as')
    .select('target_email, expires_at')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) {
    // Table missing (migration not applied yet) or similar: behave as if no preview.
    if (error.code !== '42P01' && error.code !== 'PGRST205') console.error('view-as lookup failed', error.message);
    return null;
  }
  if (!data?.target_email) return null;
  return { email: String(data.target_email), realEmail, expiresAt: String(data.expires_at) };
}

/**
 * A stand-in user for the previewed teammate. Pages only read the user for display and for
 * write attribution, and writes are blocked during a preview, so email is what matters.
 */
export function previewUser(real: User, email: string): User {
  return {
    ...real,
    email,
    user_metadata: {},
    app_metadata: {},
    identities: [],
    last_sign_in_at: undefined,
  };
}

export async function startViewAs(supabase: TeamSupabase, realEmail: string, target: string) {
  await supabase.from('studio_view_as').delete().eq('admin_email', realEmail);
  const { error } = await supabase.from('studio_view_as').insert({ target_email: target, admin_email: realEmail });
  if (error) console.error('view-as start failed', error.message);
  return !error;
}

export async function stopViewAs(supabase: TeamSupabase, realEmail: string) {
  const { error } = await supabase.from('studio_view_as').delete().eq('admin_email', realEmail);
  if (error) console.error('view-as stop failed', error.message);
  return !error;
}

/** Same-origin team path to return to; anything else falls back to the overview. */
export function safeBack(value: FormDataEntryValue | null) {
  const path = String(value ?? '');
  return path.startsWith('/team') && !path.startsWith('//') ? path : '/team';
}

export function withParam(path: string, key: string, value: string) {
  const url = new URL(path, 'http://x');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}
