import { describe, expect, it } from 'vitest';
import { projectHealth } from '../../src/lib/health';
import { formatMinutes, parseDuration } from '../../src/lib/timeTracking';
import { commentParts, mentionHandle, parseMentions, viewQuery } from '../../src/lib/taskCollab';
import { parseWebhookUrl } from '../../src/lib/chat';
import { priorityRank, sortTaskQueue, taskIsLate } from '../../src/lib/tasks';
import { safeBack, withParam } from '../../src/lib/viewAs';

const today = '2026-11-16';

describe('project health', () => {
  const base = { status: 'active', today, stages: [], tasks: [], lastCheckin: '2026-11-15T10:00:00Z' };
  it('is on track with nothing wrong', () => {
    expect(projectHealth(base).level).toBe('green');
  });
  it('paused and done projects are idle', () => {
    expect(projectHealth({ ...base, status: 'paused' }).level).toBe('idle');
  });
  it('a slightly late stage is a risk; a very late one is off track', () => {
    expect(projectHealth({ ...base, stages: [{ status: 'current', estimated_on: '2026-11-10' }] }).level).toBe('amber');
    expect(projectHealth({ ...base, stages: [{ status: 'current', estimated_on: '2026-10-01' }] }).level).toBe('red');
  });
  it('three late tasks is off track', () => {
    const late = { status: 'todo', due_on: '2026-11-01' };
    expect(projectHealth({ ...base, tasks: [late, late, late] }).level).toBe('red');
  });
  it('overspent funding is off track; money is ignored when not visible', () => {
    expect(projectHealth({ ...base, funding: [{ funded: 1000, remaining: -1 }] }).level).toBe('red');
    expect(projectHealth({ ...base, funding: null }).level).toBe('green');
  });
  it('a quiet project is flagged', () => {
    const quiet = projectHealth({ ...base, lastCheckin: '2026-10-20T00:00:00Z' });
    expect(quiet.level).toBe('red');
    expect(quiet.reasons.join()).toMatch(/No check-in for 27 days/);
  });
});

describe('time parsing', () => {
  it.each([
    ['1h 30m', 90],
    ['90m', 90],
    ['2h', 120],
    ['1.5', 90],
    ['45', 45],
    ['', 0],
    ['30h', 1440],
  ])('%s → %i minutes', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes);
  });
  it('formats minutes', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(135)).toBe('2h 15m');
  });
});

describe('@mentions', () => {
  const people = [
    { email: 'zwelinnhtetag@gmail.com', display_name: 'Zeno' },
    { email: 'onezcodes@gmail.com', display_name: 'Onez Codes' },
  ];
  it('finds mentioned people by email handle', () => {
    expect(mentionHandle('Zwelinnhtetag@gmail.com')).toBe('zwelinnhtetag');
    expect(parseMentions('Thanks @zwelinnhtetag, can you check?', people)).toEqual(['zwelinnhtetag@gmail.com']);
    expect(parseMentions('no mention here, mail me at a@b.com', people)).toEqual([]);
  });
  it('ignores handles that are not people on the project', () => {
    expect(parseMentions('@stranger hello', people)).toEqual([]);
  });
  it('splits a comment for highlighting', () => {
    const parts = commentParts('Ping @onezcodes please', people);
    expect(parts.map((p) => p.text)).toEqual(['Ping ', '@Onez Codes', ' please']);
    expect(parts[1].mention).toBe('onezcodes@gmail.com');
  });
});

describe('saved view query', () => {
  it('keeps only task view params', () => {
    const params = new URLSearchParams('tab=tasks&view=board&pri=high&task=abc&notice=saved&kind=bug');
    expect(viewQuery(params)).toBe('view=board&pri=high&kind=bug');
  });
});

describe('chat webhook validation (no arbitrary URLs)', () => {
  it('accepts Slack and Discord webhooks', () => {
    expect(parseWebhookUrl('https://hooks.slack.com/services/T0/B0/xyz')).toMatch(/^https:\/\/hooks\.slack\.com/);
    expect(parseWebhookUrl('https://discord.com/api/webhooks/1/abc')).toMatch(/^https:\/\/discord\.com/);
    expect(parseWebhookUrl('')).toBe('');
  });
  it.each([
    'http://hooks.slack.com/services/x',
    'https://evil.example.com/api/webhooks/1',
    'https://hooks.slack.com.evil.com/services/x',
    'https://hooks.slack.com/other',
    'https://169.254.169.254/latest/meta-data',
    'javascript:alert(1)',
  ])('rejects %s', (url) => {
    expect(parseWebhookUrl(url)).toBeNull();
  });
});

