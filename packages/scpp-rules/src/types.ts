/**
 * @masaar/scpp-rules — shared types.
 *
 * Governing reference: SCPP Rev 1.0 (January 2026). The English text controls.
 * Every rule here cites its clause so tests and UI can surface it.
 */

export type MethodKey =
  | 'sole'
  | 'low-value'
  | 'fast-track'
  | 'direct'
  | 'rfp'
  | 'limited'
  | 'public'
  | 'two-phased';

export interface Method {
  id: number;
  key: MethodKey;
  /** SCPP article, e.g. '11.1' */
  scpp: string;
  ar: string;
  en: string;
}

/** A single automatic check with its governing clause and bilingual message. */
export interface RuleCheck {
  id: string;
  clause: string;
  ok: boolean;
  ar: string;
  en: string;
}

export interface RuleResult {
  ok: boolean;
  checks: RuleCheck[];
}

export type CapStatus = 'ok' | 'risk' | 'breach';

export interface CapResult {
  /** how much of the cap is consumed, in % of the cap base (e.g. VOs as % of contract value) */
  usedPct: number;
  capPct: number;
  status: CapStatus;
  clause: string;
}
