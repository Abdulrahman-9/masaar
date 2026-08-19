import { currentStage, type ContractState, type State, type Tender } from '../store';
import { currentStageKey, scheduleVariancePct } from './contractDerive';

/**
 * Shared admin derivations — one definition per portfolio question, so the sidebar badge,
 * the follow-up room, and any future surface all read the same truth (extraction, not
 * invention). Pure functions; time is injected where it matters, never read from the clock.
 */

/**
 * Tenders awaiting the ROC ratify / return decision: parked at the `ratify` stage with no
 * decision recorded yet. EXTRACTED verbatim from the inline filter behind AdminShell's
 * `decisions` counter — the next-stage agent imports this instead of re-deriving it. The gate
 * is structural (stage + decision), not time-based, so no `today` is needed.
 */
export function decisionQueue(state: State): Tender[] {
  return state.tenders.filter((t) => currentStage(t)?.key === 'ratify' && !t.ratification);
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
