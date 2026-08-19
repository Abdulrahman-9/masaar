// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StoreProvider, aboveOwnFA, byName, faFor, useStore } from '../src/store';

/**
 * KEY migration v7 → v8. Financial Authority moved from Operator to a per-field Service
 * Contract (§7.1). A v7 blob has tenders with operatorId but no fieldId, and no fields/
 * serviceContracts arrays. The migration must: preserve the append-only audit log (8.1-e),
 * backfill the 13 fields + their contracts, assign every tender its operator's PRIMARY field,
 * and keep aboveOwnFA byte-identical to the old per-operator FA.
 */

afterEach(() => localStorage.clear());

const tender = (id: string, code: string, operatorId: string, estimatedValueUSD: number, extra: object = {}) => ({
  id, code, title: { ar: 'x', en: 'x' }, budgetCode: code.slice(0, 2), estimatedValueUSD, operatorId,
  methodId: 7, createdOn: '2026-01-01', stages: [], evaluationStep: 0, bidders: [],
  announcement: { mode: 'public', periodDays: 21, newspapers: ['', '', ''], lcWebsite: false, rocWebsite: false, inviteeCount: 0, inviteesPreQualified: false },
  ...extra,
});

describe('masaar-operator v7 → v8 migration (FA moves to the field contract)', () => {
  it('preserves audit, backfills fields/contracts, assigns fieldId, and keeps aboveOwnFA identical', () => {
    const v7 = {
      tenders: [
        // op-bec 4.2M (below its old 5M FA), with a plain-string ratification.by (server-hydrated)
        tender('t1', 'RU-DRL', 'op-bec', 4_200_000, { ratification: { status: 'ratified', by: 'اسم كنص من الخادم', on: '2026-06-01' } }),
        // op-mjn 7.8M (above its old 3M FA) — must stay above after migration
        tender('t3', 'MJ-EPC', 'op-mjn', 7_800_000),
      ],
      contracts: [], vendors: [],
      audit: [
        { ts: '2026-06-01T10:00:00Z', action: 'RATIFY', target: 'RU-DRL' },
        { ts: '2026-06-02T10:00:00Z', action: 'CREATE_TENDER', target: 'MJ' },
      ],
      seq: 6, users: [],
      // old shape: FA stored on the operator (ignored by the migration)
      operators: [
        { id: 'op-bec', name: 'شركة نفط البصرة', financialAuthorityUSD: 5_000_000 },
        { id: 'op-mjn', name: 'شركة نفط ميسان', financialAuthorityUSD: 3_000_000 },
      ],
    };
    localStorage.setItem('masaar-operator-v7', JSON.stringify(v7));

    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    const s = result.current.state;

    // append-only audit log survived the KEY bump, in order (8.1-e)
    expect(s.audit).toHaveLength(2);
    expect(s.audit.map((a) => a.action)).toEqual(['RATIFY', 'CREATE_TENDER']);

    // the 13 fields + their contracts were backfilled from the fresh seed
    expect(s.fields).toHaveLength(13);
    expect(s.serviceContracts).toHaveLength(13);

    // every migrated tender got its operator's PRIMARY field, so FA resolves via the contract
    const t1 = s.tenders.find((x) => x.id === 't1')!;
    const t3 = s.tenders.find((x) => x.id === 't3')!;
    expect(t1.fieldId).toBe('f-ru'); // op-bec primary
    expect(t3.fieldId).toBe('f-mj'); // op-mjn primary
    expect(faFor(s, t1)).toBe(5_000_000);
    expect(faFor(s, t3)).toBe(3_000_000);

    // aboveOwnFA is byte-identical to the old per-operator FA: t1 below, t3 above
    expect(aboveOwnFA(s, t1)).toBe(false);
    expect(aboveOwnFA(s, t3)).toBe(true);

    // the shape-tolerant reader still resolves a plain-string `by` from the migrated blob
    expect(byName(t1.ratification!.by)).toBe('اسم كنص من الخادم');

    // holidays is additive with a safe default — a blob written before it existed loads as []
    expect(s.holidays).toEqual([]);
  });

  it('backfills holidays: [] when a valid v8 blob predates the dynamic calendar', () => {
    // a full v8 shape (every SHAPE_KEYS array present) but no holidays key yet
    const v8 = {
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 3,
    };
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8));

    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    expect(result.current.state.holidays).toEqual([]);
    // the rest of the blob is preserved untouched (not reseeded)
    expect(result.current.state.seq).toBe(3);
  });

  it('normalizes an early holidays: string[] blob into { date } objects on load', () => {
    const v8 = {
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 4,
      holidays: ['2026-01-01', 'garbage', '2026-05-01'], // early bare-string shape + a malformed entry
    };
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8));

    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    expect(result.current.state.holidays).toEqual([{ date: '2026-01-01' }, { date: '2026-05-01' }]);
  });
});
