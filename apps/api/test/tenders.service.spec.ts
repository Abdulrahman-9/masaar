import 'reflect-metadata';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TendersService } from '../src/tenders/tenders.service.js';
import type { AuthUser } from '../src/auth/auth.types.js';

/**
 * Server-side guard tests — the backend counterpart of the frontend store
 * breach-attempt tests. They run WITHOUT a database: Prisma is mocked, so they
 * prove the service refuses rule violations using the real @masaar/scpp-rules
 * engine, independent of any infrastructure.
 */

const ROC: AuthUser = { userId: 'u-roc', name: 'د. سارة الجبوري', role: 'ROC_ADMIN' };
const OP: AuthUser = { userId: 'u-op', name: 'Operator', role: 'OPERATOR_ADMIN', operatorId: 'op1' };

function makeService(tender: unknown) {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const prisma = {
    tender: { findUnique: vi.fn().mockResolvedValue(tender), update: vi.fn().mockResolvedValue({}) },
    announcement: { update: vi.fn().mockResolvedValue({}) },
    bidder: { update: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}) },
    stage: { update: vi.fn().mockResolvedValue({}) },
    ratification: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    vendor: { findUnique: vi.fn().mockResolvedValue(null) },
    contract: { findUnique: vi.fn().mockResolvedValue(null) },
    mctCase: { update: vi.fn().mockResolvedValue({}) },
    // no contract on the field → contractFinancialAuthority is null → aboveFA fails CLOSED (§7.1)
    field: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const calendar = { getCalendar: vi.fn().mockResolvedValue({ weekend: [5, 6], holidays: [] }) };
  const svc = new TendersService(prisma as never, audit as never, calendar as never);
  return { svc, prisma, audit };
}

const baseStages = [
  { id: 's1', key: 'ratify', order: 9, actualTo: null, documents: [] },
];

describe('publishAnnouncement guard (11.x pre-publish checks)', () => {
  it('refuses to publish while checks fail, and audits the refusal', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1',
      stages: baseStages, bidders: [], mct: null,
      announcement: { tenderId: 't1', mode: 'LIMITED', periodDays: 14, newspapers: [], lcWebsite: false, rocWebsite: false, inviteeCount: 0, inviteesPreQualified: false, publishedOn: null },
    };
    const { svc, prisma, audit } = makeService(tender);
    await expect(svc.publishAnnouncement(ROC, 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.announcement.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'PUBLISH_REFUSED', 'RU-1');
  });

  it('publishes when the limited-tender checks pass', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1',
      stages: baseStages, bidders: [], mct: null,
      announcement: { tenderId: 't1', mode: 'LIMITED', periodDays: 14, newspapers: [], lcWebsite: false, rocWebsite: false, inviteeCount: 2, inviteesPreQualified: true, publishedOn: null },
    };
    const { svc, prisma } = makeService(tender);
    await svc.publishAnnouncement(ROC, 't1');
    expect(prisma.announcement.update).toHaveBeenCalledOnce();
  });
});

