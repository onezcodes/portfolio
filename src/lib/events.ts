import type { TeamSupabase } from './supabase';

export type StudioEvent = {
  id: string;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  project_id: string | null;
  detail: string;
  created_at: string;
};

export async function logEvent(
  supabase: TeamSupabase,
  actorEmail: string,
  input: {
    action: string;
    entityType: string;
    entityId?: string;
    projectId?: string | null;
    detail?: string;
  },
) {
  if (!actorEmail) return;
  const { error } = await supabase.from('studio_events').insert({
    actor_email: actorEmail,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? '',
    project_id: input.projectId ?? null,
    detail: (input.detail ?? '').slice(0, 400),
  });
  if (error) console.error('event log failed', error.message);
}

export function eventHref(row: StudioEvent) {
  if (row.entity_type === 'credential' && row.entity_id) return `/team/credentials/${row.entity_id}`;
  if (row.entity_type === 'checkin' && row.project_id) return `/team/projects/${row.project_id}?tab=schedule#checkin`;
  if (row.entity_type === 'task' && row.project_id) return `/team/projects/${row.project_id}?tab=schedule`;
  if (row.project_id) return `/team/projects/${row.project_id}`;
  if (row.entity_type === 'project' && row.entity_id) return `/team/projects/${row.entity_id}`;
  if (row.entity_type === 'profile') return '/team/profile';
  if (row.entity_type === 'member') return '/team/members';
  if (row.entity_type === 'ledger') return '/team/ledger';
  return '/team/activity';
}

const titles: Record<string, string> = {
  'credential.create': 'Added credentials',
  'credential.update': 'Updated credentials',
  'credential.delete': 'Deleted credentials',
  'credential.access': 'Changed vault access',
  'credential.reveal': 'Revealed a secret',
  'project.create': 'Created a project',
  'project.update': 'Updated a project',
  'project.delete': 'Deleted a project',
  'project.member_add': 'Added a person',
  'project.member_update': 'Changed roles',
  'project.member_remove': 'Removed a person',
  'ledger.create': 'Added a ledger entry',
  'ledger.delete': 'Removed a ledger entry',
  'contribution.create': 'Recorded funding',
  'contribution.delete': 'Removed funding',
  'milestone.create': 'Added a stage',
  'milestone.update': 'Updated a stage',
  'milestone.status': 'Changed stage status',
  'milestone.delete': 'Removed a stage',
  'task.create': 'Added a task',
  'task.update': 'Updated a task',
  'task.status': 'Changed task status',
  'task.delete': 'Removed a task',
  'checkin.create': 'Posted a check-in',
  'checkin.delete': 'Removed a check-in',
  'member.add': 'Whitelisted an email',
  'member.remove': 'Removed a team email',
  'member.invite': 'Sent a team invite',
  'profile.update': 'Updated their profile',
};

export function eventTitle(row: StudioEvent) {
  return titles[`${row.entity_type}.${row.action}`] ?? `${row.action} ${row.entity_type}`;
}

export function formatEventTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
