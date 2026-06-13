/**
 * Mock session — placeholder for Azure AD (MSAL) + 2FA.
 * Stores the role-scoped session the README requires (user, role, operator scope).
 */

export type Role = 'operator-admin' | 'roc-admin';

export interface Session {
  name: string;
  role: Role;
  company?: string;
}

const KEY = 'masaar-session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
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
