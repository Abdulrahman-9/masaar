import { describe, expect, it } from 'vitest';
import {
  aboveOwnFA, byName, byOid, defaultAnnouncementFor, emptyState, enabledSuperAdmins, faFor, reducer, scopeConsistent, seedState,
  type Actor, type MaterialDeclaration, type State, type Tender,
} from '../src/store';

/**
 * Breach-attempt tests: every guard is exercised by an explicit attempt to
 * violate the rule, and the store must refuse — the same contract the future
 * server API will honor.
 */

const fresh = (): State => seedState();

// the ROC officer acting on award decisions & tender lifecycle — the immutable Actor now
// required by RATIFY / RETURN / CANCEL / SUSPEND / RESUME (bound by oid, not a display name)
const ROC: Actor = { oid: 'oid-roc-01', name: 'د. سارة الجبوري', role: 'ROC_ADMIN' };

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
      fieldId: 'f-ru', // op-bec, contract FA 5M
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
      fieldId: 'f-ru', // op-bec, contract FA 5M — 6.5M is above it
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
    const s1 = reducer(fresh(), { type: 'RATIFY', tenderId: 't1', by: ROC });
    expect(s1.tenders.find((t) => t.id === 't1')!.ratification).toBeUndefined();
  });

  it('ratifies a tender at the ratify stage, binding the decision to the immutable Actor', () => {
    const s1 = reducer(fresh(), { type: 'RATIFY', tenderId: 't3', by: ROC });
    const r = s1.tenders.find((t) => t.id === 't3')!.ratification;
    expect(r?.status).toBe('ratified');
    expect(r?.by).toEqual(ROC); // the whole Actor, not just a name
    expect(byName(r!.by)).toBe('د. سارة الجبوري');
    expect(byOid(r!.by)).toBe('oid-roc-01');
  });

  it('writes the Actor onto the audit row for the ratify decision', () => {
    const s1 = reducer(fresh(), { type: 'RATIFY', tenderId: 't3', by: ROC });
    const row = s1.audit[s1.audit.length - 1]!;
    expect(row.action).toBe('RATIFY');
    expect(byName(row.by!)).toBe('د. سارة الجبوري');
    expect(byOid(row.by!)).toBe('oid-roc-01');
  });

  it('§15.3 hard-blocks ratifying a lone bid advertised under 21 days; ≥21 or multi-bid passes', () => {
    // a tender parked at the ratify stage with a controllable bid count + advertising period
    const atRatify = (bidderCount: number, periodDays: number): Tender =>
      ({ id: 'tr', code: 'TR-0001', title: { ar: 'x', en: 'x' }, budgetCode: 'X', estimatedValueUSD: 1_000_000,
         methodId: 7, createdOn: '2026-01-01', stages: [{ key: 'ratify', uploadedDocs: [] }],
         announcement: { ...defaultAnnouncementFor(7), periodDays }, evaluationStep: 3,
         bidders: Array.from({ length: bidderCount }, (_, i) => ({ id: `b${i}`, name: `b${i}`, docsOk: true, bondOk: true })) }) as Tender;
    const ratifyOf = (t: Tender) =>
      reducer({ ...emptyState(), tenders: [t] }, { type: 'RATIFY', tenderId: 'tr', by: ROC }).tenders[0]!.ratification;

    expect(ratifyOf(atRatify(1, 14))).toBeUndefined();               // single bid + 14 days → blocked (15.3)
    expect(ratifyOf(atRatify(1, 21))?.status).toBe('ratified');      // single bid + 21 days → permitted
    expect(ratifyOf(atRatify(3, 14))?.status).toBe('ratified');      // more than one bid → not a lone-bid case
  });

  it('refuses to return without notes', () => {
    const s1 = reducer(fresh(), { type: 'RETURN_WITH_NOTES', tenderId: 't3', by: ROC, notes: '   ' });
    expect(s1.tenders.find((t) => t.id === 't3')!.ratification).toBeUndefined();
  });

  it('returns with notes and will not decide twice', () => {
    let s = reducer(fresh(), { type: 'RETURN_WITH_NOTES', tenderId: 't3', by: ROC, notes: 'إعادة تقييم البند 4' });
    expect(s.tenders.find((t) => t.id === 't3')!.ratification!.status).toBe('returned');
    s = reducer(s, { type: 'RATIFY', tenderId: 't3', by: ROC }); // already decided
    expect(s.tenders.find((t) => t.id === 't3')!.ratification!.status).toBe('returned');
  });

  it('tolerates BOTH by shapes: a legacy/API display-name string and a full Actor', () => {
    // API-hydrated rows carry only a name string; local rows carry the Actor. Readers handle both.
    expect(byName('د. سارة الجبوري')).toBe('د. سارة الجبوري');
    expect(byOid('د. سارة الجبوري')).toBeUndefined();
    expect(byName(ROC)).toBe('د. سارة الجبوري');
    expect(byOid(ROC)).toBe('oid-roc-01');
  });
});

