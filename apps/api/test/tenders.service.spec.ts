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
    tender: { findUnique: vi.fn().mockResolvedValue(tender) },
    announcement: { update: vi.fn().mockResolvedValue({}) },
    bidder: { update: vi.fn().mockResolvedValue({}) },
    stage: { update: vi.fn().mockResolvedValue({}) },
    ratification: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
  };
  const svc = new TendersService(prisma as never, audit as never);
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

describe('ratify / return guards', () => {
  it('refuses to ratify when not at the ratification stage', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null,
      stages: [{ id: 's', key: 'tech-analysis', order: 4, actualTo: null, documents: [] }],
    };
    const { svc } = makeService(tender);
    await expect(svc.ratify(ROC, 't1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ratifies a tender at the ratify stage', async () => {
    const tender = { id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null, stages: baseStages };
    const { svc, prisma } = makeService(tender);
    await svc.ratify(ROC, 't1');
    expect(prisma.ratification.create).toHaveBeenCalledOnce();
  });

  it('refuses to return without notes', async () => {
    const tender = { id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null, stages: baseStages };
    const { svc } = makeService(tender);
    await expect(svc.returnWithNotes(ROC, 't1', '   ')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('company scope (operator isolation)', () => {
  it('forbids an operator from another company’s tender', async () => {
    const tender = { id: 't1', code: 'RU-1', operatorId: 'other-op', stages: baseStages, bidders: [], mct: null, announcement: null };
    const { svc } = makeService(tender);
    await expect(svc.get(OP, 't1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
