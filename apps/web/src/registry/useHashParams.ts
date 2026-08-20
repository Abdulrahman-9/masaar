import { useEffect, useState } from 'react';
import type { ContractStageKey } from '../store';

/**
 * Registry layer — the URL contract every clickable statistic lands through
 * (ops/VISUAL-REFRESH-SPEC.md §5-ج).
 *
 * THE BUG THIS EXISTS TO KILL: `Fields.tsx` read `?op=` with `useState(opParam())` — once, at
 * mount. A link that changes only the query string changes the hash without remounting the
 * screen, so the filter never moved. Every KPI tile, chart row, donut legend entry and
 * histogram column in this wave lands on a registry that is often the screen the reader is
 * already on, which turns that latent defect into a daily one. The fix is a hook: the params
 * are STATE, re-read on every `hashchange`.
 *
 * The router needs no change — `App.tsx` already matches `^#\/admin\/(\w+)(?:\?.*)?$`.
 */

function read(): URLSearchParams {
  const q = window.location.hash.split('?')[1];
  return new URLSearchParams(q ?? '');
}

/** The query string of the current hash, re-synced on every `hashchange`. */
export function useHashParams(): URLSearchParams {
  const [p, setP] = useState(read);
  useEffect(() => {
    const on = () => setP(read());
    window.addEventListener('hashchange', on);
    // the hash can also move between render and effect-attach (a link clicked during mount)
    setP(read());
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return p;
}

/* ---------------- the whitelist ---------------- */

/**
 * The seven accepted parameter names (§5-ج). A name outside this set is not read at all, and a
 * value outside its set is IGNORED — silently, with the full registry shown. A tampered or stale
 * link must never produce an error screen or an empty one: «nothing matches» and «nothing exists»
 * are different sentences, and only one of them is true.
 */
export type HashParamName = 'op' | 'tier' | 'status' | 'prog' | 'pending' | 'stage' | 'field';

/** The four completion buckets, cut once (§3-د) — the histogram and the registry share them. */
export const PROGRESS_BUCKETS = ['0-25', '25-50', '50-75', '75-100'] as const;
export type ProgressBucket = (typeof PROGRESS_BUCKETS)[number];

/**
 * Contract stage keys as a runtime list. The TYPE is imported so a future stage added to the
 * union fails this file at compile time instead of silently dropping out of the whitelist —
 * a type-only import, so the registry layer takes on no runtime dependency on the store.
 */
const CONTRACT_STAGE_KEYS: readonly ContractStageKey[] = [
  'sign', 'bonds', 'mobilize', 'execute', 'provisional', 'warranty', 'final',
];

/**
 * `status=open` is an addition to the spec's four-value set, and it is here for an honesty
 * reason: the follow-up room's «المناقصات المفتوحة» tile counts every tender that still has an
 * open stage, which is progress + risk + delayed together. Landing it on `?status=progress`
 * (as §5-ب suggests) would show a registry SMALLER than the number the reader just clicked.
 * The tile and its destination must count the same rows, so the vocabulary gained the word the
 * tile actually means.
 */
const FIXED: Partial<Record<HashParamName, readonly string[]>> = {
  tier: ['OPERATOR', 'JMC', 'MDOC'],
  status: ['open', 'progress', 'risk', 'delayed', 'done'],
  prog: PROGRESS_BUCKETS,
  pending: ['1'],
  stage: CONTRACT_STAGE_KEYS,
};

/**
 * One validated parameter, or `''` when it is absent or unacceptable.
 *
 * `op` and `field` are record IDs — their allowed set is the live store, so the caller passes it
 * (`allowed`). Without a set they resolve to `''`: an id we cannot vouch for filters nothing,
 * which is the same fail-open reading the fixed vocabularies get. Everything else is checked
 * against the closed list above and `allowed` is ignored.
 */
export function hashParam(p: URLSearchParams, name: HashParamName, allowed?: readonly string[]): string {
  const raw = p.get(name);
  if (!raw) return '';
  const set = FIXED[name] ?? allowed;
  if (!set) return '';
  return set.includes(raw) ? raw : '';
}

/**
 * Rewrite ONE parameter on the current hash, keeping the path and every other parameter.
 * `null`/`''` removes it. This is what a removable filter chip calls, so the address bar never
 * disagrees with the screen and stays shareable (§5-ج).
 */
export function writeHashParam(name: HashParamName, value: string | null): void {
  const hash = window.location.hash;
  const cut = hash.indexOf('?');
  const path = cut === -1 ? hash : hash.slice(0, cut);
  const p = new URLSearchParams(cut === -1 ? '' : hash.slice(cut + 1));
  if (value) p.set(name, value); else p.delete(name);
  const q = p.toString();
  window.location.hash = q ? `${path}?${q}` : path;
}