describe('contract cap guards (§18–21) + server-bound parity', () => {
  const c1 = (s: State) => s.contracts.find((c) => c.id === 'c1')!;

  it('applies a variation order within the 10% cap', () => {
    const s = reducer(fresh(), { type: 'ADD_VO', contractId: 'c1', valueUSD: 150_000, approvedOn: '2026-07-16' });
    expect(c1(s).voTotalUSD).toBe(1_200_000); // 9.6%, still within
  });

  it('refuses a variation order that breaches the 10% cap (§18.1)', () => {
    const s = reducer(fresh(), { type: 'ADD_VO', contractId: 'c1', valueUSD: 300_000, approvedOn: '2026-07-16' });
    expect(c1(s).voTotalUSD).toBe(1_050_000); // unchanged — 1,350,000 would be 10.8%
  });

  it('refuses a sub-cent VO/LD amount (server @Min(0.01))', () => {
    const s1 = reducer(fresh(), { type: 'ADD_VO', contractId: 'c1', valueUSD: 0.005, approvedOn: '2026-07-16' });
    expect(c1(s1).voTotalUSD).toBe(1_050_000);
    const s2 = reducer(fresh(), { type: 'ADD_LD', contractId: 'c1', valueUSD: 0.005, appliedOn: '2026-07-16' });
    expect(c1(s2).ldTotalUSD).toBe(310_000);
  });

  it('applies a whole-day extension within the 25% cap but refuses a breach', () => {
    const ok = reducer(fresh(), { type: 'ADD_EXTENSION', contractId: 'c1', days: 30, approvedOn: '2026-07-16' });
    expect(c1(ok).extensionDays).toBe(120); // 22.2% of 540
    const breach = reducer(fresh(), { type: 'ADD_EXTENSION', contractId: 'c1', days: 50, approvedOn: '2026-07-16' });
    expect(c1(breach).extensionDays).toBe(90); // 140d would be 25.9%
  });

  it('refuses a non-integer extension (server @IsInt)', () => {
    const s = reducer(fresh(), { type: 'ADD_EXTENSION', contractId: 'c1', days: 10.5, approvedOn: '2026-07-16' });
    expect(c1(s).extensionDays).toBe(90);
  });

  it('adds a performance bond ≥5% of contract value but refuses one below', () => {
    const below = reducer(fresh(), { type: 'ADD_GUARANTEE', contractId: 'c1', kind: 'performance', valueUSD: 400_000, expiresOn: '2027-01-01' });
    expect(c1(below).guarantees).toHaveLength(2); // 3.2% < 5% — refused
    const ok = reducer(fresh(), { type: 'ADD_GUARANTEE', contractId: 'c1', kind: 'performance', valueUSD: 700_000, expiresOn: '2027-01-01' });
    expect(c1(ok).guarantees).toHaveLength(3); // 5.6% ≥ 5%
  });
});

describe('contract lifecycle actions (stage / suspension / renewal)', () => {
  const c = (s: State, id: string) => s.contracts.find((x) => x.id === id)!;

  it('advances the current stage and records a stage event', () => {
    const beforeDone = c(fresh(), 'c1').stages.filter((x) => x.actualTo).length;
    const s = reducer(fresh(), { type: 'ADVANCE_CONTRACT_STAGE', contractId: 'c1', actualTo: '2026-07-16' });
    expect(c(s, 'c1').stages.filter((x) => x.actualTo).length).toBe(beforeDone + 1);
    expect(c(s, 'c1').events?.[0]?.kind).toBe('stage');
  });

  it('records a suspension within the §20.2 cap but refuses a breach or a fraction', () => {
    const ok = reducer(fresh(), { type: 'ADD_SUSPENSION', contractId: 'c1', days: 30, on: '2026-07-16' });
    expect(c(ok, 'c1').suspensionDays).toBe(30);
    // c3 already has 45 of the 600-day term (cap 150); +120 → 165 = 27.5% > 25%
    const breach = reducer(fresh(), { type: 'ADD_SUSPENSION', contractId: 'c3', days: 120, on: '2026-07-16' });
    expect(c(breach, 'c3').suspensionDays).toBe(45);
    const frac = reducer(fresh(), { type: 'ADD_SUSPENSION', contractId: 'c1', days: 5.5, on: '2026-07-16' });
    expect(c(frac, 'c1').suspensionDays).toBe(0);
  });

  it('renews the contract up to one year but refuses a longer renewal (§19.1)', () => {
    const ok = reducer(fresh(), { type: 'RENEW_CONTRACT', contractId: 'c1', years: 1, on: '2026-07-16' });
    expect(c(ok, 'c1').renewalYears).toBe(1);
    expect(c(ok, 'c1').events?.[0]?.kind).toBe('renewal');
    const tooLong = reducer(fresh(), { type: 'RENEW_CONTRACT', contractId: 'c1', years: 2, on: '2026-07-16' });
    expect(c(tooLong, 'c1').renewalYears).toBeUndefined();
  });
});