describe('task ordering', () => {
  const t = (title: string, extra: object) => ({ title, status: 'todo', due_on: null, priority: '', sort_order: 0, ...extra }) as never;
  it('puts open before done, then earlier due dates, then higher priority', () => {
    const sorted = sortTaskQueue([
      t('done', { status: 'done', due_on: '2026-11-01' }),
      t('later', { due_on: '2026-12-01' }),
      t('soon', { due_on: '2026-11-20' }),
      t('undated-high', { priority: 'high' }),
      t('undated-low', { priority: 'low' }),
    ]) as { title: string }[];
    expect(sorted.map((x) => x.title)).toEqual(['soon', 'later', 'undated-high', 'undated-low', 'done']);
  });
  it('ranks priority', () => {
    expect([priorityRank('high'), priorityRank('medium'), priorityRank('low'), priorityRank('')]).toEqual([3, 2, 1, 0]);
  });
  it('late means open and past due', () => {
    expect(taskIsLate({ status: 'todo', due_on: '2026-11-15' }, today)).toBe(true);
    expect(taskIsLate({ status: 'done', due_on: '2026-11-15' }, today)).toBe(false);
    expect(taskIsLate({ status: 'todo', due_on: today }, today)).toBe(false);
  });
});

describe('redirect safety', () => {
  it('only returns to team pages', () => {
    expect(safeBack('/team/projects/1?tab=tasks')).toBe('/team/projects/1?tab=tasks');
    expect(safeBack('https://evil.com')).toBe('/team');
    expect(safeBack('//evil.com/team')).toBe('/team');
    expect(safeBack(null)).toBe('/team');
  });
  it('adds a query param without losing others', () => {
    expect(withParam('/team/projects/1?tab=tasks', 'notice', 'saved')).toBe('/team/projects/1?tab=tasks&notice=saved');
  });
});

describe('view-as session id', () => {
  const token = (payload: object) =>
    `x.${Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.y`;
  it('reads session_id from the access token', async () => {
    const { sessionIdFromToken } = await import('../../src/lib/viewAs');
    expect(sessionIdFromToken(token({ email: 'a@x.com', session_id: 'abc-123' }))).toBe('abc-123');
    expect(sessionIdFromToken(token({ email: 'a@x.com' }))).toBe('');
    expect(sessionIdFromToken('not-a-jwt')).toBe('');
    expect(sessionIdFromToken(null)).toBe('');
  });
});

describe('presence', () => {
  it('labels online and last-seen times', async () => {
    const { presenceOf, byPresence } = await import('../../src/lib/presence');
    const now = Date.parse('2026-11-16T10:00:00Z');
    const ago = (ms: number) => new Date(now - ms).toISOString();
    expect(presenceOf(ago(60_000), now)).toMatchObject({ online: true, label: 'Online' });
    expect(presenceOf(ago(12 * 60_000), now).label).toBe('Active 12m ago');
    expect(presenceOf(ago(3 * 3_600_000), now).label).toBe('Active 3h ago');
    expect(presenceOf(ago(30 * 3_600_000), now).label).toBe('Active yesterday');
    expect(presenceOf(ago(4 * 86_400_000), now).label).toBe('Active 4d ago');
    expect(presenceOf(ago(20 * 86_400_000), now).label).toMatch(/^Last seen /);
    expect(presenceOf(null, now)).toMatchObject({ online: false, label: 'Not seen yet' });
    const order = byPresence([{ id: 'never', last_seen_at: null }, { id: 'old', last_seen_at: ago(86_400_000) }, { id: 'now', last_seen_at: ago(1000) }], now);
    expect(order.map((r) => r.id)).toEqual(['now', 'old', 'never']);
  });
});

describe('activity heatmap', () => {
  it('builds 53 Monday-first weeks ending this week', async () => {
    const { heatmapGrid } = await import('../../src/lib/activity');
    const grid = heatmapGrid('2026-11-18'); // a Wednesday
    expect(grid).toHaveLength(53);
    expect(grid.at(-1)?.[0].day).toBe('2026-11-16'); // Monday of this week
    expect(grid.at(-1)?.[2]).toEqual({ day: '2026-11-18', future: false });
    expect(grid.at(-1)?.[3].future).toBe(true);
  });
  it('counts streaks, active days, and the busiest weekday', async () => {
    const { activityStats } = await import('../../src/lib/activity');
    const map = new Map([
      ['2026-11-16', { actions: 3, minutes: 0 }], // Mon
      ['2026-11-15', { actions: 0, minutes: 60 }], // Sun (time only counts)
      ['2026-11-14', { actions: 1, minutes: 0 }],
      ['2026-11-10', { actions: 9, minutes: 0 }], // Tue, separate run
    ]);
    const stats = activityStats(map, '2026-11-16');
    expect(stats).toMatchObject({ actions: 13, minutes: 60, activeDays: 4, current: 3, longest: 3, busiest: 'Tuesdays' });
    // Today without activity yet: the streak counts back from yesterday.
    expect(activityStats(map, '2026-11-17').current).toBe(3);
  });
  it('maps scores to five shades', async () => {
    const { heatLevel, dayScore } = await import('../../src/lib/activity');
    expect([0, 1, 4, 8, 20].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
    expect(dayScore({ actions: 2, minutes: 90 })).toBe(5);
  });
});
