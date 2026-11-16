import type { APIRoute } from 'astro';
import { isTimeZone } from '../../lib/presence';

// One-tap "use my device's time zone" from the layout prompt. Meeting times and working
// hours follow the profile zone. (The middleware already blocks writes during "View as".)
export const POST: APIRoute = async ({ request, locals }) => {
  const studio = locals.studio;
  if (!studio?.ok || locals.viewAs) return new Response(null, { status: 403 });
  const form = await request.formData();
  const zone = String(form.get('time_zone') ?? '');
  if (!isTimeZone(zone)) return new Response(null, { status: 400 });
  const { error } = await locals.supabase.from('team_members').update({ time_zone: zone }).eq('email', studio.email);
  if (error) {
    console.error('time zone update failed', error.message);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
};
