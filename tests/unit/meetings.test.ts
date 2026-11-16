import { describe, expect, it } from 'vitest';
import {
  meetingFromForm,
  meetingIcsEvents,
  nextOccurrence,
  occurrences,
  relativeLabel,
  scheduleLabel,
  whenLabel,
  zonedToUtc,
  type ProjectMeeting,
} from '../../src/lib/meetings';

// Mon 16 Nov 2026, 10:00 in Bangkok (03:00 UTC).
const NOW = Date.parse('2026-11-16T03:00:00Z');
const meeting: ProjectMeeting = {
  id: 'm1',
  project_id: 'p1',
  title: 'Team sync',
  slots: [
    { day: 2, time: '21:00' }, // Tue
    { day: 5, time: '21:00' }, // Fri
  ],
  time_zone: 'Asia/Bangkok',
  duration_minutes: 60,
  meeting_url: 'https://meet.google.com/abc-defg-hij',
  backup_url: 'https://zoom.us/j/123',
  notes: '',
  skip_dates: [],
};

describe('meeting times', () => {
  it('converts a Bangkok wall-clock time to UTC', () => {
    expect(new Date(zonedToUtc('2026-11-17', '21:00', 'Asia/Bangkok')).toISOString()).toBe('2026-11-17T14:00:00.000Z');
  });
  it('lists the next Tuesday and Friday sessions', () => {
    const list = occurrences(meeting, NOW, 7).map((o) => new Date(o.start).toISOString());
    expect(list).toEqual(['2026-11-17T14:00:00.000Z', '2026-11-20T14:00:00.000Z']);
  });
  it('skips cancelled dates', () => {
    const next = nextOccurrence({ ...meeting, skip_dates: ['2026-11-17'] }, NOW);
    expect(next?.localDate).toBe('2026-11-20');
  });
  it('keeps a running meeting until it ends', () => {
    const during = Date.parse('2026-11-17T14:30:00Z');
    const next = nextOccurrence(meeting, during)!;
    expect(next.localDate).toBe('2026-11-17');
    expect(relativeLabel(next.start, next.end, during)).toBe('Live now');
  });
});

describe('labels', () => {
  const start = Date.parse('2026-11-16T14:00:00Z'); // today 9:00 PM Bangkok
  it.each([
    [start - 4 * 3_600_000, 'in 4 hr'],
    [start - 90 * 60_000, 'in 1.5 hr'],
    [start - 60 * 60_000, 'in 1 hr'],
    [start - 12 * 60_000, 'in 12 min'],
    [start - 30_000, 'in 1 min'],
    [start + 5 * 60_000, 'Live now'],
    [start - 50 * 3_600_000, 'in 2 days'],
  ])('relative label at %i', (now, label) => {
    expect(relativeLabel(start, start + 3_600_000, now)).toBe(label);
  });
  it('says today, tomorrow, or the weekday', () => {
    expect(whenLabel({ start, localDate: '2026-11-16' }, 'Asia/Bangkok', NOW)).toBe('Today 9:00 PM');
    expect(whenLabel({ start: start + 86_400_000, localDate: '2026-11-17' }, 'Asia/Bangkok', NOW)).toBe('Tomorrow 9:00 PM');
    expect(whenLabel({ start: start + 4 * 86_400_000, localDate: '2026-11-20' }, 'Asia/Bangkok', NOW)).toBe('Fri 9:00 PM');
  });
  it('summarises the schedule', () => {
    expect(scheduleLabel(meeting)).toBe('Tue & Fri · 9:00 PM');
    expect(scheduleLabel({ slots: [{ day: 1, time: '09:30' }, { day: 4, time: '20:00' }] })).toBe('Mon 9:30 AM, Thu 8:00 PM');
  });
});

describe('meeting form', () => {
  const form = (fields: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of fields) f.append(k, v);
    return f;
  };
  it('accepts two weekly slots with a main and backup link', () => {
    const payload = meetingFromForm(
      form([
        ['title', 'Team sync'],
        ['slot_day', '2'], ['slot_time', '21:00'],
        ['slot_day', '5'], ['slot_time', '21:00'],
        ['slot_day', '5'], ['slot_time', '21:00'], // duplicate is dropped
        ['duration_minutes', '45'],
        ['meeting_url', 'meet.google.com/abc'],
        ['backup_url', 'https://zoom.us/j/1'],
      ]),
    );
    expect(payload?.slots).toEqual([{ day: 2, time: '21:00' }, { day: 5, time: '21:00' }]);
    expect(payload?.meeting_url).toBe('https://meet.google.com/abc');
    expect(payload?.duration_minutes).toBe(45);
  });
  it('needs at least one time and a main link; rejects odd links', () => {
    expect(meetingFromForm(form([['meeting_url', 'https://x.com']]))).toBeNull();
    expect(meetingFromForm(form([['slot_day', '1'], ['slot_time', '10:00']]))).toBeNull();
    expect(meetingFromForm(form([['slot_day', '1'], ['slot_time', '10:00'], ['meeting_url', 'javascript:alert(1)']]))).toBeNull();
  });
});