describe('tender lifecycle guards (cancel / suspend / resume)', () => {
  const REASON = 'documented governance cancellation for audit compliance';
  const t = (s: State, id: string) => s.tenders.find((x) => x.id === id)!;

  it('cancels an active, un-awarded tender with a valid justification, attributing the Actor', () => {
    const s = reducer(fresh(), { type: 'CANCEL_TENDER', tenderId: 't1', reason: REASON, by: ROC });
    expect(t(s, 't1').lifecycle?.status).toBe('cancelled');
    expect(t(s, 't1').lifecycle!.by).toEqual(ROC);
    expect(s.audit[s.audit.length - 1]!.by).toEqual(ROC); // the audit row carries the Actor too
  });

  it('refuses a justification shorter than 20 or longer than 2000 chars (server @Length(20,2000))', () => {
    const short = reducer(fresh(), { type: 'CANCEL_TENDER', tenderId: 't1', reason: 'too short', by: ROC });
    expect(t(short, 't1').lifecycle).toBeUndefined();
    const long = reducer(fresh(), { type: 'CANCEL_TENDER', tenderId: 't1', reason: 'x'.repeat(2001), by: ROC });
    expect(t(long, 't1').lifecycle).toBeUndefined();
  });

  it('refuses to cancel a ratified tender (§awarded)', () => {
    let s = reducer(fresh(), { type: 'RATIFY', tenderId: 't3', by: ROC });
    s = reducer(s, { type: 'CANCEL_TENDER', tenderId: 't3', reason: REASON, by: ROC });
    expect(t(s, 't3').lifecycle).toBeUndefined();
  });

  it('suspends only an active tender and resumes only a suspended one', () => {
    let s = reducer(fresh(), { type: 'SUSPEND_TENDER', tenderId: 't1', reason: REASON, by: ROC });
    expect(t(s, 't1').lifecycle?.status).toBe('suspended');
    s = reducer(s, { type: 'RESUME_TENDER', tenderId: 't1', reason: REASON, by: ROC });
    expect(t(s, 't1').lifecycle).toBeUndefined();
  });

  it('blocks ratification while suspended, and allows it once resumed', () => {
    // t3 is seeded at the ratification stage
    let s = reducer(fresh(), { type: 'SUSPEND_TENDER', tenderId: 't3', reason: REASON, by: ROC });
    s = reducer(s, { type: 'RATIFY', tenderId: 't3', by: ROC });
    expect(t(s, 't3').ratification).toBeUndefined(); // suspended → ratify refused
    s = reducer(s, { type: 'RESUME_TENDER', tenderId: 't3', reason: REASON, by: ROC });
    s = reducer(s, { type: 'RATIFY', tenderId: 't3', by: ROC });
    expect(t(s, 't3').ratification?.status).toBe('ratified');
  });
});

describe('audit log (8.1-e)', () => {
  it('appends an entry for an applied action; a refused guard is silent (no false-success row)', () => {
    // a refused patchTender guard preserves state identity → no misleading "success" audit row.
    // (Distinguishing an AUDITED refusal is a documented Track-5 debt; today refusals are silent.)
    const s0 = fresh();
    const s1 = reducer(s0, { type: 'PUBLISH_ANNOUNCEMENT', tenderId: 't2' }); // refused → silent
    const s2 = reducer(s1, { type: 'SET_EVAL_STEP', tenderId: 't1', step: 2 }); // applied → one row
    expect(s1.audit).toHaveLength(0);
    expect(s2.audit).toHaveLength(1);
    expect(s2.audit[0]!.action).toBe('SET_EVAL_STEP');
  });
});

