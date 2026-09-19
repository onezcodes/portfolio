import type { SupabaseClient } from '@supabase/supabase-js';

export type MilestoneStatus = 'pending' | 'current' | 'done';

export type Milestone = {
  id: string;
  project_id: string;
  title: string;
  estimated_on: string | null;
  status: MilestoneStatus;
  sort_order: number;
  notes: string;
  created_at: string;
};

const statuses = new Set<MilestoneStatus>(['pending', 'current', 'done']);

export function currentStage(milestones: Milestone[]) {
  return (
    milestones.find((row) => row.status === 'current') ??
    milestones.find((row) => row.status !== 'done') ??
    milestones.at(-1) ??
    null
  );
}

export function stageLabel(milestones: Milestone[]) {
  const stage = currentStage(milestones);
  if (!stage) return 'No stages yet';
  if (milestones.every((row) => row.status === 'done')) return `Done · ${stage.title}`;
  const due = stage.estimated_on ? ` · est. ${stage.estimated_on}` : '';
  return `${stage.title}${due}`;
}

export function milestoneProgress(milestones: Milestone[]) {
  if (milestones.length === 0) return 0;
  return Math.round((milestones.filter((row) => row.status === 'done').length / milestones.length) * 100);
}

export function sortMilestones<T extends { estimated_on: string | null; sort_order: number; title?: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    if (a.estimated_on && b.estimated_on && a.estimated_on !== b.estimated_on) {
      return a.estimated_on.localeCompare(b.estimated_on);
    }
    if (a.estimated_on && !b.estimated_on) return -1;
    if (!a.estimated_on && b.estimated_on) return 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return (a.title ?? '').localeCompare(b.title ?? '');
  });
}

