import { serviceContractEffective } from '@masaar/scpp-rules';
import { loadSession } from './session';
import type { State } from './store';

/**
 * Who the signed-in operator actually works for — resolved from the registries, never named
 * by a literal. The shell chrome and the printed reports all read this one function, so the
 * company on a printed A4 report is the same record the sidebar shows.
 *
 * Every field is optional on purpose: an identity that cannot be resolved is OMITTED at the
 * call site, because a plausible-looking company name is exactly the fabrication this replaces.
 */
export interface SessionOrg {
  /** the resolved operating company (display name in the active language) */
  name?: string;
  /** reference chip for the company's Service Contract: '<code> · <signed>–<expiry>' (§7.1) */
  contractRef?: string;
}

/**
 * Resolution chain, most authoritative first:
 *   1. session.oid → the account in `state.users` → its `operatorId` → `state.operators`.
 *      This is the registry truth: the operator scope an admin actually granted the account.
 *   2. session.companyId → `state.operators` — same registry, keyed by the scope the session
 *      itself carries (used when the account list is not readable, e.g. a non-SUPER_ADMIN in
 *      API mode, where `/users` 403s and `state.users` is empty by design).
 *   3. session.company — the scope label the session was minted with. Still session data, not
 *      an invented name; it is Arabic-only, so the registry above is always preferred.
 * Nothing resolves → `{}`, and the chrome drops the row entirely.
 */
export function resolveSessionOrg(state: State, lang: 'ar' | 'en'): SessionOrg {
  const session = loadSession();
  if (!session) return {};

  const account = state.users.find((u) => u.azureOid === session.oid);
  const operatorId = account?.operatorId ?? session.companyId;
  const name = operatorName(state, operatorId, lang) ?? session.company;
  return { ...(name ? { name } : {}), ...(operatorId ? contractRefOf(state, operatorId) : {}) };
}

/** An operating company's display name straight from the registry — undefined when unknown.
 *  Used where the company is a property of the RECORD (a tender's operator) rather than of
 *  the session, so a document names the company that owns it, not whoever printed it. */
export function operatorName(state: State, operatorId: string | undefined, lang: 'ar' | 'en'): string | undefined {
  const o = operatorId ? state.operators.find((x) => x.id === operatorId) : undefined;
  if (!o) return undefined;
  return lang === 'ar' ? o.name : o.nameEn ?? o.name;
}

/**
 * The company's Service Contract reference (§7.1) — its code plus the term it runs, both read
 * off the contract row (the term is DERIVED from signedOn/expiresOn, never stored, C2). The
 * operator's fields are scanned in registry order and the first EFFECTIVE contract wins; the
 * code itself carries the field ('SC-RU-24'), so the chip says which contract it is. An
 * operator with no effective contract gets no chip rather than an expired or invented one.
 */
function contractRefOf(state: State, operatorId: string): { contractRef?: string } {
  for (const field of state.fields.filter((f) => f.operatorId === operatorId)) {
    const c = state.serviceContracts.find((sc) => sc.fieldId === field.id);
    if (c && serviceContractEffective(c)) {
      return { contractRef: `${c.code} · ${c.signedOn.slice(0, 4)}–${c.expiresOn.slice(0, 4)}` };
    }
  }
  return {};
}