describe('a refused action never appends a success-shaped audit row (8.1-e)', () => {
  /**
   * The audit wrapper keys on `next === state`, so any guard that refuses MUST hand back the
   * original reference. A branch that allocated `{...t}` before refusing wrote a row that read
   * exactly like an applied one — the log then lied about acts the engine had actually blocked.
   */
  const blockedBidder = (): State =>
    ({ ...emptyState(), tenders: [{ id: 'tb', code: 'TB-0001', title: { ar: 'x', en: 'x' }, budgetCode: 'X', estimatedValueUSD: 1,
       methodId: 7, createdOn: '2026-01-01', stages: [{ key: 'comm-analysis', uploadedDocs: [] }], announcement: defaultAnnouncementFor(7),
       evaluationStep: 3, bidders: [{ id: 'b1', name: 'x', docsOk: true, bondOk: true,
         materials: [{ materialId: 'turbines', imported: true, origin: 'China' }] as MaterialDeclaration[] }] }] } as State);

  it('SET_TECHNICAL refused by the C8.6 origin gate (10.6.18) writes ZERO rows', () => {
    const s0 = blockedBidder();
    const s1 = reducer(s0, { type: 'SET_TECHNICAL', tenderId: 'tb', bidderId: 'b1', result: 'pass' });
    expect(s1.tenders[0]!.bidders[0]!.technicalResult).toBeUndefined();
    expect(s1.audit).toHaveLength(0);
    expect(s1).toBe(s0); // the whole state reference is preserved, not just the value
  });

  it('BAN_VENDOR refused beyond the 12-month cap (14.3) writes ZERO rows', () => {
    const s0 = fresh();
    const s1 = reducer(s0, { type: 'BAN_VENDOR', vendorId: 'v1', banUntil: '2030-01-01', reason: 'رفض توقيع عقد محال' });
    expect(s1.vendors.find((v) => v.id === 'v1')!.banUntil).toBeUndefined();
    expect(s1.audit).toHaveLength(0);
    expect(s1).toBe(s0);
  });

  it('ADD_VO refused by the §18.1 10% cap writes ZERO rows', () => {
    const s0 = fresh();
    const s1 = reducer(s0, { type: 'ADD_VO', contractId: 'c1', valueUSD: 300_000, approvedOn: '2026-07-16' });
    expect(s1.contracts.find((c) => c.id === 'c1')!.voTotalUSD).toBe(1_050_000);
    expect(s1.audit).toHaveLength(0);
    expect(s1).toBe(s0);
  });

  it('SET_PRICE refused by the 12.4.2 mask and COMPLETE_STAGE refused by the docs gate write ZERO rows', () => {
    const s0 = fresh();
    // t1 is on a technical step — the price column is masked
    const price = reducer(s0, { type: 'SET_PRICE', tenderId: 't1', bidderId: 'b1-t1', priceUSD: 4_410_000 });
    expect(price.audit).toHaveLength(0);
    expect(price).toBe(s0);
    // t2 'approval' has no uploaded documents
    const close = reducer(s0, { type: 'COMPLETE_STAGE', tenderId: 't2', stageKey: 'approval', actualTo: '2026-06-13' });
    expect(close.audit).toHaveLength(0);
    expect(close).toBe(s0);
  });

  it('TOGGLE_DOC on an unknown or already-closed stage writes ZERO rows', () => {
    const s0 = fresh();
    const unknown = reducer(s0, { type: 'TOGGLE_DOC', tenderId: 't2', stageKey: 'no-such-stage', doc: 'stage-report' });
    expect(unknown.audit).toHaveLength(0);
    expect(unknown).toBe(s0);
    // t1 'cost' is already closed — its documents are frozen
    const closed = reducer(s0, { type: 'TOGGLE_DOC', tenderId: 't1', stageKey: 'cost', doc: 'stage-report' });
    expect(closed.audit).toHaveLength(0);
    expect(closed).toBe(s0);
  });

  it('still audits the APPLIED twin of each guard — the suppression is refusal-only', () => {
    const vo = reducer(fresh(), { type: 'ADD_VO', contractId: 'c1', valueUSD: 150_000, approvedOn: '2026-07-16' });
    expect(vo.audit).toHaveLength(1);
    expect(vo.audit[0]!.action).toBe('ADD_VO');
    const ban = reducer(fresh(), { type: 'BAN_VENDOR', vendorId: 'v1', banUntil: '2026-10-01', reason: 'رفض توقيع عقد محال' });
    expect(ban.audit).toHaveLength(1);
    const doc = reducer(fresh(), { type: 'TOGGLE_DOC', tenderId: 't2', stageKey: 'approval', doc: 'stage-report' });
    expect(doc.audit).toHaveLength(1);
  });
});

/* ---------------- §9 C8.1 — the clause attestation that unblocks publication ---------------- */

