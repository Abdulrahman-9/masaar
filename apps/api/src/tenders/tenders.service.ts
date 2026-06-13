import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  checkAnnouncement,
  detectSplitRisk,
  isPriceVisible,
  METHODS,
  stageCanClose,
  suggestMethod,
  type AnnouncementMode,
  type EvaluationStep,
} from '@masaar/scpp-rules';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { CompleteStageDto, CreateTenderDto } from './dto.js';

const METHOD_ENUM: Record<number, string> = {
  1: 'SOLE_SOURCE',
  2: 'LOW_VALUE',
  3: 'FAST_TRACK',
  4: 'DIRECT',
  5: 'RFP',
  6: 'LIMITED',
  7: 'PUBLIC',
  8: 'TWO_PHASED',
};

const EVAL_STEPS: readonly EvaluationStep[] = ['technical-opening', 'technical-analysis', 'commercial-opening', 'commercial-analysis'];

const REQUIRED_DOCS: Record<string, string[]> = {
  announce: ['announcement-copy'],
  'tech-open': ['opening-minutes'],
  'tech-analysis': ['evaluation-report'],
  'comm-open': ['opening-minutes'],
  'comm-analysis': ['evaluation-report'],
};
const requiredDocsFor = (k: string) => REQUIRED_DOCS[k] ?? ['stage-report'];