describe('calendar feed', () => {
  it('writes one weekly event per slot with the backup link and a 15-minute alarm', () => {
    const lines = meetingIcsEvents({ ...meeting, skip_dates: ['2026-11-20'], project: 'Lumiere' }, { stamp: '20261116T030000Z', href: 'https://x/team', now: NOW });
    const text = lines.join('\n');
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(text).toContain('DTSTART;TZID=Asia/Bangkok:20261117T210000');
    expect(text).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU');
    expect(text).toContain('RRULE:FREQ=WEEKLY;BYDAY=FR');
    expect(text).toContain('EXDATE;TZID=Asia/Bangkok:20261120T210000');
    expect(text).toContain('Backup: https://zoom.us/j/123');
    expect(text).toContain('TRIGGER:-PT15M');
  });
});

import { daysLeft, meetingCalendarEvents, meetingEnded, sessionsBetween } from '../../src/lib/meetings';

describe('meeting end date', () => {
  const base = {
    id: 'm1',
    project_id: 'p1',
    title: 'Sync',
    slots: [{ day: 2, time: '21:00' }, { day: 5, time: '21:00' }],
    time_zone: 'Asia/Bangkok',
    duration_minutes: 60,
    meeting_url: 'https://meet.example/x',
    backup_url: '',
    notes: '',
    skip_dates: [],
  };
  // Monday 16 Nov 2026, 10:00 Bangkok.
  const now = Date.parse('2026-11-16T03:00:00Z');

  it('defaults to 30 days from today', () => {
    const form = new FormData();
    form.append('slot_day', '2');
    form.append('slot_time', '21:00');
    form.set('meeting_url', 'https://meet.example/x');
    expect(meetingFromForm(form, now)?.ends_on).toBe('2026-12-16');
    form.set('ends_on', '2026-12-01');
    expect(meetingFromForm(form, now)?.ends_on).toBe('2026-12-01');
  });
  it('stops sessions after the end date', () => {
    const rows = sessionsBetween({ ...base, ends_on: '2026-11-24' }, '2026-11-16', '2026-12-31');
    expect(rows.map((o) => o.localDate)).toEqual(['2026-11-17', '2026-11-20', '2026-11-24']);
  });
  it('knows days left and when it has ended', () => {
    expect(daysLeft({ ...base, ends_on: '2026-11-18' }, now)).toBe(3);
    expect(meetingEnded({ ...base, ends_on: '2026-11-15' }, now)).toBe(true);
    expect(daysLeft({ ...base, ends_on: '2026-11-15' }, now)).toBe(0);
  });
  it('draws one calendar chip per session', () => {
    const chips = meetingCalendarEvents([{ ...base, ends_on: '2026-11-30' }], '2026-11-01', '2026-12-05');
    expect(chips.map((c) => c.date)).toEqual(['2026-11-03', '2026-11-06', '2026-11-10', '2026-11-13', '2026-11-17', '2026-11-20', '2026-11-24', '2026-11-27']);
    expect(chips[0].kind).toBe('meeting');
    expect(chips[0].chip).toBe('9:00 PM Sync');
  });
});

describe('meeting start', () => {
  it('has no sessions before the series was set up', () => {
    const meeting = {
      id: 'm', project_id: 'p', title: 'Sync', slots: [{ day: 1, time: '21:00' }], time_zone: 'Asia/Bangkok',
      duration_minutes: 60, meeting_url: 'https://x', backup_url: '', notes: '', skip_dates: [],
      created_at: '2026-11-10T05:00:00Z', ends_on: '2026-11-30',
    };
    expect(sessionsBetween(meeting, '2026-11-01', '2026-11-30').map((o) => o.localDate)).toEqual(['2026-11-16', '2026-11-23', '2026-11-30']);
  });
});
