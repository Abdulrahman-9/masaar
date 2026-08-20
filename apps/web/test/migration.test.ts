// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StoreProvider, seedState, tenderApprovalTier, useStore, type Tender } from '../src/store';
import { clearSession, loadSession, saveSession } from '../src/session';

/**
 * KEY migration → v9 (client decision ق3, 2026-08-20). The demo universe changed IDENTITY: the
 * southern seed (Rumaila / West Qurna / Majnoon — Basra Oil Company's fields, never نفط الوسط's)
 * was replaced by the 13 real MDOC-area fields under their 12 Lead Contractors, and the state
 * root gained the global approval ladder. Every operator/field/contract id changed, so a legacy
 * blob's tenders point at fields that no longer exist and cannot be re-pointed honestly.
 *
 * What the migration therefore owes is not data preservation but LAW preservation: the
 * append-only audit log (8.1-e) survives in order and untouched, the swap is itself recorded
 * rather than performed silently, the holiday calendar (a fact about Iraq, not about the demo)
 * survives, and `seq` never moves backwards so a generated code cannot collide with one already
 * named in the preserved log.
 *
 * KEY migration → v10 (client decision ق2, same day) is the opposite kind of move: the universe
 * is UNCHANGED and only the role vocabulary was renamed (ROC_ADMIN → MDOC_ADMIN), so a v9 blob
 * must survive whole — every tender, contract, account and audit row — with the rename applied
 * to accounts only. A role is a live authorization fact and must speak today's vocabulary; an
 * audit row is history and must not be touched at all.
 */

afterEach(() => localStorage.clear());

const tender = (id: string, code: string, operatorId: string, estimatedValueUSD: number, extra: object = {}) => ({
  id, code, title: { ar: 'x', en: 'x' }, budgetCode: code.slice(0, 2), estimatedValueUSD, operatorId,
  methodId: 7, createdOn: '2026-01-01', stages: [], evaluationStep: 0, bidders: [],
  announcement: { mode: 'public', periodDays: 21, newspapers: ['', '', ''], lcWebsite: false, rocWebsite: false, inviteeCount: 0, inviteesPreQualified: false },
  ...extra,
});

/** A full v8 blob in the retired southern universe, with a governance trail worth keeping. */
const v8Blob = (extra: object = {}) => ({
  tenders: [
    tender('t1', 'RU-DRL', 'op-bec', 4_200_000, { fieldId: 'f-ru', ratification: { status: 'ratified', by: 'اسم كنص من الخادم', on: '2026-06-01' } }),
    tender('t3', 'MJ-EPC', 'op-mjn', 7_800_000, { fieldId: 'f-mj' }),
  ],
  contracts: [], vendors: [], users: [],
  audit: [
    { ts: '2026-06-01T10:00:00Z', action: 'RATIFY', target: 'RU-DRL' },
    { ts: '2026-06-02T10:00:00Z', action: 'CREATE_TENDER', target: 'MJ' },
  ],
  seq: 140,
  operators: [{ id: 'op-bec', name: 'شركة نفط البصرة' }, { id: 'op-mjn', name: 'شركة نفط ميسان' }],
  fields: [{ id: 'f-ru', name: 'الرميلة', code: 'RU', operatorId: 'op-bec' }],
  serviceContracts: [{ id: 'sc-ru', code: 'SC-RU-24', fieldId: 'f-ru', financialAuthorityUSD: 5_000_000, signedOn: '2024-01-01', expiresOn: '2031-01-01' }],
  ...extra,
});

const load = () => renderHook(() => useStore(), { wrapper: StoreProvider }).result.current.state;

