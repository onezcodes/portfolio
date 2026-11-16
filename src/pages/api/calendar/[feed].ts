import type { APIRoute } from 'astro';
import { createPublicSupabase, siteUrl } from '../../../lib/supabase';
import { meetingIcsEvents, normalizeSlots, type ProjectMeeting } from '../../../lib/meetings';

// Private calendar feed (subscribe in Google/Apple Calendar): your open task due dates
// and stage dates on your projects. The token in the URL is the only credential.
type Item = { uid: string; kind: 'task' | 'stage'; title: string; project: string; day: string; project_id: string; task_id: string | null };

const esc = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
const nextDay = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return ymd(d.toISOString());
};
// iCalendar lines must be folded at 75 octets.
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
};

export const GET: APIRoute = async ({ params, request }) => {
  const token = String(params.feed ?? '').replace(/\.ics$/, '');
  const supabase = createPublicSupabase();
  if (!supabase || !/^[a-f0-9]{24,80}$/.test(token)) return new Response('Not found', { status: 404 });
  const [{ data, error }, { data: meetingRows }] = await Promise.all([
    supabase.rpc('calendar_feed', { feed_token: token }),
    supabase.rpc('calendar_meetings', { feed_token: token }),
  ]);
  if (error) {
    console.error('calendar feed failed', error.message);
    return new Response('Not found', { status: 404 });
  }
  const items = (data ?? []) as Item[];
  const base = siteUrl(request);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Onez Codes//Team//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Onez Codes · My work',
    'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
    'X-PUBLISHED-TTL:PT2H',
  ];
  for (const item of items) {
    const url = item.task_id
      ? `${base}/team/projects/${item.project_id}?tab=tasks&task=${item.task_id}`
      : `${base}/team/projects/${item.project_id}?tab=schedule`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.uid}@onezcodes`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(item.day)}`,
      `DTEND;VALUE=DATE:${nextDay(item.day)}`,
      fold(`SUMMARY:${esc(item.kind === 'stage' ? `◆ ${item.project}: ${item.title}` : `${item.title} (${item.project})`)}`),
      fold(`DESCRIPTION:${esc(item.kind === 'stage' ? 'Stage date' : 'Task due')}\\n${esc(url)}`),
      fold(`URL:${url}`),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  // Recurring project meetings (weekly, with a 15-minute alarm).
  for (const row of (meetingRows ?? []) as (ProjectMeeting & { project: string })[]) {
    const meeting = { ...row, slots: normalizeSlots(row.slots), skip_dates: row.skip_dates ?? [] };
    for (const line of meetingIcsEvents(meeting, { stamp, href: `${base}/team/projects/${row.project_id}?tab=schedule#meetings` })) {
      lines.push(fold(line));
    }
  }
  lines.push('END:VCALENDAR');
  return new Response(`${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="onez-codes.ics"',
      'Cache-Control': 'private, max-age=900',
      'X-Robots-Tag': 'noindex',
    },
  });
};
