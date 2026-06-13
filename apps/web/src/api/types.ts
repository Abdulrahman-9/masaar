/** Wire shapes returned by the API (Prisma models serialized to JSON). */

export type ApiMethod = 'SOLE_SOURCE' | 'LOW_VALUE' | 'FAST_TRACK' | 'DIRECT' | 'RFP' | 'LIMITED' | 'PUBLIC' | 'TWO_PHASED';
export type Num = number | string; // Prisma Decimal serializes to string

export interface ApiStage {
  key: string;
  order: number;
  plannedFrom: string | null;
  plannedTo: string | null;
  actualTo: string | null;
  documents: { kind: string }[];
}

export interface ApiAnnouncement {
  mode: 'PUBLIC' | 'LIMITED' | 'DIRECT';
  periodDays: number;
  newspapers: string[];
  lcWebsite: boolean;
  rocWebsite: boolean;
  inviteeCount: number;
  inviteesPreQualified: boolean;
  publishedOn: string | null;
}

export interface ApiBidder {
  id: string;
  name: string;
  docsOk: boolean;
  bondOk: boolean;
  technicalResult: 'PASS' | 'FAIL' | null;
  priceUSD: Num | null;
}

export interface ApiMct {
  notifiedOn: string;
  meetingHeldOn: string | null;
  agreementReachedOn: string | null;
  lcEstimateUSD: Num;
  mctEstimateUSD: Num | null;
  agreedEstimateUSD: Num | null;
}

export interface ApiRatification {
  status: 'RATIFIED' | 'RETURNED';
  by: string;
  on: string;
  notes: string | null;
}

export interface ApiTender {
  id: string;
  code: string;
  titleAr: string;
  titleEn: string;
  budgetCode: string;
  estimatedValueUSD: Num;
  method: ApiMethod;
  overrideJustification: string | null;
  createdOn: string;
  evaluationStep: number;
  stages: ApiStage[];
  announcement: ApiAnnouncement | null;
  bidders: ApiBidder[];
  mct: ApiMct | null;
  ratification: ApiRatification | null;
}

export interface ApiContract {
  id: string;
  code: string;
  valueUSD: Num;
  termDays: number;
  tender: { titleAr: string; titleEn: string } | null;
  guarantees: { kind: 'BID_BOND' | 'PERFORMANCE' | 'ADVANCE'; valueUSD: Num; expiresOn: string }[];
  vos: { valueUSD: Num }[];
  extensions: { days: number }[];
  lds: { valueUSD: Num }[];
}

export interface ApiVendor {
  id: string;
  name: string;
  mooListed: boolean;
  suspended: boolean;
  blacklisted: boolean;
  inDispute: boolean;
  banUntil: string | null;
  banReason: string | null;
  techScore: number | null;
  financialScore: number | null;
  hseScore: number | null;
}

export interface ApiAudit {
  ts: string;
  action: string;
  target: string;
}

export interface ApiSession {
  user: { userId: string; name: string; role: string; operatorId?: string };
}
