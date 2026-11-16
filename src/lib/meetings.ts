import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Recurring project meetings. A series has weekly slots (day 0-6, Sunday = 0, plus a local
 * "HH:MM"), a time zone, a duration, a main link and a backup link. Occurrences are worked
 * out on the fly; single dates can be skipped.
 */

export type MeetingSlot = { day: number; time: string };

export type ProjectMeeting = {
  id: string;
  project_id: string;
  title: string;
  slots: MeetingSlot[];
  time_zone: string;
  duration_minutes: number;
  meeting_url: string;
  backup_url: string;
  notes: string;
  skip_dates: string[];
  created_by?: string;
  updated_at?: string;
  projects?: { name: string } | null;
};

export type Occurrence = {
  meeting: ProjectMeeting;
  start: number;
  end: number;
  /** Local date (YYYY-MM-DD) in the meeting's time zone. */
  localDate: string;
};

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Show a site-wide banner from this long before a meeting until it ends. */
export const BANNER_LEAD_MS = 30 * 60 * 1000;

function zoneOr(zone: string | null | undefined) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone || 'Asia/Bangkok' });
    return zone || 'Asia/Bangkok';
  } catch {
    return 'Asia/Bangkok';
  }
}

/** Offset of a time zone from UTC at a given instant, in ms (positive east of UTC). */
function zoneOffset(zone: string, at: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** A wall-clock date and time in a zone → epoch ms. */
export function zonedToUtc(date: string, time: string, zone: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - zoneOffset(zone, guess);
  // Second pass settles DST edges.
  return guess - zoneOffset(zone, first);
}

/** Local calendar date and weekday (0 = Sunday) of an instant in a zone. */
export function zonedDate(zone: string, at: number) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, weekday };
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function normalizeSlots(raw: unknown): MeetingSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((slot) => ({ day: Number((slot as MeetingSlot)?.day), time: String((slot as MeetingSlot)?.time ?? '') }))
    .filter((slot) => Number.isInteger(slot.day) && slot.day >= 0 && slot.day <= 6 && /^\d{2}:\d{2}$/.test(slot.time))
    .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}