describe('SET_LC_CLAUSE (C8.1)', () => {
  /** An UNPUBLISHED §9 tender: EPC scope, no field → authority unresolvable → above (fail closed). */
  const lcState = (): State => ({
    ...emptyState(),
    tenders: [{ id: 'tp', code: 'TP-0001', title: { ar: 'x', en: 'x' }, budgetCode: 'X', estimatedValueUSD: 5_000_000,
      methodId: 6, createdOn: '2026-01-01', scope: 'ENGINEERING_CONSTRUCTION', stages: [], evaluationStep: 0, bidders: [],
      announcement: { mode: 'limited', periodDays: 14, newspapers: ['', '', ''], lcWebsite: false, rocWebsite: false, inviteeCount: 2, inviteesPreQualified: true } } as Tender],
  });

  it('records the attestation on a tender the requirement applies to, attributed to the Actor', () => {
    const s = reducer(lcState(), { type: 'SET_LC_CLAUSE', tenderId: 'tp', affixed: true, by: ROC });
    expect(s.tenders[0]!.localContentClauseAffixed).toBe(true);
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]!.action).toBe('SET_LC_CLAUSE');
    expect(s.audit[0]!.by).toEqual(ROC);
  });

  it('unblocks PUBLISH_ANNOUNCEMENT for a §9 tender that had no writer for the gate at all', () => {
    const s0 = lcState();
    const held = reducer(s0, { type: 'PUBLISH_ANNOUNCEMENT', tenderId: 'tp' });
    expect(held.tenders[0]!.announcement.publishedOn).toBeUndefined(); // the dead end, before
    let s = reducer(s0, { type: 'SET_LC_CLAUSE', tenderId: 'tp', affixed: true, by: ROC });
    s = reducer(s, { type: 'PUBLISH_ANNOUNCEMENT', tenderId: 'tp' });
    expect(s.tenders[0]!.announcement.publishedOn).toBeDefined();
  });

  it('refuses to fabricate a compliance record on a tender §9 does not reach', () => {
    const s0 = fresh(); // t2 is OTHER scope below authority
    const s1 = reducer(s0, { type: 'SET_LC_CLAUSE', tenderId: 't2', affixed: true, by: ROC });
    expect(s1.tenders.find((x) => x.id === 't2')!.localContentClauseAffixed).toBeUndefined();
    expect(s1.audit).toHaveLength(0);
    expect(s1).toBe(s0);
  });

  it('refuses to flip the attestation once the announcement is published', () => {
    // t3 (§9 applies) is seeded PUBLISHED — publication was gated on this attestation, so a
    // retroactive flip would rewrite the gate the publication passed through.
    const s0 = fresh();
    expect(s0.tenders.find((x) => x.id === 't3')!.announcement.publishedOn).toBeDefined();
    const s1 = reducer(s0, { type: 'SET_LC_CLAUSE', tenderId: 't3', affixed: true, by: ROC });
    expect(s1.audit).toHaveLength(0);
    expect(s1).toBe(s0);
  });

  it('is a silent no-op when the attestation already holds that value', () => {
    const s0 = reducer(lcState(), { type: 'SET_LC_CLAUSE', tenderId: 'tp', affixed: true, by: ROC });
    const s1 = reducer(s0, { type: 'SET_LC_CLAUSE', tenderId: 'tp', affixed: true, by: ROC });
    expect(s1.audit).toHaveLength(1); // still just the first row
    expect(s1).toBe(s0);
  });
});

/* ---------------- access governance ---------------- */