@Injectable()
export class TendersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Operator roles see only their own company (10.x scope), enforced here not in the UI. */
  private scopeWhere(user: AuthUser) {
    const operatorScoped = user.role === 'OPERATOR_ADMIN' || user.role === 'OPERATOR_USER';
    return operatorScoped ? { operatorId: user.operatorId } : {};
  }

  private static readonly FULL_INCLUDE = {
    stages: { orderBy: { order: 'asc' as const }, include: { documents: true } },
    announcement: true,
    bidders: true,
    mct: true,
    ratification: true,
  };

  private async loadScoped(user: AuthUser, id: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      include: TendersService.FULL_INCLUDE,
    });
    if (!tender) throw new NotFoundException('Tender not found');
    const operatorScoped = user.role === 'OPERATOR_ADMIN' || user.role === 'OPERATOR_USER';
    if (operatorScoped && tender.operatorId !== user.operatorId) {
      throw new ForbiddenException('Out of company scope');
    }
    return tender;
  }

  list(user: AuthUser) {
    return this.prisma.tender.findMany({
      where: this.scopeWhere(user),
      include: TendersService.FULL_INCLUDE,
      orderBy: { createdOn: 'desc' },
    });
  }

  get(user: AuthUser, id: string) {
    return this.loadScoped(user, id);
  }

  async create(user: AuthUser, dto: CreateTenderDto) {
    const suggestion = suggestMethod({
      estimatedValueUSD: dto.estimatedValueUSD,
      soleSourceCase: dto.soleSourceCase as never,
      specializedOrEmergency: dto.specializedOrEmergency,
      technicallyComplex: dto.technicallyComplex,
      hasPreQualifiedList: dto.hasPreQualifiedList,
      hasRecentQualifiedBidders: dto.hasRecentQualifiedBidders,
    });

    let methodId = suggestion.method.id;
    if (dto.methodIdOverride && dto.methodIdOverride !== suggestion.method.id) {
      // override requires a justification — refused otherwise (mirrors the UI guard, now binding)
      if (!dto.overrideJustification?.trim()) {
        throw new BadRequestException('Override requires a justification');
      }
      if (!METHODS.some((m) => m.id === dto.methodIdOverride)) throw new BadRequestException('Unknown method');
      methodId = dto.methodIdOverride;
    }

    const operatorId = user.operatorId;
    if (!operatorId) throw new ForbiddenException('Only operator users create requests');

    // anti-splitting (7.2): warn — surfaced to the caller, recorded in audit
    const op = await this.prisma.operator.findUnique({ where: { id: operatorId } });
    const fa = Number(op?.financialAuthorityUSD ?? 0);
    const existing = await this.prisma.tender.findMany({ where: { operatorId, budgetCode: dto.budgetCode } });
    const splitRisk = detectSplitRisk(
      [
        ...existing.map((t) => ({ id: t.code, budgetCode: t.budgetCode, estimatedValueUSD: Number(t.estimatedValueUSD), raisedOn: t.createdOn.toISOString().slice(0, 10) })),
        { id: 'NEW', budgetCode: dto.budgetCode, estimatedValueUSD: dto.estimatedValueUSD, raisedOn: new Date().toISOString().slice(0, 10) },
      ],
      fa,
    ).filter((g) => g.requestIds.includes('NEW'));

    const seq = (await this.prisma.tender.count()) + 99;
    const code = `${dto.budgetCode.slice(0, 2).toUpperCase()}-PRJ-${String(seq).padStart(4, '0')}`;
    const stageKeys = this.stageKeysFor(methodId);

    const tender = await this.prisma.tender.create({
      data: {
        code,
        titleAr: dto.titleAr,
        titleEn: dto.titleEn,
        budgetCode: dto.budgetCode,
        estimatedValueUSD: dto.estimatedValueUSD,
        method: METHOD_ENUM[methodId] as never,
        overrideJustification: dto.overrideJustification?.trim() || null,
        operatorId,
        stages: { create: stageKeys.map((key, order) => ({ key, order })) },
        ...(dto.estimatedValueUSD > fa
          ? { mct: { create: { notifiedOn: new Date(), lcEstimateUSD: dto.estimatedValueUSD } } }
          : {}),
      },
    });

    await this.audit.record(user.userId, 'CREATE_TENDER', tender.code);
    if (splitRisk.length > 0) {
      await this.audit.record(user.userId, 'SPLIT_RISK_FLAGGED', `${tender.code} (7.2)`);
    }
    return { tender, suggestion, splitRisk };
  }

  async publishAnnouncement(user: AuthUser, id: string) {
    const tender = await this.loadScoped(user, id);
    const a = tender.announcement;
    if (!a) throw new BadRequestException('No announcement configured');
    if (a.publishedOn) return tender; // idempotent

    const result = checkAnnouncement({
      mode: a.mode.toLowerCase() as AnnouncementMode,
      periodDays: a.periodDays,
      newspapers: a.newspapers,
      publishedOnLcWebsite: a.lcWebsite,
      publishedOnRocWebsite: a.rocWebsite,
      inviteeCount: a.inviteeCount,
      inviteesPreQualified: a.inviteesPreQualified,
    });
    if (!result.ok) {
      // refused attempt is still audited (8.1-e)
      await this.audit.record(user.userId, 'PUBLISH_REFUSED', tender.code);
      throw new BadRequestException({ message: 'Pre-publish checks failed', checks: result.checks });
    }
    await this.prisma.announcement.update({ where: { tenderId: id }, data: { publishedOn: new Date() } });
    await this.audit.record(user.userId, 'PUBLISH_ANNOUNCEMENT', tender.code);
    return this.loadScoped(user, id);
  }

  async setPrice(user: AuthUser, id: string, bidderId: string, priceUSD: number) {
    const tender = await this.loadScoped(user, id);
    const bidder = tender.bidders.find((b) => b.id === bidderId);
    if (!bidder) throw new NotFoundException('Bidder not found');

    const step = EVAL_STEPS[Math.min(Math.max(tender.evaluationStep, 0), 3)]!;
    // price column locked until technical pass + commercial step (12.4.2) — binding here
    if (!isPriceVisible(step, { technicalResult: bidder.technicalResult?.toLowerCase() as 'pass' | 'fail' | undefined })) {
      await this.audit.record(user.userId, 'SET_PRICE_REFUSED', `${tender.code}/${bidderId}`);
      throw new ForbiddenException('Price locked: bidder not technically qualified or not in a commercial step (12.4.2)');
    }
    await this.prisma.bidder.update({ where: { id: bidderId }, data: { priceUSD } });
    await this.audit.record(user.userId, 'SET_PRICE', `${tender.code}/${bidderId}`);
    return this.loadScoped(user, id);
  }

  async completeStage(user: AuthUser, id: string, dto: CompleteStageDto) {
    const tender = await this.loadScoped(user, id);
    const stage = tender.stages.find((s) => s.key === dto.stageKey);
    if (!stage) throw new NotFoundException('Stage not found');
    if (stage.actualTo) return tender; // already closed

    const uploaded = stage.documents.map((d) => d.kind);
    const gate = stageCanClose(requiredDocsFor(stage.key), uploaded);
    if (!gate.ok) {
      await this.audit.record(user.userId, 'COMPLETE_STAGE_REFUSED', tender.code);
      throw new BadRequestException({ message: 'Stage cannot close without required documents', missing: gate.missing });
    }
    await this.prisma.stage.update({ where: { id: stage.id }, data: { actualTo: new Date(dto.actualTo) } });
    await this.audit.record(user.userId, 'COMPLETE_STAGE', `${tender.code}/${stage.key}`);
    return this.loadScoped(user, id);
  }

  /** Current (first not-yet-closed) stage. */
  private currentStageKey(stages: { key: string; order: number; actualTo: Date | null }[]): string | undefined {
    return [...stages].sort((a, b) => a.order - b.order).find((s) => !s.actualTo)?.key;
  }

  /* ---- intra-stage editor mutations (the detail screen edits; not SCPP-gated) ---- */

  async planStage(user: AuthUser, id: string, stageKey: string, plannedFrom?: string, plannedTo?: string) {
    const tender = await this.loadScoped(user, id);
    const stage = tender.stages.find((s) => s.key === stageKey);
    if (!stage) throw new NotFoundException('Stage not found');
    if (stage.actualTo) throw new BadRequestException('Closed stage cannot be re-planned');
    await this.prisma.stage.update({
      where: { id: stage.id },
      data: {
        ...(plannedFrom ? { plannedFrom: new Date(plannedFrom) } : {}),
        ...(plannedTo ? { plannedTo: new Date(plannedTo) } : {}),
      },
    });
    return this.loadScoped(user, id);
  }

  async patchAnnouncement(user: AuthUser, id: string, patch: Record<string, unknown>) {
    const tender = await this.loadScoped(user, id);
    if (!tender.announcement) throw new BadRequestException('No announcement');
    if (tender.announcement.publishedOn) throw new BadRequestException('Published announcement is locked');
    const data: Record<string, unknown> = { ...patch };
    if (typeof patch.mode === 'string') data.mode = patch.mode.toUpperCase();
    await this.prisma.announcement.update({ where: { tenderId: id }, data });
    return this.loadScoped(user, id);
  }

  async setEvalStep(user: AuthUser, id: string, step: number) {
    await this.loadScoped(user, id);
    await this.prisma.tender.update({ where: { id }, data: { evaluationStep: Math.min(Math.max(step, 0), 3) } });
    return this.loadScoped(user, id);
  }

  async addBidder(user: AuthUser, id: string, name: string) {
    await this.loadScoped(user, id);
    await this.prisma.bidder.create({ data: { tenderId: id, name, docsOk: true, bondOk: true } });
    return this.loadScoped(user, id);
  }

  async setTechnical(user: AuthUser, id: string, bidderId: string, result: 'pass' | 'fail') {
    const tender = await this.loadScoped(user, id);
    if (!tender.bidders.some((b) => b.id === bidderId)) throw new NotFoundException('Bidder not found');
    await this.prisma.bidder.update({ where: { id: bidderId }, data: { technicalResult: result.toUpperCase() as 'PASS' | 'FAIL' } });
    return this.loadScoped(user, id);
  }

  async toggleDoc(user: AuthUser, id: string, stageKey: string, doc: string) {
    const tender = await this.loadScoped(user, id);
    const stage = tender.stages.find((s) => s.key === stageKey);
    if (!stage) throw new NotFoundException('Stage not found');
    if (stage.actualTo) throw new BadRequestException('Closed stage');
    const existing = stage.documents.find((d) => d.kind === doc);
    if (existing) {
      await this.prisma.document.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.document.create({ data: { stageId: stage.id, kind: doc, fileUrl: `mock://${doc}` } });
    }
    return this.loadScoped(user, id);
  }

  async ratify(user: AuthUser, id: string) {
    const tender = await this.loadScoped(user, id);
    const existing = await this.prisma.ratification.findUnique({ where: { tenderId: id } });
    if (existing) throw new BadRequestException('Already decided');
    if (this.currentStageKey(tender.stages) !== 'ratify') {
      throw new BadRequestException('Tender is not at the ratification stage');
    }
    const r = await this.prisma.ratification.create({ data: { tenderId: id, status: 'RATIFIED', by: user.name } });
    await this.audit.record(user.userId, 'RATIFY', tender.code);
    return r;
  }

  async returnWithNotes(user: AuthUser, id: string, notes: string) {
    const tender = await this.loadScoped(user, id);
    const existing = await this.prisma.ratification.findUnique({ where: { tenderId: id } });
    if (existing) throw new BadRequestException('Already decided');
    if (!notes.trim()) throw new BadRequestException('Notes are required to return');
    if (this.currentStageKey(tender.stages) !== 'ratify') {
      throw new BadRequestException('Tender is not at the ratification stage');
    }
    const r = await this.prisma.ratification.create({ data: { tenderId: id, status: 'RETURNED', by: user.name, notes: notes.trim() } });
    await this.audit.record(user.userId, 'RETURN_WITH_NOTES', tender.code);
    return r;
  }

  private stageKeysFor(methodId: number): string[] {
    const ALL = ['cost', 'approval', 'preq', 'announce', 'invite', 'tech-open', 'tech-analysis', 'comm-open', 'comm-analysis', 'ratify', 'sign'];
    switch (methodId) {
      case 7:
        return ALL.filter((k) => k !== 'preq' && k !== 'invite');
      case 6:
      case 4:
        return ALL.filter((k) => k !== 'announce');
      case 3:
        return ['cost', 'approval', 'invite', 'comm-open', 'comm-analysis', 'ratify', 'sign'];
      case 1:
      case 2:
        return ['cost', 'approval', 'comm-analysis', 'ratify', 'sign'];
      default:
        return ALL;
    }
  }
}
