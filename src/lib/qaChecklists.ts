import type { SupabaseClient } from '@supabase/supabase-js';
import { qaEmailsForProject } from './tasks';

export type QaChecklist = {
  id: string;
  project_id: string;
  title: string;
  notes: string;
  created_by_email: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QaCheck = {
  id: string;
  checklist_id: string;
  project_id: string;
  title: string;
  assignee_email: string;
  done: boolean;
  sort_order: number;
  checked_at: string | null;
  created_at: string;
};

export type QaChecklistBundle = QaChecklist & {
  checks: QaCheck[];
  total: number;
  doneCount: number;
  waitingOn: string[];
};

function checklistLines(form: FormData, key = 'items') {
  return String(form.get(key) ?? '')
    .split('\n')
    .map((line) => line.replace(/^[-*•\s]+/, '').trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 40);
}

function fanOutRows(checklistId: string, titles: string[], qas: string[], baseSort = 0) {
  const rows: { checklist_id: string; title: string; assignee_email: string; sort_order: number }[] = [];
  let order = baseSort;
  for (const title of titles) {
    for (const email of qas) {
      rows.push({ checklist_id: checklistId, title, assignee_email: email, sort_order: order++ });
    }
  }
  return rows;
}

export async function listQaChecklists(supabase: SupabaseClient, projectId: string): Promise<QaChecklistBundle[]> {
  const [{ data: lists }, { data: checks }] = await Promise.all([
    supabase
      .from('project_qa_checklists')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_qa_checks')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order'),
  ]);
  const byList = new Map<string, QaCheck[]>();
  for (const row of (checks ?? []) as QaCheck[]) {
    const list = byList.get(row.checklist_id) ?? [];
    list.push(row);
    byList.set(row.checklist_id, list);
  }
  return ((lists ?? []) as QaChecklist[]).map((list) => {
    const rows = byList.get(list.id) ?? [];
    const doneCount = rows.filter((row) => row.done).length;
    const waitingOn = [...new Set(rows.filter((row) => !row.done).map((row) => row.assignee_email))];
    return { ...list, checks: rows, total: rows.length, doneCount, waitingOn };
  });
}

export async function createQaChecklist(
  supabase: SupabaseClient,
  form: FormData,
  projectId: string,
  actorEmail: string,
) {
  const title = String(form.get('title') ?? '').trim().slice(0, 200);
  const notes = String(form.get('notes') ?? '').trim().slice(0, 2000);
  const items = checklistLines(form);
  if (!title || items.length === 0) return { error: 'invalid' as const, assignees: [] as string[] };
  const qas = await qaEmailsForProject(supabase, projectId);
  if (qas.length === 0) return { error: 'no-qa' as const, assignees: [] as string[] };

  const { data: list, error } = await supabase
    .from('project_qa_checklists')
    .insert({ project_id: projectId, title, notes, created_by_email: actorEmail })
    .select('id, title')
    .maybeSingle();
  if (error || !list) {
    console.error('qa checklist create failed', error?.message);
    return { error: 'invalid' as const, assignees: [] as string[] };
  }

  const rows = fanOutRows(String(list.id), items, qas);
  const { error: checkError } = await supabase.from('project_qa_checks').insert(rows);
  if (checkError) {
    console.error('qa checks create failed', checkError.message);
    await supabase.from('project_qa_checklists').delete().eq('id', list.id);
    return { error: 'invalid' as const, assignees: [] as string[] };
  }
  return {
    error: null,
    id: String(list.id),
    title: String(list.title),
    count: rows.length,
    assignees: qas,
  };
}

