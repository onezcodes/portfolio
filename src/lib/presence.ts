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
