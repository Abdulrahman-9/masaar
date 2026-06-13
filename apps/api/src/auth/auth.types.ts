export type Role = 'SUPER_ADMIN' | 'ROC_ADMIN' | 'EVALUATION' | 'AUDITOR' | 'OPERATOR_ADMIN' | 'OPERATOR_USER';

/** What every authenticated request carries (decoded from the session JWT). */
export interface AuthUser {
  userId: string;
  name: string;
  role: Role;
  /** present for operator-scoped roles — the only company they may touch */
  operatorId?: string;
}

export const SESSION_COOKIE = 'masaar_session';
