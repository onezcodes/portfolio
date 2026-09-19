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
