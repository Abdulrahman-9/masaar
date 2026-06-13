import { describe, expect, it } from 'vitest';
import { reducer, seedState, type State } from '../src/store';

/**
 * Breach-attempt tests: every guard is exercised by an explicit attempt to
 * violate the rule, and the store must refuse — the same contract the future
 * server API will honor.
 */

const fresh = (): State => seedState();

describe('PUBLISH_ANNOUNCEMENT guard (11.2)', () => {
  it('refuses to publish while checks fail', () => {
    const s0 = fresh(); // t2 limited: 0 invitees, not pre-qualified
    const s1 = reducer(s0, { type: 'PUBLISH_ANNOUNCEMENT', tenderId: 't2' });
    expect(s1.tenders.find((t) => t.id === 't2')!.announcement.publishedOn).toBeUndefined();
  });

  it('publishes once invitees ≥ 2 from the pre-qualified list', () => {
    let s = fresh();
    s = reducer(s, { type: 'SET_ANNOUNCEMENT', tenderId: 't2', patch: { inviteeCount: 2, inviteesPreQualified: true } });
    s = reducer(s, { type: 'PUBLISH_ANNOUNCEMENT', tenderId: 't2' });
    expect(s.tenders.find((t) => t.id === 't2')!.announcement.publishedOn).toBeDefined();
  });
});

describe('SET_PRICE guard (12.4.2)', () => {
  it('refuses a price during the technical steps even for a passing bidder', () => {
    const s1 = reducer(fresh(), { type: 'SET_PRICE', tenderId: 't1', bidderId: 'b1-t1', priceUSD: 4_410_000 });
    expect(s1.tenders.find((t) => t.id === 't1')!.bidders.find((b) => b.id === 'b1-t1')!.priceUSD).toBeUndefined();
  });

  it('refuses a price for a technically failed bidder in the commercial step', () => {
    let s = reducer(fresh(), { type: 'SET_EVAL_STEP', tenderId: 't1', step: 2 });
    s = reducer(s, { type: 'SET_PRICE', tenderId: 't1', bidderId: 'b2-t1', priceUSD: 3_900_000 });
    expect(s.tenders.find((t) => t.id === 't1')!.bidders.find((b) => b.id === 'b2-t1')!.priceUSD).toBeUndefined();
  });

  it('accepts a price for a qualified bidder in the commercial step', () => {
    let s = reducer(fresh(), { type: 'SET_EVAL_STEP', tenderId: 't1', step: 2 });
    s = reducer(s, { type: 'SET_PRICE', tenderId: 't1', bidderId: 'b1-t1', priceUSD: 4_410_000 });
    expect(s.tenders.find((t) => t.id === 't1')!.bidders.find((b) => b.id === 'b1-t1')!.priceUSD).toBe(4_410_000);
  });
});

describe('COMPLETE_STAGE guard (docs gate)', () => {
  it('refuses to close a stage missing required documents', () => {
    const s1 = reducer(fresh(), { type: 'COMPLETE_STAGE', tenderId: 't2', stageKey: 'approval', actualTo: '2026-06-13' });
    expect(s1.tenders.find((t) => t.id === 't2')!.stages.find((x) => x.key === 'approval')!.actualTo).toBeUndefined();
  });

  it('closes once the documents are uploaded', () => {
    let s = reducer(fresh(), { type: 'TOGGLE_DOC', tenderId: 't2', stageKey: 'approval', doc: 'stage-report' });
    s = reducer(s, { type: 'COMPLETE_STAGE', tenderId: 't2', stageKey: 'approval', actualTo: '2026-06-13' });
    expect(s.tenders.find((t) => t.id === 't2')!.stages.find((x) => x.key === 'approval')!.actualTo).toBe('2026-06-13');
  });
});

describe('CREATE_TENDER', () => {
  it('generates a code, method-appropriate stages, and no MCT below FA', () => {
    const s1 = reducer(fresh(), {
      type: 'CREATE_TENDER',
      title: { ar: 'تجهيز مضخات', en: 'Pump supply' },
      budgetCode: 'WQ-PMP-3',
      estimatedValueUSD: 1_500_000,
      methodId: 7,
    });
    const t = s1.tenders[0]!;
    expect(t.code).toBe('WQ-PRJ-0099');
    expect(t.stages.some((x) => x.key === 'preq')).toBe(false); // public: no pre-qualification (11.1)
    expect(t.mct).toBeUndefined();
  });

  it('opens an MCT cycle automatically above Financial Authority (6.9)', () => {
    const s1 = reducer(fresh(), {
      type: 'CREATE_TENDER',
      title: { ar: 'مشروع كبير', en: 'Major project' },
      budgetCode: 'MJ-X-1',
      estimatedValueUSD: 6_500_000,
      methodId: 7,
    });
    expect(s1.tenders[0]!.mct).toBeDefined();
    expect(s1.tenders[0]!.mct!.lcEstimateUSD).toBe(6_500_000);
  });
});

describe('RATIFY / RETURN_WITH_NOTES guards (admin award decision)', () => {
  // t3 is seeded at the ratification stage (above FA, MCT case).
  it('refuses to ratify a tender not yet at the ratify stage', () => {
    const s1 = reducer(fresh(), { type: 'RATIFY', tenderId: 't1', by: 'ROC' });
    expect(s1.tenders.find((t) => t.id === 't1')!.ratification).toBeUndefined();
  });

  it('ratifies a tender at the ratify stage', () => {
    const s1 = reducer(fresh(), { type: 'RATIFY', tenderId: 't3', by: 'د. سارة الجبوري' });
    const r = s1.tenders.find((t) => t.id === 't3')!.ratification;
    expect(r?.status).toBe('ratified');
    expect(r?.by).toBe('د. سارة الجبوري');
  });

  it('refuses to return without notes', () => {
    const s1 = reducer(fresh(), { type: 'RETURN_WITH_NOTES', tenderId: 't3', by: 'ROC', notes: '   ' });
    expect(s1.tenders.find((t) => t.id === 't3')!.ratification).toBeUndefined();
  });

  it('returns with notes and will not decide twice', () => {
    let s = reducer(fresh(), { type: 'RETURN_WITH_NOTES', tenderId: 't3', by: 'ROC', notes: 'إعادة تقييم البند 4' });
    expect(s.tenders.find((t) => t.id === 't3')!.ratification!.status).toBe('returned');
    s = reducer(s, { type: 'RATIFY', tenderId: 't3', by: 'ROC' }); // already decided
    expect(s.tenders.find((t) => t.id === 't3')!.ratification!.status).toBe('returned');
  });
});

describe('audit log (8.1-e)', () => {
  it('appends an entry for every action — including refused attempts', () => {
    const s0 = fresh();
    const s1 = reducer(s0, { type: 'PUBLISH_ANNOUNCEMENT', tenderId: 't2' }); // refused
    const s2 = reducer(s1, { type: 'SET_EVAL_STEP', tenderId: 't1', step: 2 }); // applied
    expect(s1.audit).toHaveLength(1);
    expect(s2.audit).toHaveLength(2);
    expect(s2.audit[0]!.target).toBe('WQ-MNT-0098');
    expect(s2.audit[1]!.action).toBe('SET_EVAL_STEP');
  });
});
