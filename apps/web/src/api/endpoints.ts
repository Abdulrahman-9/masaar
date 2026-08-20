import { api, ApiError } from './client';
import { mapAudit, mapContract, mapTender, mapUser, mapVendor } from './mappers';
import type { ApiAudit, ApiContract, ApiSession, ApiTender, ApiUser, ApiVendor } from './types';
import type { ApiLoginableRole } from '../session';
import { SEED_APPROVAL_TIERS, type Action, type State, type Tender } from '../store';

/* ---------------- auth ---------------- */

/**
 * The role parameter is typed from `API_LOGINABLE_ROLES`, the client's mirror of the server's
 * `LoginDto @IsIn(...)`. One list: a role the server will not mint a session for cannot be typed
 * into this call, and a role added there is admitted here without a second edit.
 */
export function apiLogin(role: ApiLoginableRole, otp: string) {
  return api<ApiSession>('/auth/login', { method: 'POST', body: { role, otp } });
}
export function apiLogout() {
  return api<{ ok: true }>('/auth/logout', { method: 'POST' });
}
export function apiMe() {
  return api<ApiSession>('/auth/me');
}

/* ---------------- reads ---------------- */

/**
 * Roles whose session actually passes the `/vendors`, `/contracts` and `/audit` guards. It is a
 * fetch plan, not a permission: a role missing here is a role the server would refuse anyway.
 *
 * JMC_APPROVER is deliberately ABSENT (request 19ب). Its @Roles lists name only the two ratify
 * rows, so those three calls would each 403 — and each refusal is audited ROLE_REFUSED, which
 * would write three spurious refusal rows into the trail on every page load by a body that has
 * no such right and never claimed one. Add it here the day a decorator actually grants it.
 */
const ADMIN_ROLES = ['SUPER_ADMIN', 'MDOC_ADMIN', 'AUDITOR', 'EVALUATION'];

/** store guarantee kinds → the API's uppercase enum (Prisma GuaranteeKind). */
const GUARANTEE_KIND_API: Record<'bid-bond' | 'performance' | 'advance', string> = {
  'bid-bond': 'BID_BOND',
  performance: 'PERFORMANCE',
  advance: 'ADVANCE',
};

/** Fetch and assemble the full client State. Registries are admin-only, so an
 *  operator session simply gets empty arrays for them (handled by 403 → []). */
