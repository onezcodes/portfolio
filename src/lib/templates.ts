import type { SupabaseClient } from '@supabase/supabase-js';
import { sortMilestones, type Milestone } from './milestones';
import type { ProjectTask } from './tasks';

/* Reusable project plans (stages + starter tasks) and checklists (subtasks). */

export type ProjectTemplateBody = {
  stages: { title: string; days: number }[];
  tasks?: { title: string; stage?: number; days?: number; priority?: string }[];
};
export type ChecklistTemplateBody = { items: string[] };

export type StudioTemplate = {
  id: string;
  kind: 'project' | 'checklist';
  name: string;
  body: ProjectTemplateBody | ChecklistTemplateBody;
  created_by: string;
  created_at: string;
};

export async function listTemplates(supabase: SupabaseClient, kind?: 'project' | 'checklist') {
  let query = supabase.from('studio_templates').select('*').order('name');
  if (kind) query = query.eq('kind', kind);
  const { data, error } = await query;
  return error ? [] : ((data ?? []) as StudioTemplate[]);
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
};

/** Create stages and starter tasks on a new, empty project. */
export async function applyProjectTemplate(
  supabase: SupabaseClient,
  projectId: string,
  templateId: string,
  startedOn: string | null,
  actorEmail: string,
) {
  const { data } = await supabase.from('studio_templates').select('*').eq('id', templateId).eq('kind', 'project').maybeSingle();
  const template = data as StudioTemplate | null;
  if (!template) return { error: 'invalid' as const };
  const body = template.body as ProjectTemplateBody;
  const start = startedOn || new Date().toISOString().slice(0, 10);
  const stages = (body.stages ?? []).slice(0, 20);
  const { data: inserted, error } = await supabase
    .from('project_milestones')
    .insert(
      stages.map((stage, index) => ({
        project_id: projectId,
        title: String(stage.title).slice(0, 120),
        estimated_on: addDays(start, Number(stage.days) || (index + 1) * 14),
        sort_order: index,
        status: index === 0 ? 'current' : 'pending',
      })),
    )
    .select('id, sort_order');
  if (error) {
    console.error('template stages failed', error.message);
    return { error: 'invalid' as const };
  }
  const stageIds = new Map((inserted ?? []).map((row) => [Number(row.sort_order), String(row.id)]));
  const tasks = (body.tasks ?? []).slice(0, 60);
  if (tasks.length > 0) {
    const { error: taskError } = await supabase.from('project_tasks').insert(
      tasks.map((task, index) => ({
        project_id: projectId,
        title: String(task.title).slice(0, 200),
        milestone_id: task.stage !== undefined ? (stageIds.get(task.stage) ?? null) : null,
        due_on: task.days !== undefined ? addDays(start, task.days) : null,
        priority: ['high', 'medium', 'low'].includes(String(task.priority)) ? task.priority : '',
        sort_order: index,
        created_by_email: actorEmail,
      })),
    );
    if (taskError) console.error('template tasks failed', taskError.message);
  }
  return { error: null };
}

/** Save an existing project's plan as a template (dates kept relative to its start). */
export async function saveProjectAsTemplate(
  supabase: SupabaseClient,
  projectId: string,
  name: string,
  actorEmail: string,
) {
  const [{ data: project }, { data: stageRows }, { data: taskRows }] = await Promise.all([
    supabase.from('projects').select('started_on').eq('id', projectId).maybeSingle(),
    supabase.from('project_milestones').select('*').eq('project_id', projectId),
    supabase.from('project_tasks').select('title, milestone_id, due_on, priority, kind').eq('project_id', projectId),
  ]);
  const stages = sortMilestones((stageRows ?? []) as Milestone[]);
  const start =
    (project?.started_on as string | null) ??
    stages.find((s) => s.estimated_on)?.estimated_on ??
    new Date().toISOString().slice(0, 10);
  const offset = (iso: string | null) =>
    iso ? Math.max(0, Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000)) : undefined;
  const body: ProjectTemplateBody = {
    stages: stages.map((s, i) => ({ title: s.title, days: offset(s.estimated_on) ?? (i + 1) * 14 })),
    tasks: ((taskRows ?? []) as Pick<ProjectTask, 'title' | 'milestone_id' | 'due_on' | 'priority' | 'kind'>[])
      .filter((t) => t.kind !== 'bug')
      .slice(0, 60)
      .map((t) => ({
        title: t.title,
        stage: t.milestone_id ? stages.findIndex((s) => s.id === t.milestone_id) : undefined,
        days: offset(t.due_on),
        priority: t.priority || undefined,
      })),
  };
  const { error } = await supabase
    .from('studio_templates')
    .insert({ kind: 'project', name: name.slice(0, 80), body, created_by: actorEmail });
  if (error) return { error: error.code === '23505' ? ('template-duplicate' as const) : ('invalid' as const) };
  return { error: null };
}

/** Add a checklist template's items as subtasks. */
export async function applyChecklist(supabase: SupabaseClient, taskId: string, templateId: string) {
  const { data } = await supabase.from('studio_templates').select('body').eq('id', templateId).eq('kind', 'checklist').maybeSingle();
  const items = ((data?.body as ChecklistTemplateBody | undefined)?.items ?? []).slice(0, 40);
  if (!taskId || items.length === 0) return { error: 'invalid' as const, count: 0 };
  const { data: last } = await supabase
    .from('task_subtasks')
    .select('sort_order')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const base = (last?.sort_order ?? -1) + 1;
  const { error } = await supabase
    .from('task_subtasks')
    .insert(items.map((title, i) => ({ task_id: taskId, title: String(title).slice(0, 300), sort_order: base + i })));
  return error ? { error: 'invalid' as const, count: 0 } : { error: null, count: items.length };
}

export async function createChecklistTemplate(supabase: SupabaseClient, form: FormData, actorEmail: string) {
  const name = String(form.get('name') ?? '').trim().slice(0, 80);
  const items = String(form.get('items') ?? '')
    .split('\n')
    .map((line) => line.replace(/^[-*•\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 40);
  if (!name || items.length === 0) return { error: 'invalid' as const };
  const { error } = await supabase
    .from('studio_templates')
    .insert({ kind: 'checklist', name, body: { items }, created_by: actorEmail });
  if (error) return { error: error.code === '23505' ? ('template-duplicate' as const) : ('invalid' as const) };
  return { error: null };
}
