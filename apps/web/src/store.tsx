import {
  checkAnnouncement,
  isPriceVisible,
  stageCanClose,
  stageDeviationDays,
  type AnnouncementMode,
  type EvaluationStep,
} from '@masaar/scpp-rules';
import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';

/**
 * Client-side tender store — stands in for the future API.
 * Shape mirrors the Prisma models in packages/db/schema.prisma 1:1.
 * Every mutating action re-runs the engine guard the server will run; the
 * reducer refuses state changes the SCPP rules refuse, and every action —
 * including refused attempts — lands in the append-only audit log (8.1-e).
 */

/** FA comes from each Service Contract (§7) — configurable per operator; demo value. */
export const FINANCIAL_AUTHORITY_USD = 5_000_000;

/* ---------------- types ---------------- */

export interface StageState {
  key: string;
  plannedFrom?: string;
  plannedTo?: string;
  actualTo?: string;
  uploadedDocs: string[];
}

export interface BidderState {
  id: string;
  name: string;
  docsOk: boolean;
  bondOk: boolean;
  technicalResult?: 'pass' | 'fail';
  priceUSD?: number;
}

export interface AnnouncementState {
  mode: AnnouncementMode;
  periodDays: number;
  newspapers: [string, string, string];
  lcWebsite: boolean;
  rocWebsite: boolean;
  inviteeCount: number;
  inviteesPreQualified: boolean;
  publishedOn?: string;
}

/** MCT cost cycle (6.9) — only present on tenders above Financial Authority. */
export interface MctState {
  notifiedOn: string;
  meetingHeldOn?: string;
  agreementReachedOn?: string;
  lcEstimateUSD: number;
  mctEstimateUSD?: number;
  agreedEstimateUSD?: number;
}

export interface Tender {
  id: string;
  code: string;
  title: { ar: string; en: string };
  budgetCode: string;
  estimatedValueUSD: number;
  methodId: number;
  overrideJustification?: string;
  createdOn: string;
  stages: StageState[];
  announcement: AnnouncementState;
  evaluationStep: number; // 0..3
  bidders: BidderState[];
  mct?: MctState;
  /** ROC ratification decision on the award (admin side). */
  ratification?: RatificationState;
}

export interface RatificationState {
  status: 'ratified' | 'returned';
  by: string;
  on: string;
  notes?: string;
}

export interface GuaranteeState {
  kind: 'bid-bond' | 'performance' | 'advance';
  valueUSD: number;
  expiresOn: string;
}

/** Post-award contract — the §18–§21 caps apply to it. */
export interface ContractState {
  id: string;
  code: string;
  title: { ar: string; en: string };
  valueUSD: number;
  termDays: number;
  voTotalUSD: number;
  extensionDays: number;
  ldTotalUSD: number;
  guarantees: GuaranteeState[];
}

/** Append-only — there is no action that removes or edits entries (8.1-e). */
export interface AuditEntry {
  ts: string;
  action: string;
  target: string;
}

export interface VendorState {
  id: string;
  name: string;
  mooListed: boolean; // MoO Vendor List membership
  suspended?: boolean;
  blacklisted?: boolean;
  inDispute?: boolean;
  banUntil?: string; // refusal-to-sign ban ≤ 12 months (14.3)
  banReason?: { ar: string; en: string };
  techScore: number;
  financialScore: number;
  hseScore: number;
}

export interface State {
  tenders: Tender[];
  contracts: ContractState[];
  vendors: VendorState[];
  audit: AuditEntry[];
  seq: number;
}

/* ---------------- workflow config (app-level, not SCPP law) ---------------- */

