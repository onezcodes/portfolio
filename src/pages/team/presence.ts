import type { APIRoute } from 'astro';

// Heartbeat from open tabs. The middleware already refreshed last_seen_at (at most every
// two minutes) while loading this request, so there is nothing else to do here.
export const GET: APIRoute = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
