import type { ApprovalTier } from '@masaar/scpp-rules';
import { currentStage, tenderApprovalTier, type ContractState, type State, type Tender } from '../store';
import { currentStageKey, scheduleVariancePct } from './contractDerive';

/**
 * Shared admin derivations — one definition per portfolio question, so the sidebar badge,
 * the follow-up room, and any future surface all read the same truth (extraction, not
 * invention). Pure functions; time is injected where it matters, never read from the clock.
 */

/**
 * Tenders awaiting the MDOC ratify / return decision: parked at the `ratify` stage with no
 * decision recorded yet. EXTRACTED verbatim from the inline filter behind AdminShell's
 * `decisions` counter — the next-stage agent imports this instead of re-deriving it. The gate
 * is structural (stage + decision), not time-based, so no `today` is needed.
 */
export function decisionQueue(state: State): Tender[] {
  return state.tenders.filter(pendingRatification);
}

/**
 * Is THIS tender awaiting the ratification decision? The predicate the reducer's RATIFY guard
 * runs, lifted to one place: parked at `ratify`, undecided, and not cancelled or suspended —
 * a halted request owes nobody a signature.
 *
 * It is exported because three surfaces count it and they must count it identically: the
 * sidebar badge, the follow-up room's «بانتظار التصديق» tile, and the tenders registry the
 * tile links to (`#/admin/tenders?pending=1`). A tile that opens a registry holding a different
 * number of rows than the tile printed is the exact failure this wave exists to prevent.
 */
export function pendingRatification(t: Tender): boolean {
  return !t.lifecycle && !t.ratification && currentStage(t)?.key === 'ratify';
}

/**
 * Post-award contracts that have fallen behind their own plan: still in delivery (a stage
 * remains open) AND actual progress trails planned progress (contractDerive.scheduleVariancePct
 * < 0). A fully delivered contract is never "late". `todayIso` is injected so the result is
 * deterministic and testable.
 */
export function lateContracts(state: State, todayIso: string): ContractState[] {
  return state.contracts.filter((c) => currentStageKey(c) !== undefined && scheduleVariancePct(c, todayIso) < 0);
}

/* ---------------- approval chain (client decision ق1) ---------------- */

/** Where a tender stands in the approval chain: the body it waits on, and its decision. */
export type ApprovalDecision = 'pending' | 'ratified' | 'returned' | 'cancelled' | 'suspended';

export interface ApprovalRow {
  tender: Tender;
  /** never 'OPERATOR' — a request inside the company's own authority opens no gate (ط1) */
  tier: Exclude<ApprovalTier, 'OPERATOR'>;
  decision: ApprovalDecision;
}

/**
 * The decision state of a tender ON THE LADDER — what the waiting body has (or has not) done.
 * A cancelled/suspended tender is NOT «pending»: nobody is waiting on it, and reading it as
 * pending would inflate every «awaiting» count on the screen. Lifecycle therefore wins over the
 * absence of a ratification, and a recorded ratification over both (it happened before the
 * suspension could have).
 */
export function approvalDecisionOf(t: Tender): ApprovalDecision {
  if (t.ratification) return t.ratification.status;
  if (t.lifecycle) return t.lifecycle.status;
  return 'pending';
}

/**
 * Every tender ABOVE the operating company's own authority — i.e. every request that owes a
 * signature to a body outside the operator (ط2 JMC / ط3 MDOC). This is the whole population of
 * the approval-chain screen, and it is DERIVED from the value and the global ladder: there is no
 * stored «needs approval» flag to drift, and a ladder edit re-sorts the screen instantly.
 */
export function approvalChain(state: State): ApprovalRow[] {
  const out: ApprovalRow[] = [];
  for (const tender of state.tenders) {
    const tier = tenderApprovalTier(state, tender);
    if (tier === 'OPERATOR') continue;
    out.push({ tender, tier, decision: approvalDecisionOf(tender) });
  }
  return out;
}

/**
 * The rows of ONE ladder band that are still waiting on that body's signature. «Waiting» is
 * `approvalDecisionOf` === 'pending': a ratified, returned, cancelled or suspended request is
 * not awaiting anybody, and counting it would inflate the queue into a number nobody owns.
 *
 * One definition for both readers of it — the approval registry's KPI strip and the follow-up
 * room's pending-approval tiles — so the tile a manager clicks and the screen it lands on can
 * never disagree about how many signatures are outstanding.
 */
export function awaitingTier(rows: ApprovalRow[], tier: Exclude<ApprovalTier, 'OPERATOR'>): ApprovalRow[] {
  return rows.filter((r) => r.tier === tier && r.decision === 'pending');
}

/**
 * Rows ratified within the calendar month of `todayIso` — the «صودق هذا الشهر» KPI. Compared as
 * an ISO year-month prefix (the same string-comparison discipline the rest of the store uses for
 * dates), so no timezone can move a decision into the neighbouring month.
 */
export function ratifiedInMonth(rows: ApprovalRow[], todayIso: string): ApprovalRow[] {
  const month = todayIso.slice(0, 7);
  return rows.filter((r) => r.tender.ratification?.status === 'ratified' && r.tender.ratification.on.slice(0, 7) === month);
}

/* ---------------- the triad explainer (client request 21) ---------------- */

/**
 * One WORKED EXAMPLE per approving body: a real seeded request that actually lands in that band,
 * so «طلب $7.8M → قرار اللجنة المشتركة» is a sentence about this platform's own data rather than
 * a textbook figure. The number the reader sees is the number the ladder judged.
 *
 * GUARDED, by design: a band with no live request yields `undefined`, and the card falls back to
 * the band's range alone. Inventing a plausible tender to fill an empty band would be exactly the
 * fabrication the section's law forbids — «ولا يُسجَّل ما لا يقع».
 *
 * When several requests fit, the LARGEST is chosen: the example nearest the ceiling is the one
 * that teaches where the band ends, and it is deterministic (ties break on the tender code, so
 * the sentence does not move between renders or between two readers).
 */
export function tierExample(state: State, tier: ApprovalTier): Tender | undefined {
  const inBand = state.tenders.filter((t) => tenderApprovalTier(state, t) === tier);
  if (inBand.length === 0) return undefined;
  return inBand.reduce((best, t) =>
    t.estimatedValueUSD > best.estimatedValueUSD
      || (t.estimatedValueUSD === best.estimatedValueUSD && t.code < best.code)
      ? t : best);
}
