import type { APIRoute } from 'astro';
import { sendContactEnquiry } from '../../lib/mail';
import { surfaces, timelines } from '../../data/site';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const platforms = new Set<string>(surfaces);
const when = new Set<string>(timelines);

function field(value: FormDataEntryValue | string | null, max: number) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max);
}

function wantsJson(request: Request) {
  return request.headers.get('accept')?.includes('application/json') ?? false;
}

function fail(request: Request, status: number, error: string) {
  if (wantsJson(request)) {
    return new Response(JSON.stringify({ ok: false, error }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(null, {
    status: 303,
    headers: { Location: '/contact?error=1' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const payload = await request.formData().catch(() => null);
  if (!payload) return fail(request, 400, 'invalid');

  if (field(payload.get('company'), 80)) {
    if (wantsJson(request)) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, { status: 303, headers: { Location: '/contact?sent=1' } });
  }

  const name = field(payload.get('name'), 80);
  const email = field(payload.get('email'), 120).toLowerCase();
  const platform = field(payload.get('platform'), 40);
  const timeline = field(payload.get('timeline'), 40);
  const message = field(payload.get('message'), 8000);

  if (!name || !emailPattern.test(email) || !platforms.has(platform) || !when.has(timeline) || message.length < 8) {
    return fail(request, 400, 'invalid');
  }

  const mail = await sendContactEnquiry({ name, email, platform, timeline, message });
  if (mail.error === 'setup') return fail(request, 503, 'setup');
  if (mail.error) return fail(request, 502, 'send');

  if (wantsJson(request)) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/contact?sent=1' },
  });
};

export const GET: APIRoute = async () => {
  return new Response(null, { status: 303, headers: { Location: '/contact' } });
};
