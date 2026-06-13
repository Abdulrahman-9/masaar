import { describe, expect, it } from 'vitest';
import { detectSplitRisk, minParticipants, suggestMethod } from '@masaar/scpp-rules';

describe('suggestMethod — routing the 8 contracting methods (SCPP §11)', () => {
  it.each([
    // [description, input, expected method key, expected clause]
    ['sole-source case beats everything (11.5)', { estimatedValueUSD: 5_000, soleSourceCase: 'c' as const }, 'sole', '11.5'],
    ['< $10,000 → low-value (11.8.3)', { estimatedValueUSD: 9_999 }, 'low-value', '11.8.3'],
    ['$10,000 boundary → RFP (11.8.1)', { estimatedValueUSD: 10_000 }, 'rfp', '11.8.1'],
    ['$100,000 boundary → RFP (11.8.1)', { estimatedValueUSD: 100_000 }, 'rfp', '11.8.1'],
    ['recent qualified bidders → fast-track (11.7)', { estimatedValueUSD: 250_000, hasRecentQualifiedBidders: true }, 'fast-track', '11.7'],
    ['specialized/emergency → direct (11.4)', { estimatedValueUSD: 250_000, specializedOrEmergency: true }, 'direct', '11.4'],
    ['technically complex → two-phased (11.3)', { estimatedValueUSD: 5_000_000, technicallyComplex: true }, 'two-phased', '11.3'],
    ['pre-qualified list → limited (11.2)', { estimatedValueUSD: 1_000_000, hasPreQualifiedList: true }, 'limited', '11.2'],
    ['default above $100k → public (11.1)', { estimatedValueUSD: 1_000_000 }, 'public', '11.1'],
  ])('%s', (_desc, input, key, clause) => {
    const s = suggestMethod(input);
    expect(s.method.key).toBe(key);
    expect(s.method.scpp).toBe(clause);
    expect(s.reasonAr.length).toBeGreaterThan(0);
    expect(s.reasonEn.length).toBeGreaterThan(0);
  });

  it('rejects invalid values', () => {
    expect(() => suggestMethod({ estimatedValueUSD: -1 })).toThrow();
  });
});

describe('minParticipants', () => {
  it.each([
    ['direct', 3],
    ['rfp', 3],
    ['limited', 2],
    ['two-phased', 2],
    ['public', 0],
    ['sole', 0],
  ] as const)('%s → %d', (key, n) => {
    expect(minParticipants(key)).toBe(n);
  });
});

describe('detectSplitRisk — splitting to dodge Financial Authority is prohibited (7.2)', () => {
  const FA = 1_000_000;

  it('flags same-budget-code requests under FA that combine above it', () => {
    const groups = detectSplitRisk(
      [
        { id: 'R1', budgetCode: 'BC-7', estimatedValueUSD: 400_000, raisedOn: '2026-06-01' },
        { id: 'R2', budgetCode: 'BC-7', estimatedValueUSD: 400_000, raisedOn: '2026-06-10' },
        { id: 'R3', budgetCode: 'BC-7', estimatedValueUSD: 400_000, raisedOn: '2026-06-20' },
      ],
      FA,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.requestIds).toEqual(['R1', 'R2', 'R3']);
    expect(groups[0]!.combinedValueUSD).toBe(1_200_000);
    expect(groups[0]!.clause).toBe('7.2');
  });

  it('different budget codes are not grouped', () => {
    const groups = detectSplitRisk(
      [
        { id: 'R1', budgetCode: 'BC-1', estimatedValueUSD: 600_000, raisedOn: '2026-06-01' },
        { id: 'R2', budgetCode: 'BC-2', estimatedValueUSD: 600_000, raisedOn: '2026-06-02' },
      ],
      FA,
    );
    expect(groups).toHaveLength(0);
  });

  it('requests far apart in time are not flagged', () => {
    const groups = detectSplitRisk(
      [
        { id: 'R1', budgetCode: 'BC-7', estimatedValueUSD: 600_000, raisedOn: '2026-01-01' },
        { id: 'R2', budgetCode: 'BC-7', estimatedValueUSD: 600_000, raisedOn: '2026-06-01' },
      ],
      FA,
      90,
    );
    expect(groups).toHaveLength(0);
  });

  it('a request already at/above FA is not a split candidate', () => {
    const groups = detectSplitRisk(
      [
        { id: 'R1', budgetCode: 'BC-7', estimatedValueUSD: 1_200_000, raisedOn: '2026-06-01' },
        { id: 'R2', budgetCode: 'BC-7', estimatedValueUSD: 100_000, raisedOn: '2026-06-02' },
      ],
      FA,
    );
    expect(groups).toHaveLength(0);
  });
});