describe('masaar-operator v8 → v9 migration (the universe becomes نفط الوسط)', () => {
  it('preserves the append-only audit log in order and records the swap itself', () => {
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8Blob()));
    const s = load();

    // the two historical rows survived the KEY bump, in order, untouched (8.1-e)
    expect(s.audit.slice(0, 2).map((a) => a.action)).toEqual(['RATIFY', 'CREATE_TENDER']);
    expect(s.audit[0]!.target).toBe('RU-DRL');
    // …and the universe replacement is appended rather than performed silently
    expect(s.audit).toHaveLength(3);
    expect(s.audit[2]!.action).toBe('SEED_MIGRATION_V9');
    expect(s.audit[2]!.target).toBe('MDOC');
    // no Actor performed it — a startup migration did, and a fabricated actor would be worse than none
    expect(s.audit[2]!.by).toBeUndefined();
  });

  it('reseeds the MDOC registry: 12 Lead Contractors, 13 fields, 13 service contracts', () => {
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8Blob()));
    const s = load();

    expect(s.operators).toHaveLength(12);
    expect(s.fields).toHaveLength(13);
    expect(s.serviceContracts).toHaveLength(13);
    // the retired southern records are gone — not renamed, not orphaned
    expect(s.fields.some((f) => f.code === 'RU')).toBe(false);
    expect(s.operators.some((o) => o.id === 'op-bec')).toBe(false);
    expect(s.fields.map((f) => f.code)).toContain('AHDAB');
    expect(s.tenders.map((t) => t.id)).toEqual(seedState().tenders.map((t) => t.id));
  });

  it('backfills the global approval ladder, so tiers resolve instead of failing closed to MDOC', () => {
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8Blob()));
    const s = load();

    expect(s.approvalTiers).toEqual({ operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 });
    expect(tenderApprovalTier(s, s.tenders.find((t) => t.id === 't1')!)).toBe('OPERATOR');
  });

  it('carries the holiday calendar across (a fact about Iraq, not about the demo data)', () => {
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8Blob({ holidays: ['2026-01-01', 'garbage', { date: '2026-05-01', name: 'عيد العمال' }] })));
    const s = load();
    expect(s.holidays).toEqual([{ date: '2026-01-01' }, { date: '2026-05-01', name: 'عيد العمال' }]);
  });

  it('never moves seq backwards — a generated code cannot collide with one already in the log', () => {
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8Blob())); // seq 140 > the seed's 98
    expect(load().seq).toBe(140);
  });

  it('migrates a v7 blob through the same path — the oldest key is not stranded', () => {
    const v7 = {
      tenders: [tender('t1', 'RU-DRL', 'op-bec', 4_200_000)],
      contracts: [], vendors: [], users: [], seq: 6,
      audit: [{ ts: '2026-06-01T10:00:00Z', action: 'RATIFY', target: 'RU-DRL' }],
      // old shape: FA stored on the operator, no fields/serviceContracts arrays at all
      operators: [{ id: 'op-bec', name: 'شركة نفط البصرة', financialAuthorityUSD: 5_000_000 }],
    };
    localStorage.setItem('masaar-operator-v7', JSON.stringify(v7));
    const s = load();

    expect(s.audit.map((a) => a.action)).toEqual(['RATIFY', 'SEED_MIGRATION_V9']);
    expect(s.fields).toHaveLength(13);
    // the retired per-operator FA cannot survive on any operator row (§7.1 — FA lives on the contract)
    expect(s.operators.every((o) => !('financialAuthorityUSD' in o))).toBe(true);
    expect(s.seq).toBe(98); // the seed's own seq wins over the smaller legacy one
  });
});

