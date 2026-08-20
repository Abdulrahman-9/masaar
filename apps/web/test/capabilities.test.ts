import { describe, expect, it } from 'vitest';
import {
  cellState,
  capsForRole,
  impactfulCount,
  orphanRoleCount,
  rolesOrphanedBy,
  matchUser,
  roleKey,
  roleTone,
  specConflicts,
} from '../src/admin/access';
import { CAPABILITIES, COUNTED, type Capability } from '../src/admin/capabilities';
import { API_ROLES, DEMO_IDENTITIES, isApiLoginable, normalizeRole, type ApiRole } from '../src/session';
import { seedState, type AuditEntry, type UserAccount } from '../src/store';

const byId = (id: string): Capability => {
  const c = CAPABILITIES.find((x) => x.id === id);
  if (!c) throw new Error(`no capability ${id}`);
  return c;
};

/**
 * Drift guard — these numbers are rendered on screen, so they must be pinned.
 * Re-extract from apps/api/src/**\/*.controller.ts and bump CAP_REV when a controller changes.
 */
describe('capability register', () => {
  it('holds the full endpoint surface: 43 = 36 guarded + 3 open + 4 session', () => {
    expect(CAPABILITIES).toHaveLength(43);
    expect(CAPABILITIES.filter((c) => c.guard === 'roles')).toHaveLength(36);
    expect(CAPABILITIES.filter((c) => c.guard === 'open')).toHaveLength(3);
    expect(CAPABILITIES.filter((c) => c.guard === 'session')).toHaveLength(4);
    expect(COUNTED).toHaveLength(39);
  });

  it('gives SUPER_ADMIN every role-guarded capability', () => {
    const missing = CAPABILITIES.filter((c) => c.guard === 'roles' && !c.roles.includes('SUPER_ADMIN'));
    expect(missing.map((c) => c.id)).toEqual([]);
  });

  it('names the three undecorated reads exactly', () => {
    expect(CAPABILITIES.filter((c) => c.guard === 'open').map((c) => c.id).sort())
      .toEqual(['getTender', 'listHolidays', 'listTenders']);
  });

  it('partitions the counted universe across seven domains', () => {
    const counts: Record<string, number> = {};
    for (const c of COUNTED) counts[c.domain] = (counts[c.domain] ?? 0) + 1;
    expect(counts).toEqual({ tenders: 17, mct: 4, contracts: 5, vendors: 6, users: 3, audit: 1, holidays: 3 });
  });

  it('has unique ids and a clause that is either empty or numeric', () => {
    expect(new Set(CAPABILITIES.map((c) => c.id)).size).toBe(43);
    for (const c of CAPABILITIES) expect(c.clause).toMatch(/^$|^\d/);
  });

  it('counts 23 of 43 capabilities with no numbered clause', () => {
    expect(CAPABILITIES.filter((c) => !c.clause)).toHaveLength(23);
  });

  it('treats only writes behind a real role guard as impactful', () => {
    // authLogout is a POST but session plumbing — it must never inflate an action count
    expect(byId('authLogout').mutating).toBe(false);
    expect(byId('ratifyAward').mutating).toBe(true);
    expect(byId('listTenders').mutating).toBe(false);
  });
});

describe('cellState — the five-state rendering', () => {
  it('scopes a capability only for the two operator roles', () => {
    const ratify = byId('ratifyAward'); // scoped:true, but MDOC/SUPER are never company-limited
    expect(cellState(ratify, 'MDOC_ADMIN')).toBe('yes');
    expect(cellState(ratify, 'EVALUATION')).toBe('no');

    const create = byId('createTender'); // scoped:true and operator-facing
    expect(cellState(create, 'OPERATOR_USER')).toBe('scoped');
    expect(cellState(create, 'SUPER_ADMIN')).toBe('yes');
  });

  it('renders an undecorated read as open, but still scoped for operator roles', () => {
    const list = byId('listTenders');
    expect(cellState(list, 'AUDITOR')).toBe('open');
    expect(cellState(list, 'OPERATOR_ADMIN')).toBe('scoped');
    // holidays are open and unscoped for everyone
    expect(cellState(byId('listHolidays'), 'OPERATOR_ADMIN')).toBe('open');
  });

  it('marks session plumbing as excluded for every role', () => {
    for (const r of ['SUPER_ADMIN', 'AUDITOR', 'OPERATOR_USER'] as ApiRole[]) {
      expect(cellState(byId('authMe'), r)).toBe('session');
    }
  });
});

describe('specification vs. enforcement', () => {
  it('records the one known divergence: the spec grants user creation to the operator admin', () => {
    const conflicts = specConflicts();
    expect(conflicts.map((c) => c.id)).toEqual(['createUser']);
    expect(byId('createUser').specGrants).toEqual(['OPERATOR_ADMIN']);
  });

  it('renders the divergence as a conflict, never as a grant', () => {
    // the guard is the authority: OPERATOR_ADMIN must not count as holding it
    expect(cellState(byId('createUser'), 'OPERATOR_ADMIN')).toBe('conflict');
    expect(capsForRole('OPERATOR_ADMIN').some((c) => c.id === 'createUser')).toBe(false);
    // and the role that really holds it is unaffected
    expect(cellState(byId('createUser'), 'SUPER_ADMIN')).toBe('yes');
  });

  it('leaves every other withheld capability a plain refusal', () => {
    expect(cellState(byId('ratifyAward'), 'OPERATOR_ADMIN')).toBe('no');
  });
});

