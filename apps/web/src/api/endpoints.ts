import { api, ApiError } from './client';
import { mapAudit, mapContract, mapTender, mapVendor } from './mappers';
import type { ApiAudit, ApiContract, ApiSession, ApiTender, ApiVendor } from './types';
import type { Action, State, Tender } from '../store';

/* ---------------- auth ---------------- */

export function apiLogin(role: 'OPERATOR_ADMIN' | 'ROC_ADMIN', otp: string) {
  return api<ApiSession>('/auth/login', { method: 'POST', body: { role, otp } });
}
export function apiLogout() {
  return api<{ ok: true }>('/auth/logout', { method: 'POST' });
}
export function apiMe() {
  return api<ApiSession>('/auth/me');
}

/* ---------------- reads ---------------- */

const ADMIN_ROLES = ['SUPER_ADMIN', 'ROC_ADMIN', 'AUDITOR', 'EVALUATION'];

/** Fetch and assemble the full client State. Registries are admin-only, so an
 *  operator session simply gets empty arrays for them (handled by 403 → []). */
export async function loadFullState(role: string): Promise<State> {
  const isAdmin = ADMIN_ROLES.includes(role);
  const [tenders, vendors, contracts, audit] = await Promise.all([
    api<ApiTender[]>('/tenders'),
    isAdmin ? api<ApiVendor[]>('/vendors').catch((e) => empty<ApiVendor>(e)) : Promise.resolve<ApiVendor[]>([]),
    isAdmin ? api<ApiContract[]>('/contracts').catch((e) => empty<ApiContract>(e)) : Promise.resolve<ApiContract[]>([]),
    isAdmin ? api<ApiAudit[]>('/audit').catch((e) => empty<ApiAudit>(e)) : Promise.resolve<ApiAudit[]>([]),
  ]);
  return {
    tenders: tenders.map(mapTender),
    vendors: vendors.map(mapVendor),
    contracts: contracts.map(mapContract),
    audit: [...audit].reverse().map(mapAudit), // store keeps oldest-first; API returns newest-first
    seq: 0,
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
          estimatedValueUSD: action.estimatedValueUSD,
          methodIdOverride: action.methodId,
          overrideJustification: action.overrideJustification,
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
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/bidders`, { method: 'POST', body: { name: action.name } })) };
    case 'SET_TECHNICAL':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/technical`, { method: 'PATCH', body: { bidderId: action.bidderId, result: action.result } })) };
    case 'SET_PRICE':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/price`, { method: 'POST', body: { bidderId: action.bidderId, priceUSD: action.priceUSD } })) };
    case 'TOGGLE_DOC':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/document`, { method: 'PATCH', body: { stageKey: action.stageKey, doc: action.doc } })) };
    case 'COMPLETE_STAGE':
      return { tender: mapTender(await api<ApiTender>(`/tenders/${action.tenderId}/complete-stage`, { method: 'POST', body: { stageKey: action.stageKey, actualTo: action.actualTo } })) };
    case 'RATIFY':
      await api(`/tenders/${action.tenderId}/ratify`, { method: 'POST' });
      return { tender: await refreshTender(action.tenderId) };
    case 'RETURN_WITH_NOTES':
      await api(`/tenders/${action.tenderId}/return`, { method: 'POST', body: { notes: action.notes } });
      return { tender: await refreshTender(action.tenderId) };
    default:
      return {};
  }
}

export function tenderIdOf(action: Action): string | undefined {
  return 'tenderId' in action ? action.tenderId : undefined;
}