export async function loadFullState(role: string): Promise<State> {
  const isAdmin = ADMIN_ROLES.includes(role);
  // /api/users carries a class-level @Roles('SUPER_ADMIN'); anything else 403s → []
  const isSuper = role === 'SUPER_ADMIN';
  const [tenders, vendors, contracts, audit, users, holidays] = await Promise.all([
    api<ApiTender[]>('/tenders'),
    isAdmin ? api<ApiVendor[]>('/vendors').catch((e) => empty<ApiVendor>(e)) : Promise.resolve<ApiVendor[]>([]),
    isAdmin ? api<ApiContract[]>('/contracts').catch((e) => empty<ApiContract>(e)) : Promise.resolve<ApiContract[]>([]),
    isAdmin ? api<ApiAudit[]>('/audit').catch((e) => empty<ApiAudit>(e)) : Promise.resolve<ApiAudit[]>([]),
    isSuper ? api<ApiUser[]>('/users').catch((e) => empty<ApiUser>(e)) : Promise.resolve<ApiUser[]>([]),
    // open endpoint — every role reads it so the client calendar matches the server's (calendar.service),
    // else the pre-submit late check in the bidder dialog would judge against a stale/empty calendar
    api<{ date: string; name: string }[]>('/holidays').catch((e) => empty<{ date: string; name: string }>(e)),
  ]);
  return {
    tenders: tenders.map(mapTender),
    vendors: vendors.map(mapVendor),
    contracts: contracts.map(mapContract),
    audit: [...audit].reverse().map(mapAudit), // store keeps oldest-first; API returns newest-first
    seq: 0,
    users: users.map(mapUser),
    // there is no /operators, /fields or /service-contracts read wired yet — empty in api mode
    operators: [],
    fields: [],
    serviceContracts: [],
    // NAMED DEBT: the approval ladder (ق1) is global configuration with no server model yet, so
    // both modes read the same single constant. When a /config route exists this reads it instead;
    // until then this is the configuration of record, not a per-mode guess.
    approvalTiers: SEED_APPROVAL_TIERS,
    holidays: holidays.map((h) => ({ date: h.date.slice(0, 10), ...(h.name ? { name: h.name } : {}) })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function empty<T>(e: unknown): T[] {
  if (e instanceof ApiError && (e.status === 403 || e.status === 401)) return [];
  throw e;
}

async function refreshTender(id: string): Promise<Tender> {
  return mapTender(await api<ApiTender>(`/tenders/${id}`));
}

/**
 * Route a store action to its API endpoint and return the affected tender(s).
 * Mirrors the server guards 1:1 — a refused mutation throws ApiError.
 */
export async function runAction(action: Action): Promise<{ tender?: Tender; reload?: boolean }> {
  switch (action.type) {
    case 'CREATE_TENDER':
      await api('/tenders', {
        method: 'POST',
        body: {
          titleAr: action.title.ar,
          titleEn: action.title.en,
          budgetCode: action.budgetCode,
          // the field is REQUIRED by CreateTenderDto — it decides the Financial Authority (§7.1),
          // and the server gates it against the caller's operating scope. Omitting it 400s.
          fieldId: action.fieldId,
          // §9 work scope — drives the C8.1/C8.2 requirement; omitted (undefined) reads as OTHER
          scope: action.scope,
          estimatedValueUSD: action.estimatedValueUSD,
          methodIdOverride: action.methodId,
          overrideJustification: action.overrideJustification,
          stagePlan: action.stageDates
            ? Object.entries(action.stageDates).map(([key, d]) => ({ key, plannedFrom: d.plannedFrom, plannedTo: d.plannedTo }))
            : undefined,
        },
      });
      return { reload: true };
    case 'PLAN_STAGE':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/plan`, { method: 'PATCH', body: { stageKey: action.stageKey, plannedFrom: action.plannedFrom, plannedTo: action.plannedTo } })) };
    case 'SET_ANNOUNCEMENT':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/announcement`, { method: 'PATCH', body: action.patch })) };
    case 'PUBLISH_ANNOUNCEMENT':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/publish`, { method: 'POST' })) };
    case 'SET_EVAL_STEP':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/eval-step`, { method: 'PATCH', body: { step: action.step } })) };
    case 'ADD_BIDDER':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/bidders`, { method: 'POST', body: { name: action.name, ...(action.submittedAt ? { submittedAt: action.submittedAt } : {}) } })) };
    case 'SET_TECHNICAL':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/technical`, { method: 'PATCH', body: { bidderId: action.bidderId, result: action.result } })) };
    case 'SET_PRICE':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/price`, { method: 'POST', body: { bidderId: action.bidderId, priceUSD: action.priceUSD } })) };
    case 'TOGGLE_DOC':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/document`, { method: 'PATCH', body: { stageKey: action.stageKey, doc: action.doc } })) };
    case 'COMPLETE_STAGE':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/complete-stage`, { method: 'POST', body: { stageKey: action.stageKey, actualTo: action.actualTo } })) };
    // The actor's immutable oid rides along on every governance call (whitelisted by the
    // DTOs). The server persists the JWT principal as the authoritative identity; the oid is
    // an audit-correlation hint, never trusted for attribution.
    case 'RATIFY':
      await api(`/tenders/${action.tenderId}/ratify`, { method: 'POST', body: { byOid: action.by.oid } });
      return { tender: await refreshTender(action.tenderId) };
    case 'RETURN_WITH_NOTES':
      await api(`/tenders/${action.tenderId}/return`, { method: 'POST', body: { notes: action.notes, byOid: action.by.oid } });
      return { tender: await refreshTender(action.tenderId) };
    case 'CANCEL_TENDER':
      await api(`/tenders/${action.tenderId}/cancel`, { method: 'POST', body: { justification: action.reason, byOid: action.by.oid } });
      return { tender: await refreshTender(action.tenderId) };
    case 'SUSPEND_TENDER':
      await api(`/tenders/${action.tenderId}/suspend`, { method: 'POST', body: { justification: action.reason, byOid: action.by.oid } });
      return { tender: await refreshTender(action.tenderId) };
    case 'RESUME_TENDER':
      await api(`/tenders/${action.tenderId}/resume`, { method: 'POST', body: { justification: action.reason, byOid: action.by.oid } });
      return { tender: await refreshTender(action.tenderId) };
    case 'SUSPEND_VENDOR':
      await api(`/vendors/${action.vendorId}/suspend`, { method: 'POST', body: { reason: action.reason } });
      return { reload: true };
    case 'LIFT_VENDOR':
      await api(`/vendors/${action.vendorId}/lift-suspension`, { method: 'POST', body: { reason: action.reason } });
      return { reload: true };
    case 'BAN_VENDOR':
      await api(`/vendors/${action.vendorId}/ban`, { method: 'POST', body: { banUntil: action.banUntil, reason: action.reason } });
      return { reload: true };
    case 'SET_VENDOR_SCORES':
      await api(`/vendors/${action.vendorId}/scores`, { method: 'PATCH', body: { techScore: action.techScore, financialScore: action.financialScore, hseScore: action.hseScore, reason: action.reason } });
      return { reload: true };
    case 'ADD_VO':
      await api(`/contracts/${action.contractId}/variation-orders`, { method: 'POST', body: { valueUSD: action.valueUSD, approvedOn: action.approvedOn } });
      return { reload: true };
    case 'ADD_EXTENSION':
      await api(`/contracts/${action.contractId}/extensions`, { method: 'POST', body: { days: action.days, approvedOn: action.approvedOn } });
      return { reload: true };
    case 'ADD_LD':
      await api(`/contracts/${action.contractId}/liquidated-damages`, { method: 'POST', body: { valueUSD: action.valueUSD, appliedOn: action.appliedOn } });
      return { reload: true };
    case 'ADD_GUARANTEE':
      await api(`/contracts/${action.contractId}/guarantees`, { method: 'POST', body: { kind: GUARANTEE_KIND_API[action.kind], valueUSD: action.valueUSD, expiresOn: action.expiresOn } });
      return { reload: true };
    // §9 C8.1 — the clause attestation the publish gate reads. Server-modeled like its C8.2
    // sibling: the reducer's three guards (applies / not-yet-published / no-op) are enforced
    // again there, so API mode cannot record an attestation local mode would have refused.
    case 'SET_LC_CLAUSE':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/local-content-clause`, { method: 'PATCH', body: { affixed: action.affixed, byOid: action.by.oid } })) };
    case 'SET_STATE_RESPONSE':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/state-response`, { method: 'POST', body: { company: action.company, status: action.status, reason: action.reason } })) };
    case 'SET_BIDDER_MATERIALS':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/bidders/${action.bidderId}/materials`, { method: 'PATCH', body: { materials: action.materials } })) };
    case 'ADD_HOLIDAY': {
      const date = action.date.slice(0, 10);
      await api('/holidays', { method: 'POST', body: { date, name: action.name?.trim() || date, reason: action.reason } });
      return { reload: true }; // re-hydrate so the new holiday enters the client calendar
    }
    case 'REMOVE_HOLIDAY':
      await api(`/holidays/${action.date.slice(0, 10)}?reason=${encodeURIComponent(action.reason)}`, { method: 'DELETE' });
      return { reload: true };
    default:
      // fail LOUD, never silent: with LOCAL_ONLY decoupled from NON_AUDITED, an action forgotten from
      // both sets would otherwise reach here and resolve ok:true having done nothing (the truthful-
      // channel would lie). Throwing routes it through the dispatch catch → { ok:false, error }.
      throw new Error(`no-route:${(action as { type: string }).type}`);
  }
}

export function tenderIdOf(action: Action): string | undefined {
  return 'tenderId' in action ? action.tenderId : undefined;
}
