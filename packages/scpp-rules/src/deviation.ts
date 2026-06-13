import { calendarDaysBetween, type DateInput } from '@masaar/working-days';

/**
 * Deviation engine: actual vs planned per stage.
 * Positive deviation = late → alert to admin; aggregates to operator compliance %.
 */

/** actual − planned, in calendar days. Positive = late. */
export function stageDeviationDays(plannedEnd: DateInput, actualEnd: DateInput): number {
  return calendarDaysBetween(plannedEnd, actualEnd);
}

export interface StageRecord {
  plannedEnd: string;
  actualEnd?: string;
}

/** % of closed stages that finished on time (deviation ≤ 0). No closed stages → 100. */
export function scheduleCompliancePct(stages: readonly StageRecord[]): number {
  const closed = stages.filter((s) => s.actualEnd != null);
  if (closed.length === 0) return 100;
  const onTime = closed.filter((s) => stageDeviationDays(s.plannedEnd, s.actualEnd!) <= 0).length;
  return Math.round((onTime / closed.length) * 1000) / 10;
}

/** Stages cannot close without their required documents. */
export function stageCanClose(
  requiredDocs: readonly string[],
  uploadedDocs: readonly string[],
): { ok: boolean; missing: string[] } {
  const uploaded = new Set(uploadedDocs);
  const missing = requiredDocs.filter((d) => !uploaded.has(d));
  return { ok: missing.length === 0, missing };
}