async function syncSortOrder(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase.from('project_milestones').select('*').eq('project_id', projectId);
  const ordered = sortMilestones((data ?? []) as Milestone[]);
  for (const [index, row] of ordered.entries()) {
    if (row.sort_order === index) continue;
    const { error } = await supabase
      .from('project_milestones')
      .update({ sort_order: index })
      .eq('id', row.id)
      .eq('project_id', projectId);
    if (error) console.error(error.message);
  }
  return ordered;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export const defaultStages = ['Brief', 'Design', 'Build', 'Review', 'Launch'];

export async function addMilestone(supabase: SupabaseClient, form: FormData, projectId: string) {
  const title = String(form.get('title') ?? '').trim();
  if (!title) return { error: 'invalid' as const };
  const estimated_on = String(form.get('estimated_on') ?? '').trim() || null;

  const { data: rows } = await supabase
    .from('project_milestones')
    .select('sort_order, status')
    .eq('project_id', projectId)
    .order('sort_order');
  const existing = rows ?? [];
  const hasCurrent = existing.some((row) => row.status === 'current');
  const sort_order = existing.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;

  const { error } = await supabase.from('project_milestones').insert({
    project_id: projectId,
    title,
    estimated_on,
    notes: String(form.get('notes') ?? '').trim(),
    sort_order,
    status: hasCurrent ? 'pending' : 'current',
  });
  if (error) {
    console.error(error.message);
    return { error: 'invalid' as const };
  }
  await syncSortOrder(supabase, projectId);
  return { error: null };
}

export async function seedMilestones(supabase: SupabaseClient, projectId: string, startedOn: string | null) {
  const { count } = await supabase
    .from('project_milestones')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if ((count ?? 0) > 0) return { error: 'invalid' as const };

  const start = startedOn || new Date().toISOString().slice(0, 10);
  const rows = defaultStages.map((title, index) => ({
    project_id: projectId,
    title,
    estimated_on: addDays(start, (index + 1) * 14),
    sort_order: index,
    status: index === 0 ? 'current' : 'pending',
  }));
  const { error } = await supabase.from('project_milestones').insert(rows);
  if (error) {
    console.error(error.message);
    return { error: 'invalid' as const };
  }
  return { error: null };
}

export async function setMilestoneStatus(
  supabase: SupabaseClient,
  projectId: string,
  milestoneId: string,
  status: MilestoneStatus,
) {
  if (!statuses.has(status)) return { error: 'invalid' as const };

  const { data: rows } = await supabase
    .from('project_milestones')
    .select('*')
    .eq('project_id', projectId);
  const list = sortMilestones((rows ?? []) as Milestone[]);
  const target = list.find((row) => row.id === milestoneId);
  if (!target) return { error: 'invalid' as const };
  const index = list.findIndex((row) => row.id === milestoneId);

  if (status === 'current') {
    const updates = list.map((row, i) => {
      if (i < index) return { ...row, status: 'done' as const };
      if (row.id === target.id) return { ...row, status: 'current' as const };
      return { ...row, status: row.status === 'done' ? ('done' as const) : ('pending' as const) };
    });
    for (const row of updates) {
      const { error } = await supabase
        .from('project_milestones')
        .update({ status: row.status })
        .eq('id', row.id)
        .eq('project_id', projectId);
      if (error) return { error: 'invalid' as const };
    }
    return { error: null };
  }

  if (status === 'done') {
    const { error } = await supabase
      .from('project_milestones')
      .update({ status: 'done' })
      .eq('id', milestoneId)
      .eq('project_id', projectId);
    if (error) return { error: 'invalid' as const };
    if (target.status === 'current') {
      const next = list.find((row, i) => i > index && row.status !== 'done');
      if (next) {
        await supabase.from('project_milestones').update({ status: 'current' }).eq('id', next.id).eq('project_id', projectId);
      }
    }
    return { error: null };
  }

  const { error } = await supabase
    .from('project_milestones')
    .update({ status: 'pending' })
    .eq('id', milestoneId)
    .eq('project_id', projectId);
  if (error) return { error: 'invalid' as const };
  const stillCurrent = list.some((row) => row.id !== milestoneId && row.status === 'current');
  if (!stillCurrent) {
    await supabase.from('project_milestones').update({ status: 'current' }).eq('id', milestoneId).eq('project_id', projectId);
  }
  return { error: null };
}

export async function updateMilestone(supabase: SupabaseClient, form: FormData, projectId: string) {
  const milestoneId = String(form.get('milestone_id') ?? '');
  const title = String(form.get('title') ?? '').trim();
  if (!milestoneId || !title) return { error: 'invalid' as const };
  const { error } = await supabase
    .from('project_milestones')
    .update({
      title,
      estimated_on: String(form.get('estimated_on') ?? '').trim() || null,
      notes: String(form.get('notes') ?? '').trim(),
    })
    .eq('id', milestoneId)
    .eq('project_id', projectId);
  if (error) {
    console.error(error.message);
    return { error: 'invalid' as const };
  }
  await syncSortOrder(supabase, projectId);
  return { error: null };
}

export async function removeMilestone(supabase: SupabaseClient, milestoneId: string, projectId: string) {
  const { data } = await supabase
    .from('project_milestones')
    .select('status')
    .eq('id', milestoneId)
    .eq('project_id', projectId)
    .maybeSingle();
  const { error } = await supabase.from('project_milestones').delete().eq('id', milestoneId).eq('project_id', projectId);
  if (error) return { error: 'invalid' as const };
  if (data?.status === 'current') {
    const ordered = await syncSortOrder(supabase, projectId);
    const next = ordered.find((row) => row.status !== 'done');
    if (next?.id) {
      await supabase.from('project_milestones').update({ status: 'current' }).eq('id', next.id).eq('project_id', projectId);
    }
  } else {
    await syncSortOrder(supabase, projectId);
  }
  return { error: null };
}

export function stagesByProject(rows: Pick<Milestone, 'project_id' | 'title' | 'status' | 'estimated_on' | 'sort_order'>[]) {
  const map = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = map.get(row.project_id) ?? [];
    list.push(row);
    map.set(row.project_id, list);
  }
  const labels = new Map<string, string>();
  for (const [projectId, list] of map) {
    const ordered = sortMilestones(list);
    labels.set(projectId, stageLabel(ordered as Milestone[]));
  }
  return labels;
}
