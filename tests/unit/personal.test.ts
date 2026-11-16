import { describe, expect, it } from 'vitest';
import { personalKind, splitPersonal, type PersonalItem } from '../../src/lib/personal';

const item = (over: Partial<PersonalItem>): PersonalItem => ({
  id: Math.random().toString(36),
  project_id: 'p',
  email: 'me@x.com',
  kind: 'todo',
  body: 'x',
  done: false,
  done_at: null,
  created_at: '2026-11-16T01:00:00Z',
  updated_at: '2026-11-16T01:00:00Z',
  ...over,
});

describe('private notes and to-dos', () => {
  it('defaults unknown kinds to a to-do', () => {
    expect(personalKind('note')).toBe('note');
    expect(personalKind('anything')).toBe('todo');
  });
  it('splits open to-dos, done to-dos, and notes', () => {
    const rows = [
      item({ body: 'old', created_at: '2026-11-15T00:00:00Z' }),
      item({ body: 'new', created_at: '2026-11-16T05:00:00Z' }),
      item({ body: 'finished', done: true, done_at: '2026-11-16T06:00:00Z' }),
      item({ body: 'idea', kind: 'note' }),
    ];
    const { open, done, notes } = splitPersonal(rows);
    expect(open.map((r) => r.body)).toEqual(['new', 'old']);
    expect(done.map((r) => r.body)).toEqual(['finished']);
    expect(notes.map((r) => r.body)).toEqual(['idea']);
  });
});
