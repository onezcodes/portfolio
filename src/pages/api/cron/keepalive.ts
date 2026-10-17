import type { APIRoute } from 'astro';
import { createServiceSupabase } from '../../../lib/supabase';

// Free Supabase projects pause after a week without activity; one cheap query a day keeps it awake.
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

  return new Response(JSON.stringify({ ok: true, members: count ?? 0, at: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST = GET;
