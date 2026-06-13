import { describe, expect, it } from 'vitest';
import {
  advanceGuaranteeValid,
  bidBondValid,
  extensionCap,
  guaranteeExpiringSoon,
  liquidatedDamagesCap,
  performanceBondValid,
  renewalAllowed,
  suspensionCap,
  variationOrdersCap,
} from '@masaar/scpp-rules';

const CONTRACT = 10_000_000;

describe('variationOrdersCap — VOs ≤ 10% of contract (18.1)', () => {
  it.each([
    [420_000, 4.2, 'ok'],
    [800_000, 8.0, 'risk'], // exactly 80% of the cap → risk
    [850_000, 8.5, 'risk'],
    [1_000_000, 10.0, 'breach'], // at the cap → breach
    [1_100_000, 11.0, 'breach'],
  ] as const)('$%d used → %d%% (%s)', (used, pct, status) => {
    const r = variationOrdersCap(used, CONTRACT);
    expect(r.usedPct).toBeCloseTo(pct, 1);
    expect(r.status).toBe(status);
    expect(r.clause).toBe('18.1');
  });

  it('rejects a non-positive base', () => {
    expect(() => variationOrdersCap(1, 0)).toThrow();
  });
});

describe('extensionCap — LC-authority extension ≤ 25% of term (19.3)', () => {
  it.each([
    [50, 'ok'],
    [80, 'risk'], // 21.9% of term = 87.7% of the cap
    [100, 'breach'], // 27.4%
  ] as const)('%d days on a 365-day term → %s', (days, status) => {
    const r = extensionCap(days, 365);
    expect(r.status).toBe(status);
    expect(r.clause).toBe('19.3');
  });
});

describe('suspensionCap — ≤ 25% of term (20.2)', () => {
  it('flags breach past a quarter of the term', () => {
    expect(suspensionCap(100, 365).status).toBe('breach');
    expect(suspensionCap(30, 365).status).toBe('ok');
  });
});

describe('liquidatedDamagesCap — LDs ≤ 10% of contract (21.2)', () => {
  it('breaches at 10%', () => {
    expect(liquidatedDamagesCap(1_000_000, CONTRACT).status).toBe('breach');
    expect(liquidatedDamagesCap(300_000, CONTRACT).status).toBe('ok');
  });
});

describe('renewalAllowed — ≤ 1 year (19.1)', () => {
  it.each([
    [1, true],
    [0.5, true],
    [1.5, false],
    [0, false],
  ] as const)('%d years → %s', (years, ok) => {
    expect(renewalAllowed(years).ok).toBe(ok);
  });
});

describe('guarantees', () => {
  const EST = 4_200_000;

  it('bid bond must be 1–3% of the estimate', () => {
    expect(bidBondValid(50_000, EST).ok).toBe(true); // 1.2%
    expect(bidBondValid(20_000, EST).ok).toBe(false); // 0.5%
    expect(bidBondValid(150_000, EST).ok).toBe(false); // 3.6%
  });

  it('performance bond ≥ 5% of contract value', () => {
    expect(performanceBondValid(250_000, 5_000_000).ok).toBe(true);
    expect(performanceBondValid(200_000, 5_000_000).ok).toBe(false);
  });

  it('advance-payment guarantee covers the advance', () => {
    expect(advanceGuaranteeValid(500_000, 500_000).ok).toBe(true);
    expect(advanceGuaranteeValid(400_000, 500_000).ok).toBe(false);
  });

  it('expiry within 60 days surfaces in reports', () => {
    expect(guaranteeExpiringSoon('2026-08-01', '2026-06-13')).toBe(true); // 49 days out
    expect(guaranteeExpiringSoon('2026-09-01', '2026-06-13')).toBe(false); // 80 days out
    expect(guaranteeExpiringSoon('2026-06-01', '2026-06-13')).toBe(false); // already expired
  });
});