const SUPER: Actor = { oid: 'oid-super-01', name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN' };
const OTHER_SUPER: Actor = { oid: 'oid-x', name: 'مشرف آخر', role: 'SUPER_ADMIN' };
const WHY = 'مسوّغ نظامي مكتوب بطول كافٍ للتوثيق';
const u = (s: State, id: string) => s.users.find((x) => x.id === id)!;
const lastRow = (s: State) => s.audit[s.audit.length - 1]!;

describe('access guards mirror users.service.ts', () => {
  it('refuses to demote the last enabled super admin, and labels the refusal', () => {
    const s0 = fresh();
    expect(enabledSuperAdmins(s0)).toBe(1); // u1 enabled, u2 disabled
    const s1 = reducer(s0, { type: 'SET_USER_ROLE', userId: 'u1', role: 'AUDITOR', reason: WHY, by: OTHER_SUPER });
    expect(u(s1, 'u1').role).toBe('SUPER_ADMIN'); // untouched
    expect(lastRow(s1).outcome).toBe('refused');
    expect(lastRow(s1).reasonCode).toBe('last-super');
    expect(u(s1, 'u1').events![0]!.kind).toBe('refused');
  });

  it('refuses to disable the last enabled super admin', () => {
    const s1 = reducer(fresh(), { type: 'SET_USER_DISABLED', userId: 'u1', disabled: true, reason: WHY, by: OTHER_SUPER });
    expect(u(s1, 'u1').disabled).toBe(false);
    expect(lastRow(s1).reasonCode).toBe('last-super');
  });

  it('refuses self-demotion even when another super admin could be enabled', () => {
    let s = reducer(fresh(), { type: 'SET_USER_DISABLED', userId: 'u2', disabled: false, reason: WHY, by: SUPER });
    expect(enabledSuperAdmins(s)).toBe(2); // no longer the last one
    s = reducer(s, { type: 'SET_USER_ROLE', userId: 'u1', role: 'AUDITOR', reason: WHY, by: SUPER }); // acting on self
    expect(u(s, 'u1').role).toBe('SUPER_ADMIN');
    expect(lastRow(s).reasonCode).toBe('self');
  });

  it('allows the demotion once a second super admin is enabled and someone else acts', () => {
    let s = reducer(fresh(), { type: 'SET_USER_DISABLED', userId: 'u2', disabled: false, reason: WHY, by: SUPER });
    s = reducer(s, { type: 'SET_USER_ROLE', userId: 'u1', role: 'AUDITOR', reason: WHY, by: OTHER_SUPER });
    expect(u(s, 'u1').role).toBe('AUDITOR');
    expect(lastRow(s).outcome).toBe('applied');
    expect(u(s, 'u1').events![0]!.detail).toBe('SUPER_ADMIN→AUDITOR');
  });

  it('refuses an operator role without a company, and a platform role carrying one', () => {
    const s0 = fresh();
    const s1 = reducer(s0, { type: 'SET_USER_ROLE', userId: 'u5', role: 'OPERATOR_USER', reason: WHY, by: SUPER });
    expect(u(s1, 'u5').role).toBe('EVALUATION'); // refused: no operatorId supplied
    expect(lastRow(s1).reasonCode).toBe('scope');
    // moving an operator user to a platform role drops the company rather than keeping an illegal pair
    const s2 = reducer(s0, { type: 'SET_USER_ROLE', userId: 'u9', role: 'AUDITOR', reason: WHY, by: SUPER });
    expect(u(s2, 'u9').operatorId).toBeUndefined();
    expect(scopeConsistent(u(s2, 'u9').role, u(s2, 'u9').operatorId)).toBe(true);
  });

  it('refuses a duplicate email or azure oid on create', () => {
    const base = { type: 'CREATE_USER', userId: 'uX', name: 'حساب جديد', role: 'AUDITOR', twoFa: true, reason: WHY, by: SUPER } as const;
    const dupEmail = reducer(fresh(), { ...base, azureOid: 'oid-new', email: 'auditor@bsa.iq' });
    expect(dupEmail.users).toHaveLength(10);
    expect(lastRow(dupEmail).reasonCode).toBe('dup-email');

    const dupOid = reducer(fresh(), { ...base, azureOid: 'oid-audit-01', email: 'new@bsa.iq' });
    expect(dupOid.users).toHaveLength(10);
    expect(lastRow(dupOid).reasonCode).toBe('dup-oid');
  });

  it('refuses an unknown company and creates against a known one', () => {
    const base = { type: 'CREATE_USER', userId: 'uX', azureOid: 'oid-new', name: 'موظف عقود', email: 'new@bec.iq', role: 'OPERATOR_USER', twoFa: true, reason: WHY, by: SUPER } as const;
    const bad = reducer(fresh(), { ...base, operatorId: 'op-nope' });
    expect(bad.users).toHaveLength(10);
    expect(lastRow(bad).reasonCode).toBe('unknown-operator');

    const ok = reducer(fresh(), { ...base, operatorId: 'op-bec' });
    expect(ok.users).toHaveLength(11);
    expect(lastRow(ok).outcome).toBe('applied');
    expect(lastRow(ok).target).toBe('new@bec.iq'); // same target the server audits (dto.email)
    expect(u(ok, 'uX').events![0]!.kind).toBe('create');
  });

  it('records the actor on every access row, applied or refused', () => {
    const s = reducer(fresh(), { type: 'SET_USER_TWOFA', userId: 'u6', twoFa: true, reason: WHY, by: SUPER });
    expect(u(s, 'u6').twoFa).toBe(true);
    expect(lastRow(s).by).toEqual(SUPER);
    expect(u(s, 'u6').events![0]!.by.oid).toBe('oid-super-01');
  });

  it('writes exactly one audit row per access action — never a duplicate from the wrapper', () => {
    const s = reducer(fresh(), { type: 'SET_USER_TWOFA', userId: 'u6', twoFa: true, reason: WHY, by: SUPER });
    expect(s.audit).toHaveLength(1);
  });

  it('ignores a no-op without writing an audit row', () => {
    const s = reducer(fresh(), { type: 'SET_USER_TWOFA', userId: 'u3', twoFa: true, reason: WHY, by: SUPER });
    expect(s.audit).toHaveLength(0); // u3 already has twoFa on
  });
});


/* ---------------- operating companies & Financial Authority (§7) ---------------- */

describe('per-field Financial Authority (§7.1 — from the Service Contract)', () => {
  it('seeds every tender against its own field, preserving MCT membership', () => {
    const s = fresh();
    const t1 = s.tenders.find((x) => x.id === 't1')!; // f-ru contract 5M -> below (4.2M)
    const t3 = s.tenders.find((x) => x.id === 't3')!; // f-mj contract 3M -> above (7.8M)
    expect(t1.fieldId).toBe('f-ru');
    expect(t3.fieldId).toBe('f-mj');
    expect(aboveOwnFA(s, t1)).toBe(false);
    expect(aboveOwnFA(s, t3)).toBe(true);
    expect(t1.mct).toBeUndefined();
    expect(t3.mct).toBeDefined();
  });

  it('resolves a different authority per field from its contract, not one global number', () => {
    const s = fresh();
    expect(faFor(s, s.tenders.find((x) => x.id === 't1')!)).toBe(5_000_000); // f-ru
    expect(faFor(s, s.tenders.find((x) => x.id === 't3')!)).toBe(3_000_000); // f-mj
  });

  it('fails closed for a tender with no field — no permissive default', () => {
    const s = fresh();
    const orphan = { ...s.tenders[0]!, id: 'tX', fieldId: undefined };
    expect(faFor(s, orphan)).toBeNull();       // no contract → null, never a figure
    expect(aboveOwnFA(s, orphan)).toBe(true);  // conservative: treated as above authority
  });

  it('changes which tenders sit in the cost cycle when the contract FA moves', () => {
    let s = fresh();
    const t1 = () => s.tenders.find((x) => x.id === 't1')!;
    expect(aboveOwnFA(s, t1())).toBe(false); // 4.2M under 5M
    // lowering the Rumaila contract FA to 4M pulls its 4.2M request above the line
    s = reducer(s, { type: 'SET_CONTRACT_FA', contractId: 'sc-ru', financialAuthorityUSD: 4_000_000, reason: WHY, by: SUPER });
    expect(lastRow(s).outcome).toBe('applied');
    expect(aboveOwnFA(s, t1())).toBe(true);
  });

  it('opens an MCT case against the raising field authority, not a default', () => {
    const s0 = fresh();
    // 3.5M is over Majnoon's 3M contract FA -> must open a cost-cycle case
    const s = reducer(s0, {
      type: 'CREATE_TENDER', operatorId: 'op-mjn', fieldId: 'f-mj', title: { ar: 'x', en: 'x' },
      budgetCode: 'MJ-TST-01', estimatedValueUSD: 3_500_000, methodId: 7,
    });
    const created = s.tenders[0]!;
    expect(created.fieldId).toBe('f-mj');
    expect(created.mct).toBeDefined();
    expect(created.mct!.lcEstimateUSD).toBe(3_500_000);
  });

  it('refuses a non-positive contract authority, which would put every request above the line', () => {
    const s = reducer(fresh(), { type: 'SET_CONTRACT_FA', contractId: 'sc-ru', financialAuthorityUSD: 0, reason: WHY, by: SUPER });
    expect(s.serviceContracts.find((c) => c.id === 'sc-ru')!.financialAuthorityUSD).toBe(5_000_000);
    expect(lastRow(s).outcome).toBe('refused');
    expect(lastRow(s).reasonCode).toBe('fa-invalid');
  });

  it('CREATE_FIELD creates a field with its Service Contract, usable at once', () => {
    const base = { type: 'CREATE_FIELD', fieldId: 'f-new', operatorId: 'op-bec', name: 'حقل جديد', code: 'NW', contractId: 'sc-new', contractCode: 'SC-NW', financialAuthorityUSD: 4_000_000, signedOn: '2024-01-01', expiresOn: '2031-01-01', reason: WHY, by: SUPER } as const;
    const s = reducer(fresh(), base);
    expect(s.fields.some((f) => f.id === 'f-new')).toBe(true);
    expect(s.serviceContracts.find((c) => c.fieldId === 'f-new')!.financialAuthorityUSD).toBe(4_000_000);
    expect(faFor(s, { ...s.tenders[0]!, fieldId: 'f-new' })).toBe(4_000_000);
    expect(lastRow(s).outcome).toBe('applied');
  });

  it('CREATE_FIELD refuses a duplicate code case-insensitively, an unknown operator, and a bad date range', () => {
    const ok = { type: 'CREATE_FIELD', fieldId: 'f-a', operatorId: 'op-bec', name: 'أ', code: 'ru', contractId: 'sc-a', contractCode: 'SC-A', financialAuthorityUSD: 1_000_000, signedOn: '2024-01-01', expiresOn: '2031-01-01', reason: WHY, by: SUPER } as const;
    // 'ru' collides with seeded 'RU' regardless of case
    expect(reducer(fresh(), ok).fields.some((f) => f.id === 'f-a')).toBe(false);
    expect(lastRow(reducer(fresh(), ok)).reasonCode).toBe('dup-field');
    // unknown operator
    expect(lastRow(reducer(fresh(), { ...ok, code: 'ZZ', operatorId: 'op-nope' })).reasonCode).toBe('unknown-operator');
    // expiry not after signing → born-dead contract is refused
    expect(lastRow(reducer(fresh(), { ...ok, code: 'ZZ', expiresOn: '2023-01-01' })).reasonCode).toBe('dates-invalid');
  });

  it('refuses a duplicate company name and registers a distinct one', () => {
    const dup = reducer(fresh(), { type: 'CREATE_OPERATOR', operatorId: 'op-x', name: '\u0634\u0631\u0643\u0629 \u0646\u0641\u0637 \u0627\u0644\u0628\u0635\u0631\u0629', reason: WHY, by: SUPER });
    expect(dup.operators).toHaveLength(3);
    expect(lastRow(dup).reasonCode).toBe('dup-name');

    const ok = reducer(fresh(), { type: 'CREATE_OPERATOR', operatorId: 'op-x', name: '\u0634\u0631\u0643\u0629 \u0646\u0641\u0637 \u0627\u0644\u0648\u0633\u0637', reason: WHY, by: SUPER });
    expect(ok.operators).toHaveLength(4);
    expect(lastRow(ok).outcome).toBe('applied');
    expect(lastRow(ok).by).toEqual(SUPER);
  });
});

/**
 * The justification guard is not a modal-only courtesy: a raw dispatch carrying a reason the
 * server's `@Length(20, 2000)` would throw on must be refused by the reducer too, exactly as
 * ADD_HOLIDAY / REMOVE_HOLIDAY already refuse it. Each refusal leaves the registry untouched
 * and lands one attributed `reason-invalid` row \u2014 never a success-shaped one.
 */
describe('governed writes refuse an undocumented justification (server @Length(20,2000))', () => {
  const SHORT = '\u0642\u0635\u064a\u0631';
  const LONG = '\u0637'.repeat(2001);

  it('SET_CONTRACT_FA refuses a too-short and a too-long justification, leaving the authority intact', () => {
    for (const reason of [SHORT, '', '   ', LONG]) {
      const s = reducer(fresh(), { type: 'SET_CONTRACT_FA', contractId: 'sc-ru', financialAuthorityUSD: 9_000_000, reason, by: SUPER });
      expect(s.serviceContracts.find((c) => c.id === 'sc-ru')!.financialAuthorityUSD).toBe(5_000_000);
      expect(s.audit).toHaveLength(1);
      expect(lastRow(s).outcome).toBe('refused');
      expect(lastRow(s).reasonCode).toBe('reason-invalid');
      expect(lastRow(s).by).toEqual(SUPER);
      expect(lastRow(s).target).toBe('SC-RU-24'); // the contract code, as the applied twin records
    }
  });

  it('SET_CONTRACT_FA checks the justification BEFORE the no-op, so an undocumented attempt is still recorded', () => {
    // same value as seeded \u2192 the write would be a no-op, but the attempt was still undocumented
    const s = reducer(fresh(), { type: 'SET_CONTRACT_FA', contractId: 'sc-ru', financialAuthorityUSD: 5_000_000, reason: SHORT, by: SUPER });
    expect(lastRow(s).reasonCode).toBe('reason-invalid');
    // \u2026while the SAME no-op with a documented reason stays silent (nothing changed to audit)
    const ok = reducer(fresh(), { type: 'SET_CONTRACT_FA', contractId: 'sc-ru', financialAuthorityUSD: 5_000_000, reason: WHY, by: SUPER });
    expect(ok.audit).toHaveLength(0);
  });

  it('CREATE_FIELD refuses an undocumented justification \u2014 no field and no Service Contract are born', () => {
    const base = { type: 'CREATE_FIELD', fieldId: 'f-new', operatorId: 'op-bec', name: '\u062d\u0642\u0644 \u062c\u062f\u064a\u062f', code: 'NW', contractId: 'sc-new', contractCode: 'SC-NW', financialAuthorityUSD: 4_000_000, signedOn: '2024-01-01', expiresOn: '2031-01-01', by: SUPER } as const;
    const s0 = fresh();
    const s = reducer(s0, { ...base, reason: SHORT });
    expect(s.fields).toHaveLength(s0.fields.length);
    expect(s.serviceContracts).toHaveLength(s0.serviceContracts.length);
    expect(lastRow(s).outcome).toBe('refused');
    expect(lastRow(s).reasonCode).toBe('reason-invalid');
    // the guard runs ahead of the duplicate/operator/date checks \u2014 the missing reason is the verdict
    expect(lastRow(reducer(s0, { ...base, code: 'ru', reason: SHORT })).reasonCode).toBe('reason-invalid');
  });

  it('CREATE_OPERATOR refuses an undocumented justification \u2014 no company is registered', () => {
    const s0 = fresh();
    const s = reducer(s0, { type: 'CREATE_OPERATOR', operatorId: 'op-x', name: '\u0634\u0631\u0643\u0629 \u0646\u0641\u0637 \u0627\u0644\u0648\u0633\u0637', reason: SHORT, by: SUPER });
    expect(s.operators).toHaveLength(s0.operators.length);
    expect(lastRow(s).outcome).toBe('refused');
    expect(lastRow(s).reasonCode).toBe('reason-invalid');
    expect(lastRow(s).target).toBe('\u0634\u0631\u0643\u0629 \u0646\u0641\u0637 \u0627\u0644\u0648\u0633\u0637');
  });

  it('still applies each write once the justification is documented \u2014 the refusal is reason-only', () => {
    const fa = reducer(fresh(), { type: 'SET_CONTRACT_FA', contractId: 'sc-ru', financialAuthorityUSD: 9_000_000, reason: WHY, by: SUPER });
    expect(fa.serviceContracts.find((c) => c.id === 'sc-ru')!.financialAuthorityUSD).toBe(9_000_000);
    expect(lastRow(fa).outcome).toBe('applied');

    const fld = reducer(fresh(), { type: 'CREATE_FIELD', fieldId: 'f-new', operatorId: 'op-bec', name: '\u062d\u0642\u0644 \u062c\u062f\u064a\u062f', code: 'NW', contractId: 'sc-new', contractCode: 'SC-NW', financialAuthorityUSD: 4_000_000, signedOn: '2024-01-01', expiresOn: '2031-01-01', reason: WHY, by: SUPER });
    expect(fld.fields.some((f) => f.id === 'f-new')).toBe(true);
    expect(lastRow(fld).outcome).toBe('applied');
  });
});