export async function addQaItems(supabase: SupabaseClient, form: FormData, projectId: string) {
  const checklistId = String(form.get('checklist_id') ?? '');
  const items = checklistLines(form, 'items').length
    ? checklistLines(form, 'items')
    : checklistLines(form, 'item_title');
  if (!checklistId || items.length === 0) return { error: 'invalid' as const, assignees: [] as string[] };

  const { data: list } = await supabase
    .from('project_qa_checklists')
    .select('id')
    .eq('id', checklistId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (!list) return { error: 'invalid' as const, assignees: [] as string[] };

  const qas = await qaEmailsForProject(supabase, projectId);
  if (qas.length === 0) return { error: 'no-qa' as const, assignees: [] as string[] };

  const { data: last } = await supabase
    .from('project_qa_checks')
    .select('sort_order')
    .eq('checklist_id', checklistId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const rows = fanOutRows(checklistId, items, qas, (last?.sort_order ?? -1) + 1);
  const { error } = await supabase.from('project_qa_checks').insert(rows);
  if (error) {
    console.error('qa items add failed', error.message);
    return { error: 'invalid' as const, assignees: [] as string[] };
  }
  return { error: null, count: rows.length, assignees: qas, checklistId };
}

export async function createQaChecklistFromTemplate(
  supabase: SupabaseClient,
  form: FormData,
  projectId: string,
  actorEmail: string,
) {
  const templateId = String(form.get('template_id') ?? '');
  const titleOverride = String(form.get('title') ?? '').trim().slice(0, 200);
  if (!templateId) return { error: 'invalid' as const, assignees: [] as string[] };
  const { data } = await supabase
    .from('studio_templates')
    .select('name, body')
    .eq('id', templateId)
    .eq('kind', 'checklist')
    .maybeSingle();
  const items = ((data?.body as { items?: string[] } | undefined)?.items ?? [])
    .map((item) => String(item).trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 40);
  if (!data || items.length === 0) return { error: 'invalid' as const, assignees: [] as string[] };
  const next = new FormData();
  next.set('title', titleOverride || String(data.name).slice(0, 200));
  next.set('items', items.join('\n'));
  return createQaChecklist(supabase, next, projectId, actorEmail);
}

export async function toggleQaCheck(
  supabase: SupabaseClient,
  form: FormData,
  projectId: string,
  actorEmail: string,
  canPlan: boolean,
) {
  const checkId = String(form.get('check_id') ?? '');
  if (!checkId) return { error: 'invalid' as const };
  const done = String(form.get('done') ?? '') === '1';
  const { data: current } = await supabase
    .from('project_qa_checks')
    .select('id, checklist_id, title, assignee_email')
    .eq('id', checkId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (!current) return { error: 'invalid' as const };
  if (current.assignee_email !== actorEmail && !canPlan) return { error: 'forbidden' as const };
  const { data, error } = await supabase
    .from('project_qa_checks')
    .update({ done })
    .eq('id', checkId)
    .eq('project_id', projectId)
    .select('checklist_id, title, assignee_email')
    .maybeSingle();
  return error
    ? { error: 'invalid' as const }
    : {
        error: null,
        done,
        checklistId: String(data?.checklist_id ?? ''),
        title: String(data?.title ?? ''),
        assignee_email: String(data?.assignee_email ?? ''),
      };
}

export async function removeQaCheck(supabase: SupabaseClient, form: FormData, projectId: string) {
  const checkId = String(form.get('check_id') ?? '');
  if (!checkId) return { error: 'invalid' as const };
  const { error, count } = await supabase
    .from('project_qa_checks')
    .delete({ count: 'exact' })
    .eq('id', checkId)
    .eq('project_id', projectId);
  return error || !count ? { error: 'invalid' as const } : { error: null };
}

export async function removeQaChecklist(supabase: SupabaseClient, form: FormData, projectId: string) {
  const checklistId = String(form.get('checklist_id') ?? '');
  if (!checklistId) return { error: 'invalid' as const };
  const { error, count } = await supabase
    .from('project_qa_checklists')
    .delete({ count: 'exact' })
    .eq('id', checklistId)
    .eq('project_id', projectId);
  return error || !count ? { error: 'invalid' as const } : { error: null };
}