describe('v10 blobs load as written', () => {
  it('leaves a valid v10 blob untouched rather than reseeding it', () => {
    const v10 = {
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 3,
      holidays: [{ date: '2026-03-01' }], approvalTiers: { operatorMaxUSD: 1_000_000, jmcMaxUSD: 2_000_000 },
    };
    localStorage.setItem('masaar-operator-v10', JSON.stringify(v10));
    const s = load();
    expect(s.seq).toBe(3);
    expect(s.audit).toEqual([]); // no migration row — nothing was migrated
    expect(s.approvalTiers).toEqual({ operatorMaxUSD: 1_000_000, jmcMaxUSD: 2_000_000 }); // an EDITED ladder survives
  });

  it('normalizes an early holidays: string[] blob into { date } objects on load', () => {
    localStorage.setItem('masaar-operator-v10', JSON.stringify({
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 4,
      holidays: ['2026-01-01', 'garbage', '2026-05-01'],
    }));
    expect(load().holidays).toEqual([{ date: '2026-01-01' }, { date: '2026-05-01' }]);
  });

  it('seeds the ladder only when the blob carries NONE — an absent ceiling was never configured', () => {
    localStorage.setItem('masaar-operator-v10', JSON.stringify({
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 5,
    }));
    expect(load().approvalTiers).toEqual({ operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 });
  });

  // A ladder that IS stored but cannot be trusted is the opposite case: repairing it here would
  // hand back ceilings nobody configured and clear requests at the LOWEST gate on their strength.
  // It is carried through as written so `approvalTierFor` — the single judge of a ladder — fails
  // closed to ط3 MDOC, exactly what «approvals.explainFailClosed» promises the user on screen.
  it('carries a half-written ladder through so the engine fails closed instead of inventing ceilings', () => {
    localStorage.setItem('masaar-operator-v10', JSON.stringify({
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 5,
      approvalTiers: { operatorMaxUSD: 'oops' },
    }));
    const s = load();
    expect(Number.isNaN(s.approvalTiers.operatorMaxUSD)).toBe(true);
    expect(Number.isNaN(s.approvalTiers.jmcMaxUSD)).toBe(true);
    expect(tenderApprovalTier(s, { estimatedValueUSD: 1_000 } as Tender)).toBe('MDOC');
  });

  it('carries an INVERTED ladder through — a JMC ceiling under the operator ceiling clears nothing', () => {
    localStorage.setItem('masaar-operator-v10', JSON.stringify({
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 6,
      approvalTiers: { operatorMaxUSD: 9_000_000, jmcMaxUSD: 1_000_000 },
    }));
    const s = load();
    expect(s.approvalTiers).toEqual({ operatorMaxUSD: 9_000_000, jmcMaxUSD: 1_000_000 });
    // 4.2M would sit inside a 9M operator band — but the ladder describing it is unusable
    expect(tenderApprovalTier(s, { estimatedValueUSD: 4_200_000 } as Tender)).toBe('MDOC');
  });
});

/** A v9 blob: the CURRENT universe, written under the retired role vocabulary. */
const v9Blob = (users: object[]) => ({
  tenders: [tender('t9', 'AH-DRL', 'op-alwaha', 4_200_000, { fieldId: 'f-ahdab' })],
  contracts: [], vendors: [], users, seq: 210,
  operators: [{ id: 'op-alwaha', name: 'شركة نفط الواحة الصينية' }],
  fields: [{ id: 'f-ahdab', name: 'الأحدب', code: 'AHDAB', operatorId: 'op-alwaha' }],
  serviceContracts: [{ id: 'sc-ahdab', code: 'SC-AHDAB', fieldId: 'f-ahdab', financialAuthorityUSD: 5_000_000, signedOn: '2024-01-01', expiresOn: '2031-01-31' }],
  audit: [{ ts: '2026-08-01T10:00:00Z', action: 'SET_USER_ROLE', target: 'sara.jubouri@roc.iq: ROC_ADMIN→EVALUATION' }],
  holidays: [{ date: '2026-03-01' }], approvalTiers: { operatorMaxUSD: 3_000_000, jmcMaxUSD: 9_000_000 },
});

const acct = (id: string, role: string) => ({ id, azureOid: `oid-${id}`, name: id, email: `${id}@mdoc.iq`, role, twoFa: true, disabled: false });

