import { describe, expect, it } from 'vitest';
import { allowedIntent, capsFromRoles, parseRoles, studioRoleOf, tabForIntent, wouldDropLastLead } from '../../src/lib/access';

describe('project roles → capabilities', () => {
  it('developer sees the schedule but not money or people', () => {
    const caps = capsFromRoles(['developer']);
    expect(caps.canSchedule).toBe(true);
    expect(caps.canProgress).toBe(true);
    expect(caps.canPlan).toBe(false);
    expect(caps.canFinance).toBe(false);
    expect(caps.canPeople).toBe(false);
    expect(caps.tabs.map((t) => t.id)).toEqual(['schedule', 'tasks', 'qa', 'details']);
  });

  it('collaborator sees money only', () => {
    const caps = capsFromRoles(['collaborator']);
    expect(caps.canFinance).toBe(true);
    expect(caps.canSchedule).toBe(false);
    expect(caps.tabs.map((t) => t.id)).toEqual(['funding', 'ledger']);
  });

  it('lead runs the project but cannot delete it', () => {
    const caps = capsFromRoles(['lead']);
    expect([caps.canPlan, caps.canFinance, caps.canPeople, caps.canEditDetails]).toEqual([true, true, true, true]);
    expect(caps.canDelete).toBe(false);
  });

  it('studio admins (owner or admin) get everything on every project, including delete', () => {
    const caps = capsFromRoles([], true, 'Admin');
    expect([caps.assigned, caps.canPlan, caps.canFinance, caps.canPeople, caps.canDelete]).toEqual([true, true, true, true, true]);
    expect(caps.roleLabels).toEqual(['Admin']);
  });

  it('no roles means no access', () => {
    expect(capsFromRoles([]).assigned).toBe(false);
  });

  it('ignores unknown roles', () => {
    expect(parseRoles(['lead', 'owner', 'qa'])).toEqual(['lead', 'qa']);
  });
});

describe('which actions each role may take', () => {
  const dev = capsFromRoles(['developer']);
  const qa = capsFromRoles(['qa']);
  const manager = capsFromRoles(['manager']);
  const collaborator = capsFromRoles(['collaborator']);
  const lead = capsFromRoles(['lead']);

  it('only planners create and edit tasks', () => {
    expect(allowedIntent('add-task', dev)).toBe(false);
    expect(allowedIntent('update-task', dev)).toBe(false);
    expect(allowedIntent('add-task', manager)).toBe(true);
  });

  it('developers and QA move work forward', () => {
    for (const caps of [dev, qa]) {
      expect(allowedIntent('task-done', caps)).toBe(true);
      expect(allowedIntent('add-comment', caps)).toBe(true);
      expect(allowedIntent('toggle-subtask', caps)).toBe(true);
      expect(allowedIntent('start-timer', caps)).toBe(true);
      expect(allowedIntent('report-bug', caps)).toBe(true);
    }
  });

  it('only planners create QA checklists that auto-assign every QA', () => {
    expect(allowedIntent('add-qa-checklist', qa)).toBe(false);
    expect(allowedIntent('apply-qa-checklist', dev)).toBe(false);
    expect(allowedIntent('add-qa-checklist', manager)).toBe(true);
    expect(allowedIntent('apply-qa-checklist', lead)).toBe(true);
  });

  it('QA tab lists are planner-created; anyone who can progress may toggle their check', () => {
    expect(allowedIntent('add-qa-list', qa)).toBe(false);
    expect(allowedIntent('add-qa-list', manager)).toBe(true);
    expect(allowedIntent('delete-qa-list', lead)).toBe(true);
    expect(allowedIntent('toggle-qa-check', qa)).toBe(true);
    expect(allowedIntent('toggle-qa-check', collaborator)).toBe(false);
    expect(tabForIntent('add-qa-list')).toBe('qa');
    expect(tabForIntent('toggle-qa-check')).toBe('qa');
  });

  it('dependencies are planning only', () => {
    expect(allowedIntent('add-dependency', dev)).toBe(false);
    expect(allowedIntent('add-dependency', manager)).toBe(true);
  });

  it('money is for finance roles only', () => {
    expect(allowedIntent('add-contribution', dev)).toBe(false);
    expect(allowedIntent('create-entry', dev)).toBe(false);
    expect(allowedIntent('add-contribution', collaborator)).toBe(true);
  });

  it('client links are leads only; chat settings need detail editing', () => {
    expect(allowedIntent('share-create', manager)).toBe(false);
    expect(allowedIntent('share-create', lead)).toBe(true);
    expect(allowedIntent('update-chat', dev)).toBe(false);
    expect(allowedIntent('update-chat', manager)).toBe(true);
  });

  it('people and deletion are leads only', () => {
    expect(allowedIntent('add-member', manager)).toBe(false);
    expect(allowedIntent('delete', manager)).toBe(false);
    expect(allowedIntent('add-member', lead)).toBe(true);
  });

  it('unknown actions are refused', () => {
    expect(allowedIntent('drop-tables', lead)).toBe(false);
  });

  it('routes actions back to the right tab', () => {
    expect(tabForIntent('add-comment')).toBe('tasks');
    expect(tabForIntent('start-timer')).toBe('tasks');
    expect(tabForIntent('share-create')).toBe('details');
    expect(tabForIntent('add-checkin')).toBe('schedule');
    expect(tabForIntent('add-member')).toBe('people');
  });
});

describe('keeping a lead on every project', () => {
  const rows = [
    { email: 'a@x.com', roles: ['lead'] },
    { email: 'b@x.com', roles: ['developer'] },
  ];
  it('blocks removing the last lead', () => {
    expect(wouldDropLastLead(rows, 'a@x.com', null)).toBe(true);
    expect(wouldDropLastLead(rows, 'a@x.com', ['developer'])).toBe(true);
  });
  it('allows it when another lead remains', () => {
    expect(wouldDropLastLead([...rows, { email: 'c@x.com', roles: ['lead'] }], 'a@x.com', null)).toBe(false);
  });
});

describe('studio roles', () => {
  it('reads owner, admin, member (old super_admin becomes owner)', () => {
    expect(studioRoleOf('owner')).toBe('owner');
    expect(studioRoleOf('super_admin')).toBe('owner');
    expect(studioRoleOf('admin')).toBe('admin');
    expect(studioRoleOf('member')).toBe('member');
    expect(studioRoleOf('anything')).toBe('member');
  });
  it('the permanent owner is always owner', () => {
    expect(studioRoleOf('member', 'onezcodes@gmail.com')).toBe('owner');
  });
  it('project deletion follows the studio role, not the project role', () => {
    expect(allowedIntent('delete', capsFromRoles(['lead']))).toBe(false);
    expect(allowedIntent('delete', capsFromRoles([], true))).toBe(true);
  });
});
