import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { presentTender } from '../src/tenders/tender.presenter.js';
import type { AuthUser } from '../src/auth/auth.types.js';

/**
 * Fairness redaction (12.4.2 / rule #9). The price rule is hard for every role;
 * identity masking is role + award-state aware.
 */

const ROC: AuthUser = { userId: 'u', name: 'ROC', role: 'ROC_ADMIN' };
const OP: AuthUser = { userId: 'u', name: 'Op', role: 'OPERATOR_ADMIN', operatorId: 'op1' };
const AUDITOR: AuthUser = { userId: 'u', name: 'Aud', role: 'AUDITOR' };
const SUPER: AuthUser = { userId: 'u', name: 'S', role: 'SUPER_ADMIN' };

function tender(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    evaluationStep: 3, // commercial-analysis
    ratification: null,
    stages: [{ key: 'comm-analysis', order: 8, actualTo: null }],
    bidders: [
      { id: 'b1', name: 'Real A', vendorId: 'v1', technicalResult: 'PASS', priceUSD: 100 },
      { id: 'b2', name: 'Real B', vendorId: 'v2', technicalResult: 'FAIL', priceUSD: 90 },
    ],
    ...over,
  };
}

describe('price redaction (12.4.2 — hard for all roles)', () => {
  it('never emits an excluded (technical-fail) bidder price, even to SUPER_ADMIN', () => {
    for (const u of [OP, ROC, AUDITOR, SUPER]) {
      const out = presentTender(tender(), u);
      expect(out.bidders[1]!.priceUSD).toBeNull(); // FAIL bidder
    }
  });

  it('emits a qualified price only in a commercial step', () => {
    expect(presentTender(tender({ evaluationStep: 1 }), OP).bidders[0]!.priceUSD).toBeNull(); // technical-analysis
    expect(presentTender(tender({ evaluationStep: 3 }), OP).bidders[0]!.priceUSD).toBe(100); // commercial-analysis, PASS
  });
});

describe('identity masking (role + award state)', () => {
  it('masks identities from ROC/auditor pre-award', () => {
    for (const u of [ROC, AUDITOR]) {
      const out = presentTender(tender(), u);
      expect(out.bidders[0]!.name).toBe('مقدّم عطاء 1');
      expect(out.bidders[1]!.name).toBe('مقدّم عطاء 2');
      expect(out.bidders[0]!.vendorId).toBeNull();
    }
  });

  it('shows real identities to operators and evaluation (they run 12.4)', () => {
    expect(presentTender(tender(), OP).bidders[0]!.name).toBe('Real A');
    expect(presentTender(tender(), { ...ROC, role: 'EVALUATION' }).bidders[0]!.name).toBe('Real A');
  });

  it('discloses identities to ROC once the award is ratified', () => {
    const out = presentTender(tender({ ratification: { status: 'RATIFIED' } }), ROC);
    expect(out.bidders[0]!.name).toBe('Real A');
  });

  it('discloses identities at the ratify/sign stage', () => {
    const atRatify = tender({ stages: [{ key: 'ratify', order: 9, actualTo: null }] });
    expect(presentTender(atRatify, ROC).bidders[0]!.name).toBe('Real A');
  });
});
