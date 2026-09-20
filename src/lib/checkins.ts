import type { SupabaseClient } from '@supabase/supabase-js';

export type ProjectCheckin = {
  id: string;
  project_id: string;
  author_email: string;
  body: string;
  created_at: string;
};

export function latestByProject(rows: ProjectCheckin[]) {
  const map = new Map<string, ProjectCheckin>();
  for (const row of rows) {
    if (!map.has(row.project_id)) map.set(row.project_id, row);
  }
  return map;
}

export async function addCheckin(
  supabase: SupabaseClient,
  form: FormData,
  projectId: string,
  authorEmail: string,
) {
  const body = String(form.get('body') ?? '').trim().slice(0, 400);
  if (!body || !authorEmail) return { error: 'invalid' as const };
  const { error } = await supabase.from('project_checkins').insert({
    project_id: projectId,
    author_email: authorEmail,
    body,
  });
  if (error) {
    console.error(error.message);
    return { error: 'invalid' as const };
  }
  return { error: null };
}

export async function removeCheckin(supabase: SupabaseClient, checkinId: string, projectId: string) {
  if (!checkinId) return { error: 'invalid' as const };
  const { error } = await supabase.from('project_checkins').delete().eq('id', checkinId).eq('project_id', projectId);
  if (error) return { error: 'invalid' as const };
  return { error: null };
}
