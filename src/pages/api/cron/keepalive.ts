import type { APIRoute } from 'astro';
import { runBackup } from '../../../lib/backup';
import { createServiceSupabase } from '../../../lib/supabase';

// Free Supabase projects pause after a week without activity; one cheap query a day keeps it awake.
// The same daily run takes the nightly backup (the Hobby plan allows only two cron jobs).
export const GET: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET?.trim();
  const auth = request.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createServiceSupabase();
  if (!supabase) {
    return new Response(JSON.stringify({ error: 'setup' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { count, error } = await supabase.from('team_members').select('email', { count: 'exact', head: true });
  if (error) {
    console.error('keepalive query failed', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let backup: Awaited<ReturnType<typeof runBackup>> | { error: string };
  try {
    backup = await runBackup(supabase);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('backup failed', message);
    backup = { error: message };
  }

  return new Response(JSON.stringify({ ok: !('error' in backup), members: count ?? 0, backup, at: new Date().toISOString() }), {
    status: 'error' in backup ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST = GET;
