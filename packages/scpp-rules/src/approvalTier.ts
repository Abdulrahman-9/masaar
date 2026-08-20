/**
 * Approval ladder (client decision ق1, 2026-08-20) — WHO clears a request, by value.
 *
 * The client does not run an abstract cost cycle; it runs a named chain of approving bodies:
 *
 *   ط1  value ≤ operatorMaxUSD                 → OPERATOR — the operating company's own
 *                                                delegated authority: follow-up and audit only,
 *                                                no external approval act.
 *   ط2  operatorMaxUSD < value ≤ jmcMaxUSD     → JMC — the Joint Management Committee gate.
 *   ط3  value > jmcMaxUSD                      → MDOC — the parent company (نفط الوسط) gate.
 *
 * The ladder is GLOBAL (ق1: one ladder for every operator), which is why the thresholds are
 * passed in as configuration rather than derived per field. This is DISTINCT from the §7.1
 * Financial Authority, which is per-field and comes from the field's Service Contract: FA
 * answers «does this enter the cost cycle», the ladder answers «whose signature clears it».
 *
 * Fail closed. An absent or unusable configuration resolves to MDOC — the HIGHEST gate — for
 * the same reason §7.1 fails closed on an unresolvable authority: a request whose clearing body
 * cannot be established must not be treated as already cleared by the lowest one.
 */

export type ApprovalTier = 'OPERATOR' | 'JMC' | 'MDOC';

/** The two ceilings that define the three tiers. Seeded 5,000,000 / 10,000,000 (ق1). */
export interface ApprovalTiers {
  /** the top of the operating company's own authority (ط1 ceiling) */
  operatorMaxUSD: number;
  /** the top of the Joint Management Committee's authority (ط2 ceiling) */
  jmcMaxUSD: number;
}

/** A ladder is usable only when both ceilings are real, non-negative and correctly ordered. */
function ladderUsable(t: ApprovalTiers): boolean {
  const { operatorMaxUSD: op, jmcMaxUSD: jmc } = t;
  if (!Number.isFinite(op) || !Number.isFinite(jmc)) return false;
  if (op < 0 || jmc < 0) return false;
  // an inverted ladder (JMC ceiling below the operator's) describes no reachable JMC band —
  // it is a misconfiguration, not a two-tier ladder, so it must not silently swallow ط2.
  return jmc >= op;
}

/**
 * The approving body for a value under the given ladder. Boundaries are INCLUSIVE at the top of
 * each band, exactly as the client stated them: 5,000,000 is still the operator's, 10,000,000 is
 * still the JMC's, and one cent past either ceiling moves up a tier.
 *
 * Returns MDOC when the ladder is missing/unusable or the value itself is not a real number —
 * the conservative reading (§7.1's fail-closed discipline applied to the approval chain).
 */
export function approvalTierFor(valueUSD: number, tiers: ApprovalTiers | null | undefined): ApprovalTier {
  if (!tiers || !ladderUsable(tiers)) return 'MDOC';
  if (!Number.isFinite(valueUSD)) return 'MDOC'; // an unreadable estimate clears nothing
  if (valueUSD <= tiers.operatorMaxUSD) return 'OPERATOR';
  if (valueUSD <= tiers.jmcMaxUSD) return 'JMC';
  return 'MDOC';
}

/**
 * Does this tier need an approval act at all? ط1 is «متابعة وتدقيق فقط» — the operating company
 * already holds the authority, so there is no gate to open, only a record to keep.
 */
export function tierNeedsApproval(tier: ApprovalTier): boolean {
  return tier !== 'OPERATOR';
}
