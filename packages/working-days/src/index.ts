/**
 * @masaar/working-days — working-day calendar arithmetic.
 *
 * All SCPP working-day (WD) deadlines — MCT meeting ≤ 14 WD, agreement ≤ 21 WD,
 * ROC observer nomination ≤ 5 WD, openings ≤ 7 WD — depend on this package.
 * Holidays are data, not code: in production they are managed from the admin
 * dashboard and passed in via `WorkingCalendar`.
 */

export interface WorkingCalendar {
  /** UTC weekday numbers that are weekend (0=Sun … 5=Fri, 6=Sat). Iraq: Friday + Saturday. */
  weekend: readonly number[];
  /** Public holidays as ISO dates 'YYYY-MM-DD'. */
  holidays: readonly string[];
}

export const IRAQ_CALENDAR: WorkingCalendar = { weekend: [5, 6], holidays: [] };

export type DateInput = Date | string;

const DAY_MS = 86_400_000;

/** Normalize to UTC midnight. Strings must be 'YYYY-MM-DD' (or full ISO; time is dropped). */
export function toUtcDate(d: DateInput): Date {
  if (d instanceof Date) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const [datePart] = d.split('T');
  const [y, m, day] = (datePart ?? '').split('-').map(Number);
  if (!y || !m || !day) throw new Error(`Invalid date input: ${d}`);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isWorkingDay(d: DateInput, cal: WorkingCalendar = IRAQ_CALENDAR): boolean {
  const date = toUtcDate(d);
  if (cal.weekend.includes(date.getUTCDay())) return false;
  return !cal.holidays.includes(toIso(date));
}

/** The date falling `days` working days after `start` (the start day itself is not counted). */
export function addWorkingDays(start: DateInput, days: number, cal: WorkingCalendar = IRAQ_CALENDAR): Date {
  if (days < 0) throw new Error('days must be ≥ 0');
  let d = toUtcDate(start);
  let remaining = days;
  while (remaining > 0) {
    d = new Date(d.getTime() + DAY_MS);
    if (isWorkingDay(d, cal)) remaining--;
  }
  return d;
}

/** Count of working days in the interval (start, end]. Returns 0 when end ≤ start. */
export function workingDaysBetween(start: DateInput, end: DateInput, cal: WorkingCalendar = IRAQ_CALENDAR): number {
  let s = toUtcDate(start);
  const e = toUtcDate(end);
  let n = 0;
  while (s.getTime() < e.getTime()) {
    s = new Date(s.getTime() + DAY_MS);
    if (isWorkingDay(s, cal)) n++;
  }
  return n;
}

/**
 * A closing date that lands on a weekend/holiday extends to the next working day
 * (SCPP: closing on holiday → next working day).
 */
export function nextWorkingDayOnOrAfter(d: DateInput, cal: WorkingCalendar = IRAQ_CALENDAR): Date {
  let date = toUtcDate(d);
  while (!isWorkingDay(date, cal)) {
    date = new Date(date.getTime() + DAY_MS);
  }
  return date;
}

/** Calendar-day difference end − start (positive when end is after start). */
export function calendarDaysBetween(start: DateInput, end: DateInput): number {
  return Math.round((toUtcDate(end).getTime() - toUtcDate(start).getTime()) / DAY_MS);
}

export function addCalendarDays(start: DateInput, days: number): Date {
  return new Date(toUtcDate(start).getTime() + days * DAY_MS);
}
