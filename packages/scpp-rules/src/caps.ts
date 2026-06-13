import type { CapResult } from './types';

/**
 * Post-award caps (SCPP §18–§21) + guarantee rules.
 * Every cap is a meter in the UI: green → orange at ≥ 80% of the cap → red at/past it.
 */

export const CAP_RISK_RATIO = 0.8;

function capResult(usedValue: number, baseValue: number, capPct: number, clause: string): CapResult {
  if (baseValue <= 0) throw new Error('base value must be positive');
  const usedPct = Math.round((usedValue / baseValue) * 1000) / 10;
  const ratio = usedPct / capPct;
  const status = ratio >= 1 ? 'breach' : ratio >= CAP_RISK_RATIO ? 'risk' : 'ok';
  return { usedPct, capPct, status, clause };
}

/** Variation orders ≤ 10% of contract value (18.1). */
export function variationOrdersCap(totalVOsUSD: number, contractValueUSD: number): CapResult {
  return capResult(totalVOsUSD, contractValueUSD, 10, '18.1');
}

/** LC-authority extension ≤ 25% of the original term (19.3). */
export function extensionCap(extensionDays: number, originalTermDays: number): CapResult {
  return capResult(extensionDays, originalTermDays, 25, '19.3');
}

/** Suspension ≤ 25% of the original term (20.2). */
export function suspensionCap(suspendedDays: number, originalTermDays: number): CapResult {
  return capResult(suspendedDays, originalTermDays, 25, '20.2');
}

/** Liquidated damages ≤ 10% of contract value (21.2). */
export function liquidatedDamagesCap(totalLDsUSD: number, contractValueUSD: number): CapResult {
  return capResult(totalLDsUSD, contractValueUSD, 10, '21.2');
}

/** Renewal ≤ 1 year (19.1). */
export function renewalAllowed(renewalYears: number): { ok: boolean; clause: '19.1' } {
  return { ok: renewalYears <= 1 && renewalYears > 0, clause: '19.1' };
}

/* ---------- Guarantees (registry rules) ---------- */

/** Bid bond must be 1–3% of the estimate. */
export function bidBondValid(bondUSD: number, estimateUSD: number): { ok: boolean; pct: number } {
  const pct = Math.round((bondUSD / estimateUSD) * 1000) / 10;
  return { ok: pct >= 1 && pct <= 3, pct };
}

/** Performance bond ≥ 5% of contract value. */
export function performanceBondValid(bondUSD: number, contractValueUSD: number): { ok: boolean; pct: number } {
  const pct = Math.round((bondUSD / contractValueUSD) * 1000) / 10;
  return { ok: pct >= 5, pct };
}

/** Advance-payment guarantee must equal (cover) the advance. */
export function advanceGuaranteeValid(guaranteeUSD: number, advanceUSD: number): { ok: boolean } {
  return { ok: guaranteeUSD >= advanceUSD };
}

/** Guarantee expiring within `withinDays` of `asOf` should surface in reports. */
export function guaranteeExpiringSoon(expiryIso: string, asOfIso: string, withinDays = 60): boolean {
  const DAY_MS = 86_400_000;
  const diff = (Date.parse(expiryIso) - Date.parse(asOfIso)) / DAY_MS;
  return diff >= 0 && diff <= withinDays;
}