describe('setPrice guard (12.4.2 price lock)', () => {
  const tenderAt = (step: number, technicalResult: 'PASS' | 'FAIL' | null) => ({
    id: 't1', code: 'RU-1', operatorId: 'op1', evaluationStep: step,
    stages: baseStages, mct: null, announcement: null,
    bidders: [{ id: 'b1', technicalResult }],
  });

  it('refuses a price during the technical-analysis step', async () => {
    const { svc, prisma } = makeService(tenderAt(1, 'PASS'));
    await expect(svc.setPrice(ROC, 't1', 'b1', 4_410_000)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bidder.update).not.toHaveBeenCalled();
  });

  it('refuses a price for a technically failed bidder in a commercial step', async () => {
    const { svc } = makeService(tenderAt(2, 'FAIL'));
    await expect(svc.setPrice(ROC, 't1', 'b1', 4_410_000)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a price for a qualified bidder in a commercial step', async () => {
    const { svc, prisma } = makeService(tenderAt(2, 'PASS'));
    await svc.setPrice(ROC, 't1', 'b1', 4_410_000);
    expect(prisma.bidder.update).toHaveBeenCalledOnce();
  });
});

describe('completeStage guard (docs gate)', () => {
  it('refuses to close tech-analysis without the evaluation report', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null,
      stages: [{ id: 's', key: 'tech-analysis', order: 4, actualTo: null, documents: [] }],
    };
    const { svc, prisma } = makeService(tender);
    await expect(svc.completeStage(ROC, 't1', { stageKey: 'tech-analysis', actualTo: '2026-06-13' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.stage.update).not.toHaveBeenCalled();
  });

  it('closes once the required document is uploaded', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null,
      stages: [{ id: 's', key: 'tech-analysis', order: 4, actualTo: null, documents: [{ kind: 'evaluation-report' }] }],
    };
    const { svc, prisma } = makeService(tender);
    await svc.completeStage(ROC, 't1', { stageKey: 'tech-analysis', actualTo: '2026-06-13' });
    expect(prisma.stage.update).toHaveBeenCalledOnce();
  });
});