describe('role reach', () => {
  it('leaves the auditor with zero impactful actions', () => {
    expect(impactfulCount('AUDITOR')).toBe(0);
    expect(capsForRole('AUDITOR').length).toBeGreaterThan(0); // read-only, not access-less
  });

  it('separates operator admin from operator user by exactly cancel/suspend/resume', () => {
    const admin = new Set(capsForRole('OPERATOR_ADMIN').map((c) => c.id));
    const user = new Set(capsForRole('OPERATOR_USER').map((c) => c.id));
    const diff = [...admin].filter((id) => !user.has(id)).sort();
    expect(diff).toEqual(['cancelTender', 'resumeTender', 'suspendTender']);
    expect([...user].filter((id) => !admin.has(id))).toEqual([]);
  });
});

const user = (id: string, role: ApiRole, disabled = false): UserAccount => ({
  id, azureOid: `oid-${id}`, name: id, email: `${id}@masaar.iq`, role, twoFa: true, disabled,
});

describe('orphan-role detection', () => {
  it('counts governance roles with no enabled holder', () => {
    const users = [user('a', 'SUPER_ADMIN'), user('b', 'MDOC_ADMIN')];
    expect(orphanRoleCount(users)).toBe(2); // EVALUATION + AUDITOR have nobody
  });

  it('warns before a change strands a role', () => {
    const users = [user('a', 'SUPER_ADMIN'), user('b', 'MDOC_ADMIN'), user('c', 'EVALUATION'), user('d', 'AUDITOR')];
    expect(orphanRoleCount(users)).toBe(0);
    // disabling the only evaluation member strands EVALUATION
    expect(rolesOrphanedBy(users, 'c', { role: 'EVALUATION', disabled: true })).toEqual(['EVALUATION']);
    // moving them to auditor strands it just the same
    expect(rolesOrphanedBy(users, 'c', { role: 'AUDITOR', disabled: false })).toEqual(['EVALUATION']);
    // a no-op strands nothing
    expect(rolesOrphanedBy(users, 'c', { role: 'EVALUATION', disabled: false })).toEqual([]);
  });
});

describe('demo sign-in identities', () => {
  it('every login option resolves to a seeded account with a matching role', () => {
    const seeded = seedState().users;
    for (const id of DEMO_IDENTITIES) {
      const account = seeded.find((u) => u.azureOid === id.oid);
      expect(account, `no seeded account for ${id.oid}`).toBeDefined();
      expect(account!.role).toBe(id.role);
      expect(account!.disabled).toBe(false);
      // an operator identity must carry the company its account is scoped to
      expect(id.companyId).toBe(account!.operatorId);
    }
  });

  it('only offers API sign-in for the two roles the server LoginDto accepts', () => {
    expect(DEMO_IDENTITIES.filter((i) => isApiLoginable(i.role)).map((i) => i.role).sort())
      .toEqual(['MDOC_ADMIN', 'OPERATOR_ADMIN']);
    expect(isApiLoginable('SUPER_ADMIN')).toBe(false);
  });
});

describe('matchUser', () => {
  const row = (target: string): AuditEntry => ({ ts: '2026-07-22T10:00:00Z', action: 'SET_USER_ROLE', target });

  it('matches both the client target and the server OLD→NEW form', () => {
    // deliberately a PRE-RENAME row: written 2026-07-22 under the retired ROC_ADMIN vocabulary
    // and never rewritten (8.1-e). Matching must not depend on today's role names.
    const m = matchUser('sara.jubouri@roc.iq');
    expect(m(row('sara.jubouri@roc.iq'))).toBe(true);
    expect(m(row('sara.jubouri@roc.iq: ROC_ADMIN→EVALUATION'))).toBe(true);
    expect(m(row('other@roc.iq'))).toBe(false);
    // a longer email that merely starts with the same local part must not match
    expect(m(row('sara.jubouri@roc.iq.example'))).toBe(false);
  });
});

/**
 * The rename is a compatibility event, not just a spelling change: sessions, accounts and audit
 * rows written before 2026-08-20 all carry `ROC_ADMIN`, and each layer must answer for it.
 */
describe('retired role vocabulary (ROC_ADMIN → MDOC_ADMIN)', () => {
  it('resolves the retired identifier and rejects one that names nothing', () => {
    expect(normalizeRole('ROC_ADMIN')).toBe('MDOC_ADMIN');
    expect(normalizeRole('MDOC_ADMIN')).toBe('MDOC_ADMIN');
    expect(normalizeRole('ROC_ADMINISTRATOR')).toBeNull();
    expect(normalizeRole('')).toBeNull();
  });

  it('renders a historical audit role under the CURRENT label, not a wrong one', () => {
    // the pre-2026-08-20 spelling must not fall through to an unrelated role
    expect(roleKey('ROC_ADMIN')).toBe('mdocAdmin');
    expect(roleTone('ROC_ADMIN')).toBe('mdoc');
    // …and a name the register never had reads AS unknown rather than as an operator
    expect(roleKey('COMMITTEE_CHAIR')).toBe('unknown');
    expect(roleTone('COMMITTEE_CHAIR')).toBe('unknown');
    // every live role still has its own key and tone
    expect(API_ROLES.map(roleKey)).toEqual(['superAdmin', 'mdocAdmin', 'evaluation', 'auditor', 'operatorAdmin', 'operatorUser']);
    expect(new Set(API_ROLES.map(roleTone)).size).toBe(5); // the two operator roles share one tone
  });

  it('leaves no retired identifier in the live register', () => {
    expect(CAPABILITIES.flatMap((c) => [...c.roles, ...(c.specGrants ?? [])]).filter((r) => !API_ROLES.includes(r))).toEqual([]);
    expect(seedState().users.filter((u) => !API_ROLES.includes(u.role))).toEqual([]);
  });
});
