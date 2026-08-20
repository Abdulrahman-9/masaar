import { API_ROLES, isOperatorRole, normalizeRole, type ApiRole } from '../session';
import type { AuditEntry, UserAccount } from '../store';
import { COUNTED, type Capability, type CapDomain } from './capabilities';

/**
 * Derivations for the access-governance section. Everything here reads from the
 * capability register (the real @Roles surface) and the account list — never from
 * a hand-maintained permission table.
 */

/**
 * How a capability presents for one role. See the legend in the reference matrix.
 * 'conflict' is not a permission state — it is a disagreement between the specification
 * document and the code that enforces it, surfaced instead of silently resolved.
 */
export type CellState = 'yes' | 'scoped' | 'open' | 'no' | 'session' | 'conflict';

/**
 * `scoped` records the code path (loadScoped / operatorScopeWhere). It is an *effective*
 * restriction only for the two operator roles — `isOperatorScoped` is false for the four
 * platform roles, so the company filter is inert for them.
 */
export function cellState(cap: Capability, role: ApiRole): CellState {
  if (cap.guard === 'session') return 'session';
  const scopedForRole = cap.scoped && isOperatorRole(role);
  // an undecorated handler passes for every authenticated session — but operator roles
  // still only ever see their own company's rows.
  if (cap.guard === 'open') return scopedForRole ? 'scoped' : 'open';
  if (!cap.roles.includes(role)) {
    // the spec says this role holds it; the guard says otherwise. Neither is hidden.
    return cap.specGrants?.includes(role) ? 'conflict' : 'no';
  }
  return scopedForRole ? 'scoped' : 'yes';
}

/** Capabilities where the specification document and the enforced guard disagree. */
export function specConflicts(): Capability[] {
  return COUNTED.filter((c) => (c.specGrants ?? []).some((r) => !c.roles.includes(r)));
}

/** Does this role reach the capability at all (any non-'no', non-'session' state)? */
export function roleHas(cap: Capability, role: ApiRole): boolean {
  const s = cellState(cap, role);
  return s === 'yes' || s === 'scoped' || s === 'open';
}

/** Every capability this role can reach, session/infra excluded. */
export function capsForRole(role: ApiRole): Capability[] {
  return COUNTED.filter((c) => roleHas(c, role));
}

/** Capabilities withheld from this role — the negative space that makes SoD auditable. */
export function withheldFrom(role: ApiRole): Capability[] {
  return COUNTED.filter((c) => !roleHas(c, role));
}

/** Which roles do hold a capability — used to attribute what a role cannot do. */
export function rolesHolding(cap: Capability): ApiRole[] {
  return API_ROLES.filter((r) => roleHas(cap, r));
}

/** Impactful actions: writes that are actually role-restricted. Reads and session rows never count. */
export function impactfulCount(role: ApiRole): number {
  return capsForRole(role).filter((c) => c.mutating).length;
}

export function readCount(role: ApiRole): number {
  return capsForRole(role).filter((c) => !c.mutating).length;
}

export function domainsFor(role: ApiRole): CapDomain[] {
  return [...new Set(capsForRole(role).map((c) => c.domain))];
}

/** Enabled accounts holding a capability — 0 means the capability has no live holder. */
export function holdersOf(cap: Capability, users: UserAccount[]): UserAccount[] {
  return users.filter((u) => !u.disabled && roleHas(cap, u.role));
}

/** Enabled accounts per role — drives the "who holds this today" affordance. */
export function holdersOfRole(role: ApiRole, users: UserAccount[]): UserAccount[] {
  return users.filter((u) => !u.disabled && u.role === role);
}

/**
 * Governance roles with no enabled holder. Every call against such a role is refused 403 and
 * audited ROLE_REFUSED — an operational defect, not an empty set.
 */
export const GOVERNANCE_ROLES: ApiRole[] = ['SUPER_ADMIN', 'MDOC_ADMIN', 'EVALUATION', 'AUDITOR'];

export function orphanRoles(users: UserAccount[]): ApiRole[] {
  return GOVERNANCE_ROLES.filter((r) => holdersOfRole(r, users).length === 0);
}

export function orphanRoleCount(users: UserAccount[]): number {
  return orphanRoles(users).length;
}

/**
 * Would this change strand a governance role with zero enabled holders? Answered *before*
 * the confirm button, so an admin never discovers it after the fact.
 * `next` is the account's post-change shape (role/disabled already applied).
 */
export function rolesOrphanedBy(users: UserAccount[], userId: string, next: { role: ApiRole; disabled: boolean }): ApiRole[] {
  const after = users.map((u) => (u.id === userId ? { ...u, ...next } : u));
  const before = orphanRoles(users);
  return orphanRoles(after).filter((r) => !before.includes(r));
}

/**
 * i18n key suffix for `roles.names.*`.
 *
 * Widened to `string` on purpose: audit rows are append-only (8.1-e), so a row written before
 * the 2026-08-20 rename still cites `ROC_ADMIN`. `normalizeRole` resolves the retired name to
 * its current one so history renders under today's label instead of falling through to a
 * wrong role — and a name that matches nothing renders AS unknown rather than as an operator.
 */
export function roleKey(role: ApiRole | string): string {
  switch (normalizeRole(role)) {
    case 'SUPER_ADMIN': return 'superAdmin';
    case 'MDOC_ADMIN': return 'mdocAdmin';
    case 'EVALUATION': return 'evaluation';
    case 'AUDITOR': return 'auditor';
    case 'OPERATOR_ADMIN': return 'operatorAdmin';
    case 'OPERATOR_USER': return 'operatorUser';
    default: return 'unknown';
  }
}

/** CSS modifier for `.acc-role--*`. Tolerant on the same terms as `roleKey`. */
export function roleTone(role: ApiRole | string): string {
  switch (normalizeRole(role)) {
    case 'SUPER_ADMIN': return 'super';
    case 'MDOC_ADMIN': return 'mdoc';
    case 'EVALUATION': return 'evaluation';
    case 'AUDITOR': return 'auditor';
    case 'OPERATOR_ADMIN': case 'OPERATOR_USER': return 'operator';
    default: return 'unknown';
  }
}

/**
 * Client rows write `target = email`; rows hydrated from the server may write
 * `${email}: OLD→NEW` (users.service.ts USER_ROLE_CHANGE). Match both, or the
 * "documented actions" count silently under-reports.
 */
export function matchUser(email: string) {
  return (a: AuditEntry) => a.target === email || a.target.startsWith(email + ':');
}

/** Audit actions this section writes — used to filter the access trail out of the global log. */
export const ACCESS_ACTIONS = new Set([
  'CREATE_USER', 'SET_USER_ROLE', 'SET_USER_SCOPE', 'SET_USER_TWOFA', 'SET_USER_DISABLED',
]);