describe('masaar-operator v9 → v10 migration (the role vocabulary becomes MDOC)', () => {
  it('renames the live authorization fact — an account keeps every capability it held', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([acct('u3', 'ROC_ADMIN'), acct('u5', 'EVALUATION')])));
    const s = load();

    expect(s.users.map((u) => u.role)).toEqual(['MDOC_ADMIN', 'EVALUATION']);
    // identity is untouched: the same accounts, not replacements
    expect(s.users.map((u) => u.id)).toEqual(['u3', 'u5']);
  });

  it('keeps the universe whole — this is a rename, not a reseed', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([acct('u3', 'ROC_ADMIN')])));
    const s = load();

    expect(s.tenders.map((t) => t.id)).toEqual(['t9']); // the user's own tender, not the seed's
    expect(s.seq).toBe(210);
    expect(s.operators).toHaveLength(1);
    expect(s.holidays).toEqual([{ date: '2026-03-01' }]);
    expect(s.approvalTiers).toEqual({ operatorMaxUSD: 3_000_000, jmcMaxUSD: 9_000_000 }); // an EDITED ladder survives
  });

  it('never rewrites history: the pre-rename audit row survives verbatim, and the rename is appended', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([acct('u3', 'ROC_ADMIN')])));
    const s = load();

    // 8.1-e: the row said ROC_ADMIN truthfully on the day it was written — it stays that way
    expect(s.audit[0]!.target).toBe('sara.jubouri@roc.iq: ROC_ADMIN→EVALUATION');
    expect(s.audit).toHaveLength(2);
    expect(s.audit[1]!.action).toBe('ROLE_RENAME_V10');
    expect(s.audit[1]!.target).toBe('MDOC_ADMIN');
    expect(s.audit[1]!.by).toBeUndefined(); // a startup migration, not an Actor
  });

  it('records nothing when nothing was renamed — a row for a change that never happened is a fabrication', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([acct('u5', 'EVALUATION')])));
    expect(load().audit).toHaveLength(1);
  });

  it('leaves an unrecognizable role alone rather than guessing one', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([acct('u9', 'COMMITTEE_CHAIR')])));
    const s = load();
    expect(s.users[0]!.role).toBe('COMMITTEE_CHAIR');
    expect(s.audit).toHaveLength(1); // nothing renamed → nothing recorded
  });
});

/**
 * The session key moves v2 → v3 for the same rename. Unlike v1 → v2 (a shape change that made
 * old blobs unusable) this one is migrated, not discarded: signing a working session out over a
 * spelling change is a worse failure than carrying it forward.
 */
describe('masaar-session v2 → v3 migration', () => {
  afterEach(() => clearSession());

  it('carries a pre-rename session forward with the retired role resolved', () => {
    localStorage.setItem('masaar-session-v2', JSON.stringify({ name: 'د. سارة الجبوري', role: 'ROC_ADMIN', oid: 'oid-roc-01' }));
    const s = loadSession();

    expect(s).toEqual({ name: 'د. سارة الجبوري', role: 'MDOC_ADMIN', oid: 'oid-roc-01' });
    // re-homed under v3 and the old key retired, so the migration runs once
    expect(JSON.parse(localStorage.getItem('masaar-session-v3')!).role).toBe('MDOC_ADMIN');
    expect(localStorage.getItem('masaar-session-v2')).toBeNull();
  });

  it('keeps the operator scope across the migration — a scoped session must not widen', () => {
    localStorage.setItem('masaar-session-v2', JSON.stringify({ name: 'م. أحمد', role: 'OPERATOR_ADMIN', oid: 'oid-opadmin-01', company: 'شركة نفط الواحة الصينية', companyId: 'op-alwaha' }));
    expect(loadSession()!.companyId).toBe('op-alwaha');
  });

  it('refuses a session whose role names nothing — an unplaceable role must not authorize', () => {
    localStorage.setItem('masaar-session-v2', JSON.stringify({ name: 'x', role: 'COMMITTEE_CHAIR', oid: 'oid-x' }));
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem('masaar-session-v2')).toBeNull(); // and it is not left to retry forever
  });

  it('prefers a live v3 session over a stale v2 one', () => {
    saveSession({ name: 'current', role: 'SUPER_ADMIN', oid: 'oid-super-01' });
    localStorage.setItem('masaar-session-v2', JSON.stringify({ name: 'stale', role: 'ROC_ADMIN', oid: 'oid-roc-01' }));
    expect(loadSession()!.name).toBe('current');
  });
});
