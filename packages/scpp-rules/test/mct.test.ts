import { describe, expect, it } from 'vitest';
import { awardVerdict, mctCycleStatus } from '@masaar/scpp-rules';

// Notification on Monday 2026-06-01; Iraq weekend = Fri + Sat.
// 14 WD deadline → 2026-06-21 (Sun), 21 WD deadline → 2026-06-30 (Tue).
const NOTIFIED = '2026-06-01';

describe('mctCycleStatus — deadlines (6.9)', () => {
  it('computes 14 WD and 21 WD deadlines over the Fri/Sat weekend', () => {
    const s = mctCycleStatus({ notifiedOn: NOTIFIED, asOf: '2026-06-10' });
    expect(s.meetingDeadline).toBe('2026-06-21');
    expect(s.agreementDeadline).toBe('2026-06-30');
  });

  it('still pending inside the meeting window', () => {
    const s = mctCycleStatus({ notifiedOn: NOTIFIED, asOf: '2026-06-10' });
    expect(s.meetingOnTime).toBe('pending');
    expect(s.prevailingEstimate).toBe('PENDING');
  });
});

describe('mctCycleStatus — LC estimate prevails (6.9.2)', () => {
  it('no meeting within 14 WD → LC', () => {
    const s = mctCycleStatus({ notifiedOn: NOTIFIED, asOf: '2026-06-22' }); // 15 WD elapsed
    expect(s.meetingOnTime).toBe(false);
    expect(s.prevailingEstimate).toBe('LC');
    expect(s.clause).toBe('6.9.2');
  });

  it('meeting held late → LC', () => {
    const s = mctCycleStatus({ notifiedOn: NOTIFIED, meetingHeldOn: '2026-06-23', asOf: '2026-06-24' }); // 16 WD
    expect(s.meetingOnTime).toBe(false);
    expect(s.prevailingEstimate).toBe('LC');
  });
});

describe('mctCycleStatus — MCT estimate prevails (6.9.1)', () => {
  it('meeting on time but no agreement within 21 WD → MCT', () => {
    const s = mctCycleStatus({ notifiedOn: NOTIFIED, meetingHeldOn: '2026-06-15', asOf: '2026-07-01' }); // 22 WD
    expect(s.meetingOnTime).toBe(true);
    expect(s.prevailingEstimate).toBe('MCT');
    expect(s.clause).toBe('6.9.1');
  });
});

describe('mctCycleStatus — agreement reached', () => {
  it('meeting + agreement inside their windows → AGREED', () => {
    const s = mctCycleStatus({
      notifiedOn: NOTIFIED,
      meetingHeldOn: '2026-06-15', // 10 WD
      agreementReachedOn: '2026-06-29', // 20 WD
      asOf: '2026-07-05',
    });
    expect(s.prevailingEstimate).toBe('AGREED');
    expect(s.clause).toBeUndefined();
  });
});

describe('awardVerdict — the ±20% band (6.9.3 / 13.3 / 13.6)', () => {
  const EST = 4_200_000;

  it('within +20% → award (6.9.3)', () => {
    const v = awardVerdict(4_620_000, EST);
    expect(v.action).toBe('award');
    expect(v.clause).toBe('6.9.3');
    expect(v.deltaPct).toBeCloseTo(10, 5);
  });

  it('exactly +20% still awards', () => {
    expect(awardVerdict(5_040_000, EST).action).toBe('award');
  });

  it('above +20% → negotiate (13.3)', () => {
    const v = awardVerdict(5_100_000, EST);
    expect(v.action).toBe('negotiate');
    expect(v.clause).toBe('13.3');
  });

  it('below −20% → written capability clarification (13.6)', () => {
    const v = awardVerdict(3_300_000, EST);
    expect(v.action).toBe('clarify-capability');
    expect(v.clause).toBe('13.6');
    expect(v.deltaPct).toBeLessThan(-20);
  });

  it('rejects a non-positive estimate', () => {
    expect(() => awardVerdict(1, 0)).toThrow();
  });
});
