/**
 * Mock session — placeholder for Azure AD (MSAL) + 2FA.
 * Stores the role-scoped session the README requires (user, role, operator scope).
 *
 * The session carries the server's own role vocabulary. It used to carry a parallel
 * two-value union that every consumer re-mapped with `role === 'roc-admin' ? … : …`,
 * which silently funnelled any third role into the operator branch.
 */

/** The server's 6-role universe (mirrors apps/api/src/auth/auth.types.ts). */
export type ApiRole = 'SUPER_ADMIN' | 'ROC_ADMIN' | 'EVALUATION' | 'AUDITOR' | 'OPERATOR_ADMIN' | 'OPERATOR_USER';

/** Company-scoped roles (mirrors apps/api/src/auth/scope.ts — only these two are scoped). */
export const isOperatorRole = (r: ApiRole): boolean => r === 'OPERATOR_ADMIN' || r === 'OPERATOR_USER';

/** The only roles the server will mint a session for (auth LoginDto `@IsIn`). */
export const API_LOGINABLE_ROLES = ['OPERATOR_ADMIN', 'ROC_ADMIN'] as const;
export type ApiLoginableRole = (typeof API_LOGINABLE_ROLES)[number];
export const isApiLoginable = (r: ApiRole): r is ApiLoginableRole =>
  (API_LOGINABLE_ROLES as readonly ApiRole[]).includes(r);

export interface Session {
  name: string;
  role: ApiRole;
  /** immutable Azure object id — the only safe way to bind a session to an account */
  oid: string;
  company?: string;
  companyId?: string;
}

/**
 * Demo sign-in identities. Each `oid` must match a seeded account in `seedState()`
 * (pinned by apps/web/test/capabilities.test.ts) so the session resolves to a real user.
 */
export interface DemoIdentity {
  role: ApiRole;
  oid: string;
  name: string;
  company?: string;
  companyId?: string;
}

export const DEMO_IDENTITIES: DemoIdentity[] = [
  { role: 'OPERATOR_ADMIN', oid: 'oid-opadmin-01', name: 'م. أحمد عبد الرحمن', company: 'شركة نفط البصرة', companyId: 'op-bec' },
  { role: 'ROC_ADMIN', oid: 'oid-roc-01', name: 'د. سارة الجبوري' },
  { role: 'SUPER_ADMIN', oid: 'oid-super-01', name: 'م. مصطفى الكرخي' },
];

// v2: `oid` became required. A v1 blob would deserialize with oid === undefined and
// silently fail every account lookup, so the key is bumped rather than migrated.
const KEY = 'masaar-session-v2';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    // an unchecked cast is how a shape change becomes a silent runtime failure
    return s && typeof s.oid === 'string' && typeof s.role === 'string' ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