/** Occurrences that have not ended yet, from now through `days` ahead. */
export function occurrences(meeting: ProjectMeeting, now = Date.now(), days = 14): Occurrence[] {
  const zone = zoneOr(meeting.time_zone);
  const slots = normalizeSlots(meeting.slots);
  const skip = new Set(meeting.skip_dates ?? []);
  const today = zonedDate(zone, now).date;
  const out: Occurrence[] = [];
  for (let i = -1; i <= days; i++) {
    const date = addDays(today, i);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const slot of slots) {
      if (slot.day !== weekday || skip.has(date)) continue;
      const start = zonedToUtc(date, slot.time, zone);
      const end = start + meeting.duration_minutes * 60_000;
      if (end > now) out.push({ meeting, start, end, localDate: date });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function nextOccurrence(meeting: ProjectMeeting, now = Date.now()) {
  return occurrences(meeting, now, 14)[0] ?? null;
}

export function upcoming(meetings: ProjectMeeting[], now = Date.now(), days = 7) {
  return meetings.flatMap((m) => occurrences(m, now, days)).sort((a, b) => a.start - b.start);
}

/** "Live now", "in 12 min", "in 4 hr", "in 2 days". */
export function relativeLabel(start: number, end: number, now = Date.now()) {
  if (now >= start && now < end) return 'Live now';
  const ms = start - now;
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `in ${minutes} min`;
  const hours = ms / 3_600_000;
  if (hours < 24) return `in ${hours < 10 ? Math.round(hours * 2) / 2 : Math.round(hours)} hr`;
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** "Today 9:00 PM", "Tomorrow 9:00 PM", "Fri 9:00 PM", "Tue 24 Nov 9:00 PM". */
export function whenLabel(occurrence: Pick<Occurrence, 'start' | 'localDate'>, zone: string, now = Date.now()) {
  const z = zoneOr(zone);
  const time = new Date(occurrence.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: z });
  const today = zonedDate(z, now).date;
  if (occurrence.localDate === today) return `Today ${time}`;
  if (occurrence.localDate === addDays(today, 1)) return `Tomorrow ${time}`;
  const weekday = DAY_SHORT[new Date(`${occurrence.localDate}T12:00:00Z`).getUTCDay()];
  if (occurrence.localDate <= addDays(today, 6)) return `${weekday} ${time}`;
  const d = new Date(`${occurrence.localDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${weekday} ${d} ${time}`;
}

/** "Tue & Fri · 9:00 PM" or "Tue 9:00 PM, Fri 8:00 PM". */
export function scheduleLabel(meeting: Pick<ProjectMeeting, 'slots'>) {
  const slots = normalizeSlots(meeting.slots);
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  if (slots.length === 0) return 'No times set';
  const times = new Set(slots.map((s) => s.time));
  if (times.size === 1) return `${slots.map((s) => DAY_SHORT[s.day]).join(' & ')} · ${fmt(slots[0].time)}`;
  return slots.map((s) => `${DAY_SHORT[s.day]} ${fmt(s.time)}`).join(', ');
}

export function meetingHref(url: string) {
  if (!url) return '';
  return url.includes('://') ? url : `https://${url}`;
}

function parseLink(raw: string): string | null {
  const value = raw.trim();
  if (!value) return '';
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function meetingFromForm(form: FormData) {
  const days = form.getAll('slot_day').map(Number);
  const times = form.getAll('slot_time').map(String);
  const slots = normalizeSlots(days.map((day, i) => ({ day, time: times[i] ?? '' })));
  const unique = slots.filter((s, i) => slots.findIndex((x) => x.day === s.day && x.time === s.time) === i);
  const meeting_url = parseLink(String(form.get('meeting_url') ?? ''));
  const backup_url = parseLink(String(form.get('backup_url') ?? ''));
  const duration = Number(form.get('duration_minutes') ?? 60);
  const title = String(form.get('title') ?? '').trim().slice(0, 80) || 'Team meeting';
  const time_zone = zoneOr(String(form.get('time_zone') ?? 'Asia/Bangkok'));
  if (unique.length === 0 || meeting_url === null || backup_url === null || !meeting_url) return null;
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) return null;
  return {
    title,
    slots: unique,
    time_zone,
    duration_minutes: Math.round(duration),
    meeting_url,
    backup_url,
    notes: String(form.get('notes') ?? '').trim().slice(0, 500),
  };
}

export async function projectMeetings(supabase: SupabaseClient, projectIds?: string[]) {
  let query = supabase.from('project_meetings').select('*, projects(name)');
  if (projectIds) {
    if (projectIds.length === 0) return [];
    query = query.in('project_id', projectIds);
  }
  const { data, error } = await query;
  if (error) {
    if (error.code !== '42P01' && error.code !== 'PGRST205') console.error('meetings lookup failed', error.message);
    return [];
  }
  return ((data ?? []) as ProjectMeeting[]).map((m) => ({ ...m, slots: normalizeSlots(m.slots), skip_dates: m.skip_dates ?? [] }));
}

// ---------- Calendar (ICS) ----------

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** One weekly VEVENT per slot, in the meeting's time zone. */
export function meetingIcsEvents(meeting: ProjectMeeting & { project?: string }, opts: { stamp: string; href: string; now?: number }) {
  const zone = zoneOr(meeting.time_zone);
  const now = opts.now ?? Date.now();
  const today = zonedDate(zone, now).date;
  const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const lines: string[] = [];
  for (const slot of normalizeSlots(meeting.slots)) {
    // First occurrence on or after today.
    let date = today;
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      if (new Date(`${d}T12:00:00Z`).getUTCDay() === slot.day) {
        date = d;
        break;
      }
    }
    const [h, m] = slot.time.split(':').map(Number);
    const endMinutes = h * 60 + m + meeting.duration_minutes;
    const endDate = addDays(date, Math.floor(endMinutes / 1440));
    const endTime = `${String(Math.floor((endMinutes % 1440) / 60)).padStart(2, '0')}${String(endMinutes % 60).padStart(2, '0')}00`;
    const startStamp = `${date.replace(/-/g, '')}T${slot.time.replace(':', '')}00`;
    const description = [
      meeting.meeting_url && `Join: ${meeting.meeting_url}`,
      meeting.backup_url && `Backup: ${meeting.backup_url}`,
      meeting.notes,
      opts.href,
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:meeting-${meeting.id}-${slot.day}-${slot.time.replace(':', '')}@onezcodes`,
      `DTSTAMP:${opts.stamp}`,
      `DTSTART;TZID=${zone}:${startStamp}`,
      `DTEND;TZID=${zone}:${endDate.replace(/-/g, '')}T${endTime}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[slot.day]}`,
      ...(meeting.skip_dates ?? [])
        .filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === slot.day)
        .map((d) => `EXDATE;TZID=${zone}:${d.replace(/-/g, '')}T${slot.time.replace(':', '')}00`),
      `SUMMARY:${esc(`${meeting.project ? `${meeting.project}: ` : ''}${meeting.title}`)}`,
      `DESCRIPTION:${esc(description)}`,
      ...(meeting.meeting_url ? [`URL:${meeting.meeting_url}`, `LOCATION:${esc(meeting.meeting_url)}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(meeting.title)} in 15 minutes`,
      'TRIGGER:-PT15M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  return lines;
}
