import {
  IRAQ_CALENDAR,
  addWorkingDays,
  toIso,
  workingDaysBetween,
  type DateInput,
  type WorkingCalendar,
} from '@masaar/working-days';

/**
 * MCT cost cycle (SCPP 6.9) — applies to tenders above Financial Authority.
 *
 *   notification (official e-mail, 6.9)
 *     → meeting ≤ 14 WD, else the LC estimate prevails (6.9.2)
 *     → agreement ≤ 21 WD, else the MCT estimate prevails (6.9.1)
 *     → award OK iff lowest technically-qualified ≤ +20% of the accredited estimate (6.9.3)
 *     → notify MCT of final value post-award (6.9.4)
 */

export const MCT_MEETING_WD = 14; // 6.9.2
export const MCT_AGREEMENT_WD = 21; // 6.9.1

export type PrevailingEstimate = 'AGREED' | 'LC' | 'MCT' | 'PENDING';

export interface MctCycleInput {
  /** date the tender details were e-mailed to MCT (the official channel, 6.9) */
  notifiedOn: DateInput;
  meetingHeldOn?: DateInput;
  agreementReachedOn?: DateInput;
  asOf: DateInput;
  calendar?: WorkingCalendar;
}

export interface MctCycleStatus {
  meetingDeadline: string;
  agreementDeadline: string;
  workingDaysElapsed: number;
  /** true = held in time, false = missed/late, 'pending' = still within window */
  meetingOnTime: boolean | 'pending';
  prevailingEstimate: PrevailingEstimate;
  /** the clause that decided `prevailingEstimate` (when decided) */
  clause?: '6.9.1' | '6.9.2';
}

export function mctCycleStatus(input: MctCycleInput): MctCycleStatus {
  const cal = input.calendar ?? IRAQ_CALENDAR;
  const meetingDeadline = addWorkingDays(input.notifiedOn, MCT_MEETING_WD, cal);
  const agreementDeadline = addWorkingDays(input.notifiedOn, MCT_AGREEMENT_WD, cal);
  const elapsed = workingDaysBetween(input.notifiedOn, input.asOf, cal);

  let meetingOnTime: boolean | 'pending';
  if (input.meetingHeldOn != null) {
    meetingOnTime = workingDaysBetween(input.notifiedOn, input.meetingHeldOn, cal) <= MCT_MEETING_WD;
  } else {
    meetingOnTime = elapsed <= MCT_MEETING_WD ? 'pending' : false;
  }

  let prevailingEstimate: PrevailingEstimate;
  let clause: MctCycleStatus['clause'];

  if (
    input.agreementReachedOn != null &&
    workingDaysBetween(input.notifiedOn, input.agreementReachedOn, cal) <= MCT_AGREEMENT_WD &&
    meetingOnTime === true
  ) {
    prevailingEstimate = 'AGREED';
  } else if (meetingOnTime === false) {
    prevailingEstimate = 'LC'; // 6.9.2 — no meeting within 14 WD → LC estimate prevails
    clause = '6.9.2';
  } else if (meetingOnTime === true && input.agreementReachedOn == null && elapsed > MCT_AGREEMENT_WD) {
    prevailingEstimate = 'MCT'; // 6.9.1 — no agreement within 21 WD → MCT estimate prevails
    clause = '6.9.1';
  } else {
    prevailingEstimate = 'PENDING';
  }

  return {
    meetingDeadline: toIso(meetingDeadline),
    agreementDeadline: toIso(agreementDeadline),
    workingDaysElapsed: elapsed,
    meetingOnTime,
    prevailingEstimate,
    clause,
  };
}

/* ---------------------------------------------------------------------- */

export type AwardAction = 'award' | 'negotiate' | 'clarify-capability';

export interface AwardVerdict {
  /** (bid − estimate) / estimate × 100 */
  deltaPct: number;
  action: AwardAction;
  clause: '6.9.3' | '13.3' | '13.6';
  ar: string;
  en: string;
}

export const AWARD_BAND_PCT = 20;

/**
 * The ±20% verdict (6.9.3 / 13.3 / 13.6):
 *  - within +20% of the accredited estimate → award proceeds (6.9.3)
 *  - above +20% → negotiate without scope change (13.3), else re-tender via Fast Track
 *  - below −20% → written capability clarification allowed (13.6)
 */
export function awardVerdict(lowestQualifiedBidUSD: number, accreditedEstimateUSD: number): AwardVerdict {
  if (accreditedEstimateUSD <= 0) throw new Error('accredited estimate must be > 0');
  const deltaPct = ((lowestQualifiedBidUSD - accreditedEstimateUSD) / accreditedEstimateUSD) * 100;

  if (deltaPct > AWARD_BAND_PCT) {
    return {
      deltaPct,
      action: 'negotiate',
      clause: '13.3',
      ar: 'تجاوز حدود +20% — تفاوض دون تغيير نطاق العمل، وإلا تُعاد المناقصة بالمسار السريع.',
      en: 'Beyond +20% — negotiate without changing scope, otherwise re-tender via Fast Track.',
    };
  }
  if (deltaPct < -AWARD_BAND_PCT) {
    return {
      deltaPct,
      action: 'clarify-capability',
      clause: '13.6',
      ar: 'أدنى من −20% — يجوز طلب توضيح خطي للقدرة على التنفيذ قبل الإحالة.',
      en: 'Below −20% — a written capability clarification may be requested before award.',
    };
  }
  return {
    deltaPct,
    action: 'award',
    clause: '6.9.3',
    ar: 'ضمن حدود +20% من التخمين المعتمد — تمضي الإحالة لأوطأ عطاء مؤهل فنياً.',
    en: 'Within +20% of the accredited estimate — award proceeds to the lowest technically-qualified bid.',
  };
}