describe('§9 C8.6 origin gate on setTechnical (10.6.18) — the hard award-side mirror', () => {
  const bidderWith = (materials: unknown) => ({
    id: 't1', code: 'RU-1', operatorId: 'op1', status: 'ACTIVE', stages: baseStages, mct: null, announcement: null,
    bidders: [{ id: 'b1', name: 'x', technicalResult: null, priceUSD: null, materials }],
  });

  it('refuses a pass while an imported critical material fails the approved-origin gate', async () => {
    const { svc, prisma, audit } = makeService(bidderWith([{ materialId: 'turbines', imported: true, origin: 'China', oemAuthorizedFrom: null, onMooList: false }]));
    await expect(svc.setTechnical(OP, 't1', 'b1', 'pass')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.bidder.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-op', 'SET_TECHNICAL_REFUSED', expect.stringContaining('10.6.18'));
  });

  it('allows a pass when the declaration clears the gate (approved origin)', async () => {
    const { svc, prisma } = makeService(bidderWith([{ materialId: 'pumps-610', imported: true, origin: 'Japan', oemAuthorizedFrom: null, onMooList: false }]));
    await svc.setTechnical(OP, 't1', 'b1', 'pass');
    expect(prisma.bidder.update).toHaveBeenCalledOnce();
  });
});

describe('§9 C8.1 clause attestation (setLocalContentClause) — mirrors the store reducer guards', () => {
  const tenderWith = (over: Record<string, unknown>) => ({
    id: 't3', code: 'MJ-EPC-0305', operatorId: 'op1', status: 'ACTIVE', fieldId: 'f-mj',
    estimatedValueUSD: 7_800_000, stages: baseStages, bidders: [], mct: null,
    announcement: null, localContentClauseAffixed: false, scope: 'ENGINEERING_CONSTRUCTION',
    ...over,
  });

  it('refuses to attest on a tender §9 does not reach — a fabricated compliance record', async () => {
    const { svc, prisma, audit } = makeService(tenderWith({ scope: 'OTHER' }));
    await expect(svc.setLocalContentClause(OP, 't3', true)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tender.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-op', 'SET_LC_CLAUSE_REFUSED', expect.stringContaining('C8.1'));
  });

  it('refuses once the announcement is published — no retroactive flip of the gate it passed', async () => {
    const published = { tenderId: 't3', mode: 'PUBLIC', periodDays: 23, newspapers: ['a', 'b', 'c'], lcWebsite: true, rocWebsite: true, inviteeCount: 0, inviteesPreQualified: false, publishedOn: new Date('2026-05-07') };
    const { svc, prisma, audit } = makeService(tenderWith({ announcement: published }));
    await expect(svc.setLocalContentClause(OP, 't3', true)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tender.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-op', 'SET_LC_CLAUSE_REFUSED', expect.stringContaining('published'));
  });

  it('records the attestation (audited) on an unpublished tender the requirement reaches', async () => {
    const { svc, prisma, audit } = makeService(tenderWith({}));
    await svc.setLocalContentClause(OP, 't3', true);
    expect(prisma.tender.update).toHaveBeenCalledWith({ where: { id: 't3' }, data: { localContentClauseAffixed: true } });
    expect(audit.record).toHaveBeenCalledWith('u-op', 'SET_LC_CLAUSE', expect.stringContaining('affixed'));
  });

  it('is a silent no-op when the value is unchanged — no write, no audit row', async () => {
    const { svc, prisma, audit } = makeService(tenderWith({ localContentClauseAffixed: true }));
    await svc.setLocalContentClause(OP, 't3', true);
    expect(prisma.tender.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('§9 C8.8 sign-stage certificates (via stageCanClose) — winner-scoped', () => {
  it('refuses to close sign without the certificates when the WINNER declared imported materials', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', status: 'ACTIVE', mct: null, announcement: null,
      bidders: [{ id: 'w', name: 'w', technicalResult: 'PASS', priceUSD: 100, materials: [{ materialId: 'turbines', imported: true, origin: 'Japan', oemAuthorizedFrom: null, onMooList: false }] }],
      stages: [{ id: 's', key: 'sign', order: 10, actualTo: null, documents: [{ kind: 'stage-report' }] }],
    };
    const { svc, prisma } = makeService(tender);
    await expect(svc.completeStage(OP, 't1', { stageKey: 'sign', actualTo: '2026-08-01' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.stage.update).not.toHaveBeenCalled();
  });
});

describe('ratify / return guards', () => {
  it('refuses to ratify when not at the ratification stage', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null,
      stages: [{ id: 's', key: 'tech-analysis', order: 4, actualTo: null, documents: [] }],
    };
    const { svc } = makeService(tender);
    await expect(svc.ratify(ROC, 't1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ratifies a tender at the ratify stage, persisting the immutable identity (byUserId) with the name', async () => {
    const tender = { id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null, stages: baseStages };
    const { svc, prisma } = makeService(tender);
    await svc.ratify(ROC, 't1');
    expect(prisma.ratification.create).toHaveBeenCalledOnce();
    // by = mutable display name, byUserId = the JWT principal (never a client-sent value)
    expect(prisma.ratification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'RATIFIED', by: 'د. سارة الجبوري', byUserId: 'u-roc' }),
    });
  });

  it('refuses to return without notes', async () => {
    const tender = { id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null, stages: baseStages };
    const { svc } = makeService(tender);
    await expect(svc.returnWithNotes(ROC, 't1', '   ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns with notes, persisting the immutable identity (byUserId)', async () => {
    const tender = { id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null, stages: baseStages };
    const { svc, prisma } = makeService(tender);
    await svc.returnWithNotes(ROC, 't1', 'إعادة تقييم البند الرابع');
    expect(prisma.ratification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'RETURNED', by: 'د. سارة الجبوري', byUserId: 'u-roc', notes: 'إعادة تقييم البند الرابع' }),
    });
  });

  it('refuses to ratify when the lowest qualified bid breaches +20% (6.9.3)', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', estimatedValueUSD: 1_000_000, mct: null, announcement: null,
      stages: baseStages, bidders: [{ id: 'b1', technicalResult: 'PASS', priceUSD: 1_300_000 }],
    };
    const { svc, prisma, audit } = makeService(tender);
    await expect(svc.ratify(ROC, 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ratification.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'RATIFY_REFUSED', 'RU-1 (13.3)');
  });

  it('ratifies when the lowest qualified bid is within +20%', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', estimatedValueUSD: 1_000_000, mct: null, announcement: null,
      stages: baseStages, bidders: [{ id: 'b1', technicalResult: 'PASS', priceUSD: 1_050_000 }],
    };
    const { svc, prisma } = makeService(tender);
    await svc.ratify(ROC, 't1');
    expect(prisma.ratification.create).toHaveBeenCalledOnce();
  });
});

describe('addBidder eligibility gate (10.4 / 14.3)', () => {
  const tender = { id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null, stages: baseStages };

  it('refuses a suspended vendor and audits the refusal', async () => {
    const { svc, prisma, audit } = makeService(tender);
    prisma.vendor.findUnique.mockResolvedValue({ id: 'v9', suspended: true, blacklisted: false, inDispute: false, banUntil: null });
    await expect(svc.addBidder(ROC, 't1', 'شركة موقوفة', 'v9')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bidder.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'ADD_BIDDER_REFUSED', 'RU-1/v9 (10.4)');
  });

  it('refuses a vendor under an active 14.3 ban', async () => {
    const { svc, prisma } = makeService(tender);
    prisma.vendor.findUnique.mockResolvedValue({ id: 'v9', suspended: false, blacklisted: false, inDispute: false, banUntil: new Date('2099-01-01') });
    await expect(svc.addBidder(ROC, 't1', 'شركة محظورة', 'v9')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bidder.create).not.toHaveBeenCalled();
  });

  it('accepts an eligible vendor and records ADD_BIDDER', async () => {
    const { svc, prisma, audit } = makeService(tender);
    prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', suspended: false, blacklisted: false, inDispute: false, banUntil: null });
    await svc.addBidder(ROC, 't1', 'شركة مؤهلة', 'v1');
    expect(prisma.bidder.create).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'ADD_BIDDER', 'RU-1/شركة مؤهلة');
  });
});

describe('tender governance (cancel / active gate)', () => {
  const active = { id: 't1', code: 'RU-1', operatorId: 'op1', status: 'ACTIVE', bidders: [], mct: null, announcement: null, stages: baseStages };

  it('refuses to cancel an awarded (ratified) tender', async () => {
    const { svc, prisma, audit } = makeService(active);
    prisma.ratification.findUnique.mockResolvedValue({ status: 'RATIFIED' });
    await expect(svc.changeStatus(ROC, 't1', 'CANCELLED', 'مبرر إلغاء موثّق كافٍ الطول لتجاوز عشرين حرفًا')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tender.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'TENDER_CANCEL_REFUSED', 'RU-1');
  });

  it('cancels an active pre-award tender with a documented reason, recording the immutable identity', async () => {
    const { svc, prisma, audit } = makeService(active);
    await svc.changeStatus(ROC, 't1', 'CANCELLED', 'مبرر إلغاء موثّق كافٍ الطول لتجاوز عشرين حرفًا');
    expect(prisma.tender.update).toHaveBeenCalledOnce();
    expect(prisma.tender.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({ status: 'CANCELLED', statusChangedBy: 'د. سارة الجبوري', statusChangedByUserId: 'u-roc' }),
    });
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'TENDER_CANCEL', expect.stringContaining('RU-1:'));
  });

  it('refuses any mutation on a cancelled tender (active gate)', async () => {
    const cancelled = { ...active, status: 'CANCELLED' };
    const { svc } = makeService(cancelled);
    await expect(svc.setEvalStep(ROC, 't1', 2)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MCT cycle mutations (6.9)', () => {
  it('records the meeting on a tender in the MCT cycle', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', status: 'ACTIVE', bidders: [], announcement: null, stages: baseStages,
      mct: { notifiedOn: new Date('2026-05-01'), meetingHeldOn: null, agreementReachedOn: null, lcEstimateUSD: 7_800_000, mctEstimateUSD: null, agreedEstimateUSD: null },
    };
    const { svc, prisma, audit } = makeService(tender);
    await svc.recordMctMeeting(ROC, 't1', '2026-05-08');
    expect(prisma.mctCase.update).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'MCT_MEETING_RECORDED', expect.stringContaining('RU-1'));
  });
});

describe('company scope (operator isolation)', () => {
  it('forbids an operator from another company’s tender', async () => {
    const tender = { id: 't1', code: 'RU-1', operatorId: 'other-op', stages: baseStages, bidders: [], mct: null, announcement: null };
    const { svc } = makeService(tender);
    await expect(svc.get(OP, 't1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
