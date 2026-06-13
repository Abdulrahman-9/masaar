import { describe, expect, it } from 'vitest';
import {
  IRAQ_CALENDAR,
  addWorkingDays,
  calendarDaysBetween,
  isWorkingDay,
  nextWorkingDayOnOrAfter,
  toIso,
  workingDaysBetween,
} from '@masaar/working-days';

// 2026-06-10 = Wednesday, 2026-06-12 = Friday (Iraq weekend), 2026-06-14 = Sunday.

describe('isWorkingDay (Iraq Fri/Sat weekend)', () => {
  it.each([
    ['2026-06-10', true], // Wed
    ['2026-06-11', true], // Thu
    ['2026-06-12', false], // Fri
    ['2026-06-13', false], // Sat
    ['2026-06-14', true], // Sun
  ])('%s → %s', (date, expected) => {
    expect(isWorkingDay(date)).toBe(expected);
  });

  it('respects admin-managed holidays', () => {
    const cal = { ...IRAQ_CALENDAR, holidays: ['2026-06-10'] };
    expect(isWorkingDay('2026-06-10', cal)).toBe(false);
  });
});

describe('addWorkingDays', () => {
  it('skips the weekend', () => {
    expect(toIso(addWorkingDays('2026-06-11', 1))).toBe('2026-06-14'); // Thu + 1 WD → Sun
  });
  it('counts plain working days', () => {
    expect(toIso(addWorkingDays('2026-06-10', 1))).toBe('2026-06-11');
  });
  it('skips holidays too', () => {
    const cal = { ...IRAQ_CALENDAR, holidays: ['2026-06-14'] };
    expect(toIso(addWorkingDays('2026-06-11', 1, cal))).toBe('2026-06-15');
  });
  it('14 WD from a Sunday spans exactly two weekends', () => {
    // 2026-06-14 (Sun) + 14 WD → 2026-07-02 (Thu)
    expect(toIso(addWorkingDays('2026-06-14', 14))).toBe('2026-07-02');
  });
});

describe('workingDaysBetween', () => {
  it('counts (start, end] working days', () => {
    expect(workingDaysBetween('2026-06-10', '2026-06-14')).toBe(2); // Thu + Sun
  });
  it('returns 0 when end ≤ start', () => {
    expect(workingDaysBetween('2026-06-14', '2026-06-10')).toBe(0);
  });
});

describe('nextWorkingDayOnOrAfter (closing-date extension)', () => {
  it('closing on Friday extends to Sunday', () => {
    expect(toIso(nextWorkingDayOnOrAfter('2026-06-12'))).toBe('2026-06-14');
  });
  it('working day stays unchanged', () => {
    expect(toIso(nextWorkingDayOnOrAfter('2026-06-10'))).toBe('2026-06-10');
  });
});

describe('calendarDaysBetween', () => {
  it('plain calendar difference', () => {
    expect(calendarDaysBetween('2026-06-01', '2026-06-22')).toBe(21);
  });
});
