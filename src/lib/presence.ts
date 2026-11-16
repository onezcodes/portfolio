/*
 * Presence from team_members.last_seen_at. The middleware refreshes it at most every
 * two minutes while someone uses the app, and open tabs ping /team/presence each minute
 * while visible. "Online" means seen in the last five minutes.
 */
export const PRESENCE_WRITE_MS = 2 * 60 * 1000;
export const ONLINE_MS = 5 * 60 * 1000;

export type Presence = { online: boolean; label: string; rank: number };

export function presenceOf(lastSeen: string | null | undefined, now = Date.now()): Presence {
  if (!lastSeen) return { online: false, label: 'Not seen yet', rank: Number.MAX_SAFE_INTEGER };
  const ago = Math.max(0, now - Date.parse(lastSeen));
  if (Number.isNaN(ago)) return { online: false, label: 'Not seen yet', rank: Number.MAX_SAFE_INTEGER };
  if (ago < ONLINE_MS) return { online: true, label: 'Online', rank: ago };
  const minutes = Math.round(ago / 60_000);
  if (minutes < 60) return { online: false, label: `Active ${minutes}m ago`, rank: ago };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { online: false, label: `Active ${hours}h ago`, rank: ago };
  const days = Math.round(hours / 24);
  if (days === 1) return { online: false, label: 'Active yesterday', rank: ago };
  if (days < 7) return { online: false, label: `Active ${days}d ago`, rank: ago };
  const date = new Date(lastSeen).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return { online: false, label: `Last seen ${date}`, rank: ago };
}

/** Online first, then most recently active. */
export function byPresence<T extends { last_seen_at?: string | null }>(rows: T[], now = Date.now()) {
  return [...rows].sort((a, b) => presenceOf(a.last_seen_at, now).rank - presenceOf(b.last_seen_at, now).rank);
}

// ---------- Status and working hours ----------

export type AvailabilityFields = {
  last_seen_at?: string | null;
  status_emoji?: string | null;
  status_text?: string | null;
  status_until?: string | null;
  away?: boolean | null;
  time_zone?: string | null;
  work_days?: number[] | null;
  work_start?: string | null;
  work_end?: string | null;
};

export type Availability = Presence & {
  /** Status set and not expired. */
  status: { emoji: string; text: string; until: string | null } | null;
  away: boolean;
  offHours: boolean;
  /** "Mon 09:00" in their time zone when off hours. */
  backAt: string;
  /** Short line for lists, e.g. "On leave until 24 Nov" or "Off hours · back Mon 09:00". */
  detail: string;
};

export const STATUS_PRESETS = [
  { emoji: '🎧', text: 'Focusing', away: false, until: 'hours' },
  { emoji: '📞', text: 'In a meeting', away: false, until: 'hour' },
  { emoji: '🏠', text: 'Working remotely', away: false, until: 'today' },
  { emoji: '✈️', text: 'Travelling', away: true, until: 'week' },
  { emoji: '🏖', text: 'On leave', away: true, until: 'week' },
  { emoji: '🤒', text: 'Out sick', away: true, until: 'today' },
] as const;

export const TIME_ZONES = [
  'Asia/Bangkok',
  'Asia/Yangon',
  'Asia/Singapore',
  'Asia/Ho_Chi_Minh',
  'Asia/Jakarta',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A real IANA zone name (e.g. "Europe/London"), not just one from the short list. */
export function isTimeZone(zone: string) {
  if (!zone || zone.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function validZone(zone: string | null | undefined) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone || 'Asia/Bangkok' });
    return zone || 'Asia/Bangkok';
  } catch {
    return 'Asia/Bangkok';
  }
}

/** ISO weekday (1 = Mon … 7 = Sun) and minutes since midnight in a time zone. */
export function localClock(zone: string, at: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: validZone(zone),
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = WEEKDAY_SHORT.indexOf(get('weekday')) + 1;
  return { weekday: weekday || 1, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMinutes = (time: string | null | undefined, fallback: number) => {
  const match = String(time ?? '').match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
};
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Working now? If not, when do they start next (in their time zone). */
export function workingHours(member: AvailabilityFields, at = Date.now()) {
  const days = (member.work_days?.length ? member.work_days : [1, 2, 3, 4, 5]).map(Number);
  const start = toMinutes(member.work_start, 9 * 60);
  const end = toMinutes(member.work_end, 18 * 60);
  const { weekday, minutes } = localClock(member.time_zone ?? 'Asia/Bangkok', at);
  const working = days.includes(weekday) && minutes >= start && minutes < end;
  let backAt = '';
  if (!working) {
    for (let i = 0; i < 8; i++) {
      const day = ((weekday - 1 + i) % 7) + 1;
      if (!days.includes(day)) continue;
      if (i === 0 && minutes >= start) continue;
      backAt = `${i === 0 ? 'today' : i === 1 ? 'tomorrow' : WEEKDAY_SHORT[day - 1]} ${hhmm(start)}`;
      break;
    }
  }
  return { working, backAt, start: hhmm(start), end: hhmm(end), days };
}

export function availabilityOf(member: AvailabilityFields, at = Date.now()): Availability {
  const presence = presenceOf(member.last_seen_at, at);
  const until = member.status_until ? Date.parse(member.status_until) : null;
  const statusLive = Boolean((member.status_text || member.status_emoji) && (until === null || until > at));
  const status = statusLive
    ? { emoji: member.status_emoji || '', text: member.status_text || '', until: member.status_until ?? null }
    : null;
  const away = Boolean(statusLive && member.away);
  const hours = workingHours(member, at);
  const offHours = !presence.online && !hours.working;
  const untilText = status?.until
    ? new Date(status.until).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: validZone(member.time_zone) })
    : '';
  let detail = presence.label;
  if (away) detail = `${status?.text || 'Away'}${untilText ? ` until ${untilText}` : ''}`;
  else if (offHours && hours.backAt) detail = `Off hours · back ${hours.backAt}`;
  return { ...presence, status, away, offHours, backAt: hours.backAt, detail };
}

/** End time for a status preset like "hour", "today", "week". */
export function statusUntil(choice: string, zone: string, at = Date.now()) {
  if (choice === 'hour') return new Date(at + 60 * 60 * 1000).toISOString();
  if (choice === 'hours') return new Date(at + 3 * 60 * 60 * 1000).toISOString();
  const { weekday, minutes } = localClock(zone, at);
  const endOfToday = at + (24 * 60 - minutes) * 60 * 1000;
  if (choice === 'today') return new Date(endOfToday).toISOString();
  if (choice === 'week') return new Date(endOfToday + (7 - weekday) * 86_400_000).toISOString();
  return null;
}
