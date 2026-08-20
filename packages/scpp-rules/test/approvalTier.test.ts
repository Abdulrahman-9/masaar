import { describe, expect, it } from 'vitest';
import { approvalTierFor, tierNeedsApproval, type ApprovalTiers } from '../src/approvalTier';

/**
 * The client's approval ladder (ق1, 2026-08-20). The two seeded ceilings are the ones the
 * client named in session — 5M and 10M — so the boundary cases below are the literal figures
 * an operator will type, not synthetic edges.
 */
const SEED: ApprovalTiers = { operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 };

describe('approvalTierFor — the three bands (ق1)', () => {
  it('ط1 — a value inside the operator authority needs no approval act', () => {
    expect(approvalTierFor(0, SEED)).toBe('OPERATOR');
    expect(approvalTierFor(850_000, SEED)).toBe('OPERATOR');
    expect(approvalTierFor(4_200_000, SEED)).toBe('OPERATOR');
  });

  it('ط2 — above the operator ceiling up to the JMC ceiling goes to the joint committee', () => {
    expect(approvalTierFor(5_000_000.01, SEED)).toBe('JMC');
    expect(approvalTierFor(7_800_000, SEED)).toBe('JMC');
  });

  it('ط3 — above the JMC ceiling goes to the parent company (MDOC)', () => {
    expect(approvalTierFor(10_000_000.01, SEED)).toBe('MDOC');
    expect(approvalTierFor(12_400_000, SEED)).toBe('MDOC');
  });
});

describe('approvalTierFor — the exact boundaries the client stated', () => {
  it('5,000,000 is still the operator’s — the ceiling is INCLUSIVE', () => {
    expect(approvalTierFor(5_000_000, SEED)).toBe('OPERATOR');
  });

  it('one cent past 5,000,000 is the JMC’s', () => {
    expect(approvalTierFor(5_000_000.01, SEED)).toBe('JMC');
  });

  it('10,000,000 is still the JMC’s — the ceiling is INCLUSIVE', () => {
    expect(approvalTierFor(10_000_000, SEED)).toBe('JMC');
  });

  it('one cent past 10,000,000 is MDOC’s', () => {
    expect(approvalTierFor(10_000_000.01, SEED)).toBe('MDOC');
  });
});

describe('approvalTierFor — fail closed on a ladder that cannot be trusted', () => {
  it('no configuration at all resolves to the HIGHEST gate, never the lowest', () => {
    expect(approvalTierFor(1, null)).toBe('MDOC');
    expect(approvalTierFor(1, undefined)).toBe('MDOC');
  });

  it('a non-finite ceiling is not a ladder', () => {
    expect(approvalTierFor(1, { operatorMaxUSD: Number.NaN, jmcMaxUSD: 10_000_000 })).toBe('MDOC');
    expect(approvalTierFor(1, { operatorMaxUSD: 5_000_000, jmcMaxUSD: Number.POSITIVE_INFINITY })).toBe('MDOC');
  });

  it('a negative ceiling is not a ladder', () => {
    expect(approvalTierFor(1, { operatorMaxUSD: -1, jmcMaxUSD: 10_000_000 })).toBe('MDOC');
  });

  it('an inverted ladder (JMC ceiling below the operator’s) is a misconfiguration, not a two-tier ladder', () => {
    // were this tolerated, a 4M request would read OPERATOR under a ladder whose JMC band is empty
    expect(approvalTierFor(4_000_000, { operatorMaxUSD: 5_000_000, jmcMaxUSD: 1_000_000 })).toBe('MDOC');
  });

  it('an unreadable estimate clears nothing', () => {
    expect(approvalTierFor(Number.NaN, SEED)).toBe('MDOC');
  });

  it('a degenerate but ordered ladder still works (both ceilings equal → no JMC band)', () => {
    const flat: ApprovalTiers = { operatorMaxUSD: 5_000_000, jmcMaxUSD: 5_000_000 };
    expect(approvalTierFor(5_000_000, flat)).toBe('OPERATOR');
    expect(approvalTierFor(5_000_000.01, flat)).toBe('MDOC');
  });
});

describe('tierNeedsApproval — ط1 is «متابعة وتدقيق فقط»', () => {
  it('only the two upper tiers carry an approval gate', () => {
    expect(tierNeedsApproval('OPERATOR')).toBe(false);
    expect(tierNeedsApproval('JMC')).toBe(true);
    expect(tierNeedsApproval('MDOC')).toBe(true);
  });
});
