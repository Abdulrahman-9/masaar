import { describe, expect, it } from 'vitest';
import { checkAnnouncement } from '@masaar/scpp-rules';

const validPublic = {
  mode: 'public' as const,
  periodDays: 21,
  newspapers: ['الصباح', 'الزمان', 'المدى'],
  publishedOnLcWebsite: true,
  publishedOnRocWebsite: true,
};

describe('checkAnnouncement — public tender (11.1)', () => {
  it('passes when all five checks hold', () => {
    const r = checkAnnouncement(validPublic);
    expect(r.ok).toBe(true);
    expect(r.checks).toHaveLength(5);
    expect(r.checks.every((c) => c.clause === '11.1')).toBe(true);
  });

  it('fails when the period is under 21 calendar days', () => {
    const r = checkAnnouncement({ ...validPublic, periodDays: 20 });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'period-21d')!.ok).toBe(false);
  });

  it('counts only distinct, non-empty newspapers', () => {
    const r = checkAnnouncement({ ...validPublic, newspapers: ['الصباح', 'الصباح', ' '] });
    expect(r.checks.find((c) => c.id === 'newspapers-3')!.ok).toBe(false);
  });

  it('fails when not on both websites', () => {
    const r = checkAnnouncement({ ...validPublic, publishedOnRocWebsite: false });
    expect(r.checks.find((c) => c.id === 'roc-website')!.ok).toBe(false);
  });

  it('public tender must NOT require pre-qualification', () => {
    const r = checkAnnouncement({ ...validPublic, preQualificationRequired: true });
    expect(r.checks.find((c) => c.id === 'no-preq')!.ok).toBe(false);
  });
});

describe('checkAnnouncement — limited tender (11.2)', () => {
  it('needs ≥ 2 pre-qualified invitees', () => {
    expect(checkAnnouncement({ mode: 'limited', periodDays: 14, inviteeCount: 2, inviteesPreQualified: true }).ok).toBe(true);
    expect(checkAnnouncement({ mode: 'limited', periodDays: 14, inviteeCount: 1, inviteesPreQualified: true }).ok).toBe(false);
    expect(checkAnnouncement({ mode: 'limited', periodDays: 14, inviteeCount: 2, inviteesPreQualified: false }).ok).toBe(false);
  });
});

describe('checkAnnouncement — direct invitation (11.4)', () => {
  it('needs ≥ 3 pre-qualified invitees', () => {
    expect(checkAnnouncement({ mode: 'direct', periodDays: 7, inviteeCount: 3, inviteesPreQualified: true }).ok).toBe(true);
    expect(checkAnnouncement({ mode: 'direct', periodDays: 7, inviteeCount: 2, inviteesPreQualified: true }).ok).toBe(false);
  });
});

describe('bilingual messages', () => {
  it('every check carries Arabic and English text', () => {
    const r = checkAnnouncement(validPublic);
    for (const c of r.checks) {
      expect(c.ar.length).toBeGreaterThan(0);
      expect(c.en.length).toBeGreaterThan(0);
    }
  });
});