export function defaultStageKeys(methodId: number): string[] {
  const ALL = ['cost', 'approval', 'preq', 'announce', 'invite', 'tech-open', 'tech-analysis', 'comm-open', 'comm-analysis', 'ratify', 'sign'];
  switch (methodId) {
    case 7: // public — no pre-qualification (11.1), no invitations
      return ALL.filter((k) => k !== 'preq' && k !== 'invite');
    case 6: // limited — invitations, no public announcement
    case 4: // direct
      return ALL.filter((k) => k !== 'announce');
    case 3: // fast track — commercial bids only (11.7)
      return ['cost', 'approval', 'invite', 'comm-open', 'comm-analysis', 'ratify', 'sign'];
    case 1: // sole source
    case 2: // low-value
      return ['cost', 'approval', 'comm-analysis', 'ratify', 'sign'];
    default:
      return ALL;
  }
}

export const REQUIRED_DOCS: Record<string, string[]> = {
  announce: ['announcement-copy'],
  invite: ['announcement-copy'],
  'tech-open': ['opening-minutes'],
  'tech-analysis': ['evaluation-report'],
  'comm-open': ['opening-minutes'],
  'comm-analysis': ['evaluation-report'],
};
export const DEFAULT_DOC = 'stage-report';
export function requiredDocsFor(stageKey: string): string[] {
  return REQUIRED_DOCS[stageKey] ?? [DEFAULT_DOC];
}

const EVAL_STEPS: readonly EvaluationStep[] = ['technical-opening', 'technical-analysis', 'commercial-opening', 'commercial-analysis'];
export function evalStepName(i: number): EvaluationStep {
  return EVAL_STEPS[Math.min(Math.max(i, 0), 3)]!;
}

export function defaultAnnouncementFor(methodId: number): AnnouncementState {
  const mode: AnnouncementMode = methodId === 4 ? 'direct' : methodId === 6 ? 'limited' : 'public';
  return {
    mode,
    periodDays: mode === 'public' ? 21 : 14,
    newspapers: ['', '', ''],
    lcWebsite: false,
    rocWebsite: false,
    inviteeCount: 0,
    inviteesPreQualified: false,
  };
}

export function announcementInput(a: AnnouncementState) {
  return {
    mode: a.mode,
    periodDays: a.periodDays,
    newspapers: a.newspapers,
    publishedOnLcWebsite: a.lcWebsite,
    publishedOnRocWebsite: a.rocWebsite,
    inviteeCount: a.inviteeCount,
    inviteesPreQualified: a.inviteesPreQualified,
  };
}

/* ---------------- derived ---------------- */

export function currentStage(t: Tender): StageState | undefined {
  return t.stages.find((s) => !s.actualTo);
}

export function totalDeviationDays(t: Tender): number {
  return t.stages
    .filter((s) => s.actualTo && s.plannedTo)
    .reduce((sum, s) => sum + Math.max(stageDeviationDays(s.plannedTo!, s.actualTo!), 0), 0);
}

export function expectedAwardDate(t: Tender): string | undefined {
  const tos = t.stages.map((s) => s.plannedTo).filter((d): d is string => !!d);
  return tos.length ? tos.reduce((a, b) => (a > b ? a : b)) : undefined;
}

export function stageStatus(s: StageState, today: string): 'planned' | 'progress' | 'done' | 'delayed' {
  if (s.actualTo) return 'done';
  if (s.plannedTo && today > s.plannedTo) return 'delayed';
  if (s.plannedFrom && today >= s.plannedFrom) return 'progress';
  return 'planned';
}

export function isAboveFA(t: Tender): boolean {
  return t.estimatedValueUSD > FINANCIAL_AUTHORITY_USD;
}

