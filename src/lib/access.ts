import type { User } from '@supabase/supabase-js';
import { oauthAvatar, oauthName } from './profile';
import { emailOf, isSuperAdmin, type TeamSupabase } from './supabase';

export const PROJECT_ROLES = ['lead', 'manager', 'collaborator', 'developer', 'qa'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_TABS = ['schedule', 'funding', 'ledger', 'details', 'people'] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

export const ROLE_META: { id: ProjectRole; label: string; hint: string }[] = [
  { id: 'lead', label: 'Lead', hint: 'People, schedule, money, and details' },
  { id: 'manager', label: 'Manager', hint: 'Plan stages and edit details' },
  { id: 'collaborator', label: 'Collaborator', hint: 'Funding and ledger' },
  { id: 'developer', label: 'Developer', hint: 'See the plan and mark stages done' },
  { id: 'qa', label: 'QA', hint: 'See the plan and mark test stages done' },
];

export type ProjectCaps = {
  assigned: boolean;
  lead: boolean;
  canSchedule: boolean;
  canPlan: boolean;
  canProgress: boolean;
  canFinance: boolean;
  canDetails: boolean;
  canEditDetails: boolean;
  canPeople: boolean;
  canDelete: boolean;
  tabs: { id: ProjectTab; label: string }[];
  defaultTab: ProjectTab;
  roleLabels: string[];
};

export type StudioAccess = {
  ok: boolean;
  email: string;
  superAdmin: boolean;
  canLedger: boolean;
  canVault: boolean;
  displayName: string;
  jobTitle: string;
  avatarUrl: string;
  byProject: Map<string, ProjectRole[]>;
};

export type ProjectMemberRow = {
  email: string;
  roles: string[] | null;
};

export function isProjectRole(value: string): value is ProjectRole {
  return PROJECT_ROLES.includes(value as ProjectRole);
}

export function parseRoles(raw: unknown): ProjectRole[] {
  const list = Array.isArray(raw) ? raw.map(String) : [];
  return PROJECT_ROLES.filter((role) => list.includes(role));
}

export function rolesFromForm(form: FormData) {
  return parseRoles(form.getAll('roles').map(String));
}

export function capsFromRoles(roles: ProjectRole[], superAdmin = false): ProjectCaps {
  const set = new Set(roles);
  const lead = superAdmin || set.has('lead');
  const canPlan = lead || set.has('manager');
  const canProgress = canPlan || set.has('developer') || set.has('qa');
  const canSchedule = canProgress;
  const canFinance = lead || set.has('collaborator');
  const canDetails = canSchedule;
  const canEditDetails = canPlan;
  const assigned = superAdmin || roles.length > 0;
  const tabs: { id: ProjectTab; label: string }[] = [];
  if (canSchedule) tabs.push({ id: 'schedule', label: 'Schedule' });
  if (canFinance) {
    tabs.push({ id: 'funding', label: 'Funding' });
    tabs.push({ id: 'ledger', label: 'Ledger' });
  }
  if (canDetails) tabs.push({ id: 'details', label: 'Details' });
  if (lead) tabs.push({ id: 'people', label: 'People' });

  return {
    assigned,
    lead,
    canSchedule,
    canPlan,
    canProgress,
    canFinance,
    canDetails,
    canEditDetails,
    canPeople: lead,
    canDelete: lead,
    tabs,
    defaultTab: tabs[0]?.id ?? 'schedule',
    roleLabels: superAdmin ? ['Super admin'] : ROLE_META.filter((item) => set.has(item.id)).map((item) => item.label),
  };
}

export function capsFor(studio: StudioAccess, projectId: string) {
  if (studio.superAdmin) return capsFromRoles(['lead', 'manager', 'collaborator', 'developer', 'qa'], true);
  return capsFromRoles(studio.byProject.get(projectId) ?? []);
}

export function pickTab(value: string | null, caps: ProjectCaps): ProjectTab {
  if (value && caps.tabs.some((tab) => tab.id === value)) return value as ProjectTab;
  return caps.defaultTab;
}

export function tabForIntent(intent: string): ProjectTab {
  if (intent.includes('member')) return 'people';
  if (intent.includes('milestone') || intent.includes('task') || intent.includes('checkin')) return 'schedule';
  if (intent.includes('funding') || intent.includes('contribution')) return 'funding';
  if (intent.includes('entry')) return 'ledger';
  return 'details';
}

export function allowedIntent(intent: string, caps: ProjectCaps) {
  if (intent.includes('member')) return caps.canPeople;
  if (
    intent === 'add-milestone' ||
    intent === 'seed-milestones' ||
    intent === 'update-milestone' ||
    intent === 'delete-milestone' ||
    intent === 'add-task' ||
    intent === 'update-task' ||
    intent === 'delete-task'
  ) {
    return caps.canPlan;
  }
  if (intent.includes('milestone') || intent.startsWith('task-')) return caps.canProgress;
  if (intent === 'add-checkin') return caps.canProgress;
  if (intent === 'delete-checkin') return caps.canProgress;
  if (intent.includes('funding') || intent.includes('contribution')) return caps.canFinance;
  if (intent.includes('entry')) return caps.canFinance;
  if (intent === 'delete') return caps.canDelete;
  if (intent === 'reveal') return caps.canDetails;
  if (intent === 'update') return caps.canEditDetails;
  return false;
}

export async function loadStudioAccess(supabase: TeamSupabase, user: User | null): Promise<StudioAccess> {
  const email = emailOf(user);
  const superAdmin = isSuperAdmin(user);
  const byProject = new Map<string, ProjectRole[]>();
  const empty = {
    ok: false,
    email,
    superAdmin,
    canLedger: false,
    canVault: false,
    displayName: oauthName(user) || email,
    jobTitle: '',
    avatarUrl: oauthAvatar(user),
    byProject,
  };
  if (!email) return empty;

  const [memberRows, profile, grants] = await Promise.all([
    superAdmin
      ? Promise.resolve({ data: [] as { project_id: string; roles: unknown }[], error: null })
      : supabase.from('project_members').select('project_id, roles').eq('email', email),
    supabase.from('team_members').select('display_name, job_title, avatar_url, last_seen_at').eq('email', email).maybeSingle(),
    superAdmin
      ? Promise.resolve({ count: 1, error: null })
      : supabase.from('studio_credential_access').select('credential_id', { count: 'exact', head: true }).eq('email', email),
  ]);

  if (memberRows.error) console.error('project_members lookup failed', memberRows.error.message);
  if (grants.error) console.error('credential access lookup failed', grants.error.message);

  for (const row of memberRows.data ?? []) {
    byProject.set(row.project_id as string, parseRoles(row.roles));
  }

  const ok = superAdmin || Boolean(profile.data);
  if (!ok) return empty;

  let displayName = oauthName(user);
  if (profile.data?.display_name?.trim()) displayName = profile.data.display_name.trim();
  const avatarUrl = oauthAvatar(user) || String(profile.data?.avatar_url ?? '').trim();
  const seenAt = String(profile.data?.last_seen_at ?? '');
  const seenStale = !seenAt || Date.now() - Date.parse(seenAt) > 6 * 60 * 60 * 1000;
  const patch: { avatar_url?: string; last_seen_at: string } = { last_seen_at: new Date().toISOString() };
  if (avatarUrl && avatarUrl !== String(profile.data?.avatar_url ?? '').trim()) {
    patch.avatar_url = avatarUrl;
  }
  if (seenStale || patch.avatar_url) {
    const { error } = await supabase.from('team_members').update(patch).eq('email', email);
    if (error) console.error('member presence failed', error.message);
  }

  return {
    ok,
    email,
    superAdmin,
    canLedger: superAdmin || [...byProject.values()].some((roles) => roles.includes('lead') || roles.includes('collaborator')),
    canVault: superAdmin || (grants.count ?? 0) > 0,
    displayName: displayName || email,
    jobTitle: String(profile.data?.job_title ?? '').trim(),
    avatarUrl,
    byProject,
  };
}

export function roleLabels(roles: string[] | null) {
  const parsed = parseRoles(roles);
  return ROLE_META.filter((item) => parsed.includes(item.id)).map((item) => item.label);
}

export function leadCount(rows: ProjectMemberRow[]) {
  return rows.filter((row) => parseRoles(row.roles).includes('lead')).length;
}

export function wouldDropLastLead(
  rows: ProjectMemberRow[],
  email: string,
  nextRoles: ProjectRole[] | null,
) {
  const current = rows.find((row) => row.email === email);
  const currentlyLead = current ? parseRoles(current.roles).includes('lead') : false;
  const staysLead = Boolean(nextRoles?.includes('lead'));
  if (!currentlyLead || staysLead) return false;
  return leadCount(rows.filter((row) => row.email !== email)) === 0;
}
