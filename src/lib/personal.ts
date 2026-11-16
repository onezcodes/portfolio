import type { SupabaseClient } from '@supabase/supabase-js';

/** One person's private note or to-do on a project. Only the author can see it (RLS). */
export type PersonalItem = {
  id: string;
  project_id: string;
  email: string;
  kind: 'note' | 'todo';
  body: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
  updated_at: string;
};

export const PERSONAL_MAX = 4000;

export function personalKind(raw: unknown): PersonalItem['kind'] {
  return raw === 'note' ? 'note' : 'todo';
}

/** Open to-dos first (newest first), then done ones (most recently finished first). */
export function splitPersonal(items: PersonalItem[]) {
  const todos = items.filter((item) => item.kind === 'todo');
  return {
    open: todos.filter((item) => !item.done).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    done: todos
      .filter((item) => item.done)
      .sort((a, b) => (b.done_at ?? b.updated_at).localeCompare(a.done_at ?? a.updated_at)),
    notes: items.filter((item) => item.kind === 'note').sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  };
}

export async function personalItems(supabase: SupabaseClient, projectId: string, email: string) {
  if (!email) return [];
  const { data, error } = await supabase
    .from('project_personal_items')
    .select('*')
    .eq('project_id', projectId)
    .eq('email', email);
  if (error) {
    if (error.code !== '42P01' && error.code !== 'PGRST205') console.error('personal items lookup failed', error.message);
    return [];
  }
  return (data ?? []) as PersonalItem[];
}

/** Handles the mine-* intents. Returns false when the form is invalid. */
export async function handlePersonal(supabase: SupabaseClient, intent: string, form: FormData, projectId: string) {
  const itemId = String(form.get('item_id') ?? '');
  const body = String(form.get('body') ?? '').trim().slice(0, PERSONAL_MAX);
  const scoped = (query: ReturnType<ReturnType<SupabaseClient['from']>['update']>) =>
    query.eq('id', itemId).eq('project_id', projectId);

  if (intent === 'mine-add') {
    if (!body) return false;
    const { error } = await supabase
      .from('project_personal_items')
      .insert({ project_id: projectId, kind: personalKind(form.get('kind')), body });
    if (error) console.error('personal add failed', error.message);
    return !error;
  }
  if (!itemId) return false;
  if (intent === 'mine-toggle') {
    const done = String(form.get('done') ?? '') === '1';
    const { error } = await scoped(
      supabase.from('project_personal_items').update({ done, done_at: done ? new Date().toISOString() : null }),
    );
    return !error;
  }
  if (intent === 'mine-edit') {
    if (!body) return false;
    const { error } = await scoped(supabase.from('project_personal_items').update({ body }));
    return !error;
  }
  if (intent === 'mine-delete') {
    const { error } = await supabase.from('project_personal_items').delete().eq('id', itemId).eq('project_id', projectId);
    return !error;
  }
  return false;
}

export async function clearDonePersonal(supabase: SupabaseClient, projectId: string) {
  const { error } = await supabase
    .from('project_personal_items')
    .delete()
    .eq('project_id', projectId)
    .eq('kind', 'todo')
    .eq('done', true);
  return !error;
}
