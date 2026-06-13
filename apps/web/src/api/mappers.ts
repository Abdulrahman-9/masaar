import type {
  AnnouncementMode,
} from '@masaar/scpp-rules';
import type {
  AnnouncementState,
  AuditEntry,
  BidderState,
  ContractState,
  GuaranteeState,
  MctState,
  RatificationState,
  StageState,
  Tender,
  VendorState,
} from '../store';
import type {
  ApiAnnouncement,
  ApiAudit,
  ApiBidder,
  ApiContract,
  ApiMct,
  ApiMethod,
  ApiStage,
  ApiTender,
  ApiVendor,
  Num,
} from './types';

const num = (v: Num | null | undefined): number => (v == null ? 0 : typeof v === 'number' ? v : Number(v));
const date = (v: string | null | undefined): string | undefined => (v ? v.slice(0, 10) : undefined);

const METHOD_ID: Record<ApiMethod, number> = {
  SOLE_SOURCE: 1,
  LOW_VALUE: 2,
  FAST_TRACK: 3,
  DIRECT: 4,
  RFP: 5,
  LIMITED: 6,
  PUBLIC: 7,
  TWO_PHASED: 8,
};

function mapStage(s: ApiStage): StageState {
  return {
    key: s.key,
    plannedFrom: date(s.plannedFrom),
    plannedTo: date(s.plannedTo),
    actualTo: date(s.actualTo),
    uploadedDocs: s.documents.map((d) => d.kind),
  };
}

function mapAnnouncement(a: ApiAnnouncement | null, methodId: number): AnnouncementState {
  const mode = (a?.mode.toLowerCase() ?? (methodId === 4 ? 'direct' : methodId === 6 ? 'limited' : 'public')) as AnnouncementMode;
  const papers = a?.newspapers ?? [];
  return {
    mode,
    periodDays: a?.periodDays ?? (mode === 'public' ? 21 : 14),
    newspapers: [papers[0] ?? '', papers[1] ?? '', papers[2] ?? ''],
    lcWebsite: a?.lcWebsite ?? false,
    rocWebsite: a?.rocWebsite ?? false,
    inviteeCount: a?.inviteeCount ?? 0,
    inviteesPreQualified: a?.inviteesPreQualified ?? false,
    publishedOn: date(a?.publishedOn),
  };
}

function mapBidder(b: ApiBidder): BidderState {
  return {
    id: b.id,
    name: b.name,
    docsOk: b.docsOk,
    bondOk: b.bondOk,
    technicalResult: b.technicalResult ? (b.technicalResult.toLowerCase() as 'pass' | 'fail') : undefined,
    priceUSD: b.priceUSD == null ? undefined : num(b.priceUSD),
  };
}

function mapMct(m: ApiMct | null): MctState | undefined {
  if (!m) return undefined;
  return {
    notifiedOn: date(m.notifiedOn)!,
    meetingHeldOn: date(m.meetingHeldOn),
    agreementReachedOn: date(m.agreementReachedOn),
    lcEstimateUSD: num(m.lcEstimateUSD),
    mctEstimateUSD: m.mctEstimateUSD == null ? undefined : num(m.mctEstimateUSD),
    agreedEstimateUSD: m.agreedEstimateUSD == null ? undefined : num(m.agreedEstimateUSD),
  };
}

export function mapTender(t: ApiTender): Tender {
  const methodId = METHOD_ID[t.method];
  const ratification: RatificationState | undefined = t.ratification
    ? { status: t.ratification.status.toLowerCase() as 'ratified' | 'returned', by: t.ratification.by, on: date(t.ratification.on)!, notes: t.ratification.notes ?? undefined }
    : undefined;
  return {
    id: t.id,
    code: t.code,
    title: { ar: t.titleAr, en: t.titleEn },
    budgetCode: t.budgetCode,
    estimatedValueUSD: num(t.estimatedValueUSD),
    methodId,
    overrideJustification: t.overrideJustification ?? undefined,
    createdOn: date(t.createdOn)!,
    stages: [...t.stages].sort((a, b) => a.order - b.order).map(mapStage),
    announcement: mapAnnouncement(t.announcement, methodId),
    evaluationStep: t.evaluationStep,
    bidders: t.bidders.map(mapBidder),
    mct: mapMct(t.mct),
    ratification,
  };
}

export function mapContract(c: ApiContract): ContractState {
  const guarantees: GuaranteeState[] = c.guarantees.map((g) => ({
    kind: g.kind === 'BID_BOND' ? 'bid-bond' : g.kind === 'PERFORMANCE' ? 'performance' : 'advance',
    valueUSD: num(g.valueUSD),
    expiresOn: date(g.expiresOn)!,
  }));
  return {
    id: c.id,
    code: c.code,
    title: { ar: c.tender?.titleAr ?? c.code, en: c.tender?.titleEn ?? c.code },
    valueUSD: num(c.valueUSD),
    termDays: c.termDays,
    voTotalUSD: c.vos.reduce((s, v) => s + num(v.valueUSD), 0),
    extensionDays: c.extensions.reduce((s, e) => s + e.days, 0),
    ldTotalUSD: c.lds.reduce((s, l) => s + num(l.valueUSD), 0),
    guarantees,
  };
}

export function mapVendor(v: ApiVendor): VendorState {
  return {
    id: v.id,
    name: v.name,
    mooListed: v.mooListed,
    suspended: v.suspended || undefined,
    blacklisted: v.blacklisted || undefined,
    inDispute: v.inDispute || undefined,
    banUntil: date(v.banUntil),
    banReason: v.banReason ? { ar: v.banReason, en: v.banReason } : undefined,
    techScore: v.techScore ?? 0,
    financialScore: v.financialScore ?? 0,
    hseScore: v.hseScore ?? 0,
  };
}

export function mapAudit(a: ApiAudit): AuditEntry {
  return { ts: a.ts, action: a.action, target: a.target };
}
