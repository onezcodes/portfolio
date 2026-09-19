import type { User } from '@supabase/supabase-js';
import type { TeamMember } from './ledger';

export function oauthName(user: User | null) {
  const meta = user?.user_metadata ?? {};
  return String(meta.full_name || meta.name || meta.user_name || '').trim();
}

export function oauthAvatar(user: User | null) {
  const meta = user?.user_metadata ?? {};
  return String(meta.avatar_url || meta.picture || '').trim();
}

export type PersonFace = {
  email: string;
  name: string;
  avatarUrl: string;
};

export function personInitial(name: string, email = '') {
  const fromName = name.trim();
  if (fromName && !fromName.includes('@')) return fromName.slice(0, 1).toUpperCase();
  return (email || fromName).slice(0, 1).toUpperCase() || '?';
}

export function personFace(
  email: string,
  people: Pick<TeamMember, 'email' | 'display_name' | 'avatar_url'>[] = [],
  fallbackAvatar = '',
): PersonFace {
  const row = people.find((person) => person.email === email);
  const name = row?.display_name?.trim() || email;
  return {
    email,
    name,
    avatarUrl: (row?.avatar_url || fallbackAvatar).trim(),
  };
}

export function sharedFaces(
  emails: string[],
  people: Pick<TeamMember, 'email' | 'display_name' | 'avatar_url'>[] = [],
  extras: PersonFace[] = [],
) {
  const faces: PersonFace[] = [];
  const seen = new Set<string>();
  for (const person of extras) {
    if (!person.email || seen.has(person.email)) continue;
    seen.add(person.email);
    faces.push(person);
  }
  for (const email of emails) {
    if (!email || seen.has(email)) continue;
    seen.add(email);
    faces.push(personFace(email, people));
  }
  return faces;
}

export function personLabel(
  email: string,
  people: Pick<TeamMember, 'email' | 'display_name'>[] = [],
  user?: User | null,
) {
  const saved = people.find((row) => row.email === email)?.display_name?.trim();
  if (saved) return saved;
  if (user && user.email?.trim().toLowerCase() === email) {
    return oauthName(user) || email;
  }
  return email;
}