/** Resolve the accredited estimate per the prevailing rule (6.9.1 / 6.9.2 / agreed). */
export function accreditedEstimate(m: MctState, prevailing: 'AGREED' | 'LC' | 'MCT' | 'PENDING'): number {
  if (prevailing === 'AGREED' && m.agreedEstimateUSD != null) return m.agreedEstimateUSD;
  if (prevailing === 'MCT' && m.mctEstimateUSD != null) return m.mctEstimateUSD;
  return m.lcEstimateUSD;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ---------------- actions ---------------- */

export type Action =
  | {
      type: 'CREATE_TENDER';
      title: { ar: string; en: string };
      budgetCode: string;
      estimatedValueUSD: number;
      methodId: number;
      overrideJustification?: string;
    }
  | { type: 'PLAN_STAGE'; tenderId: string; stageKey: string; plannedFrom?: string; plannedTo?: string }
  | { type: 'SET_ANNOUNCEMENT'; tenderId: string; patch: Partial<AnnouncementState> }
  | { type: 'PUBLISH_ANNOUNCEMENT'; tenderId: string }
  | { type: 'SET_EVAL_STEP'; tenderId: string; step: number }
  | { type: 'ADD_BIDDER'; tenderId: string; name: string }
  | { type: 'SET_TECHNICAL'; tenderId: string; bidderId: string; result: 'pass' | 'fail' }
  | { type: 'SET_PRICE'; tenderId: string; bidderId: string; priceUSD: number }
  | { type: 'TOGGLE_DOC'; tenderId: string; stageKey: string; doc: string }
  | { type: 'COMPLETE_STAGE'; tenderId: string; stageKey: string; actualTo: string }
  | { type: 'RATIFY'; tenderId: string; by: string }
  | { type: 'RETURN_WITH_NOTES'; tenderId: string; by: string; notes: string }
  | { type: 'RESET' };

function patchTender(state: State, id: string, fn: (t: Tender) => Tender): State {
  return { ...state, tenders: state.tenders.map((t) => (t.id === id ? fn(t) : t)) };
}

function actionTarget(state: State, action: Action): string {
  if ('tenderId' in action) {
    return state.tenders.find((t) => t.id === action.tenderId)?.code ?? action.tenderId;
  }
  if (action.type === 'CREATE_TENDER') return action.budgetCode;
  return '—';
}

function apply(state: State, action: Action): State {
  switch (action.type) {
    case 'CREATE_TENDER': {
      const seq = state.seq + 1;
      const code = `${action.budgetCode.slice(0, 2).toUpperCase() || 'LC'}-PRJ-${String(seq).padStart(4, '0')}`;
      const tender: Tender = {
        id: `t${seq}`,
        code,
        title: action.title,
        budgetCode: action.budgetCode,
        estimatedValueUSD: action.estimatedValueUSD,
        methodId: action.methodId,
        overrideJustification: action.overrideJustification,
        createdOn: todayIso(),
        stages: defaultStageKeys(action.methodId).map((key) => ({ key, uploadedDocs: [] })),
        announcement: defaultAnnouncementFor(action.methodId),
        evaluationStep: 0,
        bidders: [],
        // above-FA tenders enter the MCT cycle: official e-mail notification (6.9)
        mct:
          action.estimatedValueUSD > FINANCIAL_AUTHORITY_USD
            ? { notifiedOn: todayIso(), lcEstimateUSD: action.estimatedValueUSD }
            : undefined,
      };
      return { ...state, seq, tenders: [tender, ...state.tenders] };
    }
    case 'PLAN_STAGE':
      return patchTender(state, action.tenderId, (t) => ({
        ...t,
        stages: t.stages.map((s) =>
          s.key === action.stageKey && !s.actualTo
            ? { ...s, plannedFrom: action.plannedFrom ?? s.plannedFrom, plannedTo: action.plannedTo ?? s.plannedTo }
            : s,
        ),
      }));
    case 'SET_ANNOUNCEMENT':
      return patchTender(state, action.tenderId, (t) =>
        t.announcement.publishedOn ? t : { ...t, announcement: { ...t.announcement, ...action.patch } },
      );
    case 'PUBLISH_ANNOUNCEMENT':
      return patchTender(state, action.tenderId, (t) => {
        // the same guard the API will enforce — publish refused until every check passes
        if (t.announcement.publishedOn || !checkAnnouncement(announcementInput(t.announcement)).ok) return t;
        return { ...t, announcement: { ...t.announcement, publishedOn: todayIso() } };
      });
    case 'SET_EVAL_STEP':
      return patchTender(state, action.tenderId, (t) => ({
        ...t,
        evaluationStep: Math.min(Math.max(action.step, 0), 3),
      }));
    case 'ADD_BIDDER':
      return patchTender(state, action.tenderId, (t) => ({
        ...t,
        bidders: [
          ...t.bidders,
          { id: `b${t.bidders.length + 1}-${t.id}`, name: action.name, docsOk: true, bondOk: true },
        ],
      }));
    case 'SET_TECHNICAL':
      return patchTender(state, action.tenderId, (t) => ({
        ...t,
        bidders: t.bidders.map((b) => (b.id === action.bidderId ? { ...b, technicalResult: action.result } : b)),
      }));
    case 'SET_PRICE':
      return patchTender(state, action.tenderId, (t) => ({
        ...t,
        bidders: t.bidders.map((b) => {
          if (b.id !== action.bidderId) return b;
          // price column locked until technical pass + commercial step (12.4.2)
          if (!isPriceVisible(evalStepName(t.evaluationStep), b)) return b;
          return { ...b, priceUSD: action.priceUSD };
        }),
      }));
    case 'TOGGLE_DOC':
      return patchTender(state, action.tenderId, (t) => ({
        ...t,
        stages: t.stages.map((s) => {
          if (s.key !== action.stageKey || s.actualTo) return s;
          const has = s.uploadedDocs.includes(action.doc);
          return { ...s, uploadedDocs: has ? s.uploadedDocs.filter((d) => d !== action.doc) : [...s.uploadedDocs, action.doc] };
        }),
      }));
    case 'COMPLETE_STAGE':
      return patchTender(state, action.tenderId, (t) => ({
        ...t,
        stages: t.stages.map((s) => {
          if (s.key !== action.stageKey || s.actualTo) return s;
          // stages cannot close without required documents
          if (!stageCanClose(requiredDocsFor(s.key), s.uploadedDocs).ok) return s;
          return { ...s, actualTo: action.actualTo };
        }),
      }));
    case 'RATIFY':
      return patchTender(state, action.tenderId, (t) => {
        // ratification only at the award-ratification stage, and never twice
        if (t.ratification || currentStage(t)?.key !== 'ratify') return t;
        return { ...t, ratification: { status: 'ratified', by: action.by, on: todayIso() } };
      });
    case 'RETURN_WITH_NOTES':
      return patchTender(state, action.tenderId, (t) => {
        if (t.ratification || currentStage(t)?.key !== 'ratify' || !action.notes.trim()) return t;
        return { ...t, ratification: { status: 'returned', by: action.by, on: todayIso(), notes: action.notes.trim() } };
      });
    case 'RESET':
      return seedState();
    default:
      return state;
  }
}

export function reducer(state: State, action: Action): State {
  const next = apply(state, action);
  if (action.type === 'RESET' || next === state) return next;
  // append-only audit (8.1-e) — attempts are logged whether or not the guard let them through
  return {
    ...next,
    audit: [...next.audit, { ts: new Date().toISOString(), action: action.type, target: actionTarget(state, action) }],
  };
}

/* ---------------- seed ---------------- */

export function seedState(): State {
  const t1: Tender = {
    id: 't1',
    code: 'RU-DRL-0212',
    title: { ar: 'حفر آبار تقييمية — حقل الرميلة', en: 'Appraisal well drilling — Rumaila field' },
    budgetCode: 'RU-DRL-77',
    estimatedValueUSD: 4_200_000,
    methodId: 7,
    createdOn: '2026-04-28',
    stages: [
      { key: 'cost', plannedFrom: '2026-05-01', plannedTo: '2026-05-07', actualTo: '2026-05-07', uploadedDocs: ['stage-report'] },
      { key: 'approval', plannedFrom: '2026-05-08', plannedTo: '2026-05-12', actualTo: '2026-05-12', uploadedDocs: ['stage-report'] },
      { key: 'announce', plannedFrom: '2026-05-13', plannedTo: '2026-06-05', actualTo: '2026-06-05', uploadedDocs: ['announcement-copy'] },
      { key: 'tech-open', plannedFrom: '2026-06-07', plannedTo: '2026-06-09', actualTo: '2026-06-09', uploadedDocs: ['opening-minutes'] },
      { key: 'tech-analysis', plannedFrom: '2026-06-10', plannedTo: '2026-06-21', uploadedDocs: [] },
      { key: 'comm-open', plannedFrom: '2026-06-22', plannedTo: '2026-06-24', uploadedDocs: [] },
      { key: 'comm-analysis', plannedFrom: '2026-06-25', plannedTo: '2026-07-05', uploadedDocs: [] },
      { key: 'ratify', plannedFrom: '2026-07-06', plannedTo: '2026-07-15', uploadedDocs: [] },
      { key: 'sign', plannedFrom: '2026-07-16', plannedTo: '2026-07-22', uploadedDocs: [] },
    ],
    announcement: {
      mode: 'public',
      periodDays: 23,
      newspapers: ['الصباح', 'الزمان', 'المدى'],
      lcWebsite: true,
      rocWebsite: true,
      inviteeCount: 0,
      inviteesPreQualified: false,
      publishedOn: '2026-05-13',
    },
    evaluationStep: 1,
    bidders: [
      { id: 'b1-t1', name: 'شركة الحفر العراقية', docsOk: true, bondOk: true, technicalResult: 'pass' },
      { id: 'b2-t1', name: 'النور للمقاولات النفطية', docsOk: true, bondOk: true, technicalResult: 'fail' },
      { id: 'b3-t1', name: 'Basra Energy Services', docsOk: true, bondOk: true, technicalResult: 'pass' },
      { id: 'b4-t1', name: 'دجلة للخدمات النفطية', docsOk: true, bondOk: false },
    ],
  };

  const t2: Tender = {
    id: 't2',
    code: 'WQ-MNT-0098',
    title: { ar: 'صيانة وحدة عزل الغاز', en: 'Gas separation unit maintenance' },
    budgetCode: 'WQ-MNT-12',
    estimatedValueUSD: 850_000,
    methodId: 6,
    createdOn: '2026-05-10',
    stages: [
      { key: 'cost', plannedFrom: '2026-05-12', plannedTo: '2026-05-20', actualTo: '2026-05-29', uploadedDocs: ['stage-report'] },
      { key: 'approval', plannedFrom: '2026-05-30', plannedTo: '2026-06-20', uploadedDocs: [] },
      { key: 'preq', uploadedDocs: [] },
      { key: 'invite', uploadedDocs: [] },
      { key: 'tech-open', uploadedDocs: [] },
      { key: 'tech-analysis', uploadedDocs: [] },
      { key: 'comm-open', uploadedDocs: [] },
      { key: 'comm-analysis', uploadedDocs: [] },
      { key: 'ratify', uploadedDocs: [] },
      { key: 'sign', uploadedDocs: [] },
    ],
    announcement: { ...defaultAnnouncementFor(6) },
    evaluationStep: 0,
    bidders: [],
  };

  // above Financial Authority → in the MCT cycle (6.9)
  const t3: Tender = {
    id: 't3',
    code: 'MJ-EPC-0305',
    title: { ar: 'إنشاء محطة عزل مركزية — حقل مجنون', en: 'Central degassing station EPC — Majnoon field' },
    budgetCode: 'MJ-EPC-04',
    estimatedValueUSD: 7_800_000,
    methodId: 7,
    createdOn: '2026-04-20',
    stages: [
      { key: 'cost', plannedFrom: '2026-04-22', plannedTo: '2026-04-30', actualTo: '2026-04-30', uploadedDocs: ['stage-report'] },
      { key: 'approval', plannedFrom: '2026-05-01', plannedTo: '2026-05-06', actualTo: '2026-05-06', uploadedDocs: ['stage-report'] },
      { key: 'announce', plannedFrom: '2026-05-07', plannedTo: '2026-05-30', actualTo: '2026-05-30', uploadedDocs: ['announcement-copy'] },
      { key: 'tech-open', plannedFrom: '2026-05-31', plannedTo: '2026-06-02', actualTo: '2026-06-02', uploadedDocs: ['opening-minutes'] },
      { key: 'tech-analysis', plannedFrom: '2026-06-03', plannedTo: '2026-06-08', actualTo: '2026-06-08', uploadedDocs: ['evaluation-report'] },
      { key: 'comm-open', plannedFrom: '2026-06-09', plannedTo: '2026-06-10', actualTo: '2026-06-10', uploadedDocs: ['opening-minutes'] },
      { key: 'comm-analysis', plannedFrom: '2026-06-11', plannedTo: '2026-06-25', actualTo: '2026-06-24', uploadedDocs: ['evaluation-report'] },
      { key: 'ratify', plannedFrom: '2026-06-26', plannedTo: '2026-07-06', uploadedDocs: [] },
      { key: 'sign', plannedFrom: '2026-07-07', plannedTo: '2026-07-14', uploadedDocs: [] },
    ],
    announcement: {
      mode: 'public',
      periodDays: 23,
      newspapers: ['الصباح', 'العالم', 'المدى'],
      lcWebsite: true,
      rocWebsite: true,
      inviteeCount: 0,
      inviteesPreQualified: false,
      publishedOn: '2026-05-07',
    },
    evaluationStep: 3,
    bidders: [
      { id: 'b1-t3', name: 'Gulf EPC Contracting', docsOk: true, bondOk: true, technicalResult: 'pass', priceUSD: 8_120_000 },
      { id: 'b2-t3', name: 'شركة المشاريع النفطية SCOP', docsOk: true, bondOk: true, technicalResult: 'pass', priceUSD: 8_940_000 },
      { id: 'b3-t3', name: 'الفرات للإنشاءات', docsOk: true, bondOk: true, technicalResult: 'fail' },
    ],
    mct: {
      notifiedOn: '2026-05-24',
      meetingHeldOn: '2026-06-08',
      lcEstimateUSD: 7_800_000,
      mctEstimateUSD: 7_500_000,
    },
  };

  const c1: ContractState = {
    id: 'c1',
    code: 'RU-CON-0188',
    title: { ar: 'عقد حفر تطويري — الرميلة', en: 'Development drilling contract — Rumaila' },
    valueUSD: 12_500_000,
    termDays: 540,
    voTotalUSD: 1_050_000, // 8.4% → approaching the 10% cap
    extensionDays: 90, // 16.7% of term — within the 25% cap
    ldTotalUSD: 310_000, // 2.5%
    guarantees: [
      { kind: 'performance', valueUSD: 650_000, expiresOn: '2026-07-20' }, // expiring within 60 days
      { kind: 'advance', valueUSD: 1_000_000, expiresOn: '2027-01-15' },
    ],
  };

  const vendors: VendorState[] = [
    { id: 'v1', name: 'شركة الحفر العراقية', mooListed: true, techScore: 88, financialScore: 76, hseScore: 82 },
    { id: 'v2', name: 'Basra Energy Services', mooListed: true, techScore: 79, financialScore: 85, hseScore: 74 },
    { id: 'v3', name: 'النور للمقاولات النفطية', mooListed: false, techScore: 62, financialScore: 58, hseScore: 66 },
    {
      id: 'v4',
      name: 'دجلة للخدمات النفطية',
      mooListed: true,
      suspended: true,
      banUntil: '2026-11-01',
      banReason: { ar: 'رفض توقيع عقد محال (14.3)', en: 'Refused to sign an awarded contract (14.3)' },
      techScore: 71,
      financialScore: 64,
      hseScore: 59,
    },
  ];

  return { tenders: [t1, t2, t3], contracts: [c1], vendors, audit: [], seq: 98 };
}

/* ---------------- context ---------------- */

const KEY = 'masaar-operator-v3';

function loadState(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (Array.isArray(parsed.tenders) && Array.isArray(parsed.audit) && Array.isArray(parsed.vendors)) return parsed;
    }
  } catch {
    /* corrupted → reseed */
  }
  return seedState();
}

const StoreCtx = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full/blocked — in-memory only */
    }
  }, [state]);
  return <StoreCtx.Provider value={{ state, dispatch }}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}
