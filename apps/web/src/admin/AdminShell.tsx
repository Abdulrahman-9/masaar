import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NoticeBell } from '../NoticeBell';
import { fmtCount } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { loadSession } from '../session';
import { useRegisterDispatchFail, useStore } from '../store';
import { ToastViewport, useToasts, type ToastOpts } from '../Toasts';
import { roleKey } from './access';
import { approvalChain, awaitingTier, decisionQueue } from './adminDerive';
import './admin.css';

export type AdminView =
  | 'room' | 'tenders' | 'contracts' | 'entities' | 'reports'
  // 'users' is now the WHOLE access section («الوصول والأدوار») — the retired 'roles' view is a
  // tab of it (client request 20), so `#/admin/roles` redirects instead of rendering its own screen
  | 'users' | 'operators' | 'fields' | 'holidays'
  // 'approvals' replaces the retired 'mct' view (client ق3) — the engine stays, the screen does not
  // 'schedule' (request 10) is the TIME-compliance registry; 'compliance' remains the §9 local
  // content + §12.2 nominations screen — two subjects that shared one word, never one screen
  | 'approvals' | 'schedule' | 'compliance' | 'paths' | 'audit' | 'review';

interface AdminUi { toast: (msg: string, opts?: ToastOpts) => void; }
const AdminUiContext = createContext<AdminUi | null>(null);
export function useAdminUi(): AdminUi {
  const ctx = useContext(AdminUiContext);
  if (!ctx) throw new Error('useAdminUi outside AdminShell');
  return ctx;
}

type NavCount = 'decisions' | 'tenders' | 'approvals' | 'contracts' | 'accounts';
interface NavItem { view: AdminView; hash: string; icon: string; counted?: NavCount }

/**
 * PRIMARY — the five destinations of the daily job, always visible (spec §4-أ).
 *
 * The order is the lifecycle order a request travels: it is raised (tenders), it climbs the
 * ladder (approvals), it becomes a contract, and companies are the register all three refer to.
 * «المتابعة» sits on top because it is where a manager starts the morning.
 *
 * «سلسلة الموافقات» is promoted OUT of the tool drawer: after ق1/ق3 it is a daily destination,
 * not a reference table. «التقارير» and «الوصول والمستخدمون» move the other way — printing and
 * account administration are periodic work, not the work of the day (§4-أ).
 */
const PRIMARY: NavItem[] = [
  { view: 'room', hash: '#/admin', icon: 'layers', counted: 'decisions' },
  { view: 'tenders', hash: '#/admin/tenders', icon: 'list', counted: 'tenders' },
  { view: 'approvals', hash: '#/admin/approvals', icon: 'check', counted: 'approvals' },
  { view: 'contracts', hash: '#/admin/contracts', icon: 'doc', counted: 'contracts' },
  // entities are companies, not people — the people glyph belongs to the access registry
  { view: 'entities', hash: '#/admin/entities', icon: 'building' },
];

/**
 * SECONDARY — «أدوات ومراجع»: printing, registers and evidence. Nine items, so it is a real
 * disclosure (the ≥3 rule in §4-ب); the operator shell, with one, stays a flat label.
 *
 * «الأدوار والصلاحيات» is deliberately absent: it is a TAB of the access section now, and a
 * second sidebar entry landing on the same page would re-create the three-places-one-question
 * problem the merge exists to end.
 */
const SECONDARY: NavItem[] = [
  { view: 'reports', hash: '#/admin/reports', icon: 'chart' },
  // schedule sits directly above §9 compliance: the two answer «هل التزمنا؟» about different
  // things (time / local content), and the adjacency is what makes the difference readable
  { view: 'schedule', hash: '#/admin/schedule', icon: 'clock' },
  { view: 'compliance', hash: '#/admin/compliance', icon: 'shield' },
  { view: 'operators', hash: '#/admin/operators', icon: 'building' },
  { view: 'fields', hash: '#/admin/fields', icon: 'layers' },
  { view: 'holidays', hash: '#/admin/holidays', icon: 'calendar' },
  { view: 'users', hash: '#/admin/users', icon: 'users', counted: 'accounts' },
  { view: 'paths', hash: '#/admin/paths', icon: 'chart' },
  { view: 'audit', hash: '#/admin/audit', icon: 'doc' },
];

/**
 * The disclosure's remembered state. Namespaced OUTSIDE the business store key
 * (`masaar-operator-v11`): a chrome preference must never travel with, or be wiped by, a data
 * migration. '1' open · '0' (or absent) collapsed — collapsed is the default, which is the whole
 * point of a secondary group.
 */
export const NAV_SEC_KEY = 'masaar.nav.sec';

function readSecPref(): boolean {
  try {
    return localStorage.getItem(NAV_SEC_KEY) === '1';
  } catch {
    return false; // private mode / disabled storage — the drawer still works, it just forgets
  }
}
function writeSecPref(open: boolean): void {
  try {
    localStorage.setItem(NAV_SEC_KEY, open ? '1' : '0');
  } catch {
    /* a preference that cannot be stored is not an error worth interrupting anybody for */
  }
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('');
}

export default function AdminShell({ view, onLogout, children }: { view: AdminView; onLogout: () => void; children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const isAr = lang === 'ar';
  const { state } = useStore();
  const session = loadSession();
  const { toast } = useToasts();
  useRegisterDispatchFail((error) => toast(t('toastv2.dispatchFail'), { kind: 'error', desc: error }));

  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const ui = useMemo<AdminUi>(() => ({ toast }), [toast]);

  // one definition, shared with the follow-up room's tile and the `?pending=1` registry it opens
  const decisions = decisionQueue(state).length;
  /**
   * «سلسلة الموافقات» badges the OUTSTANDING SIGNATURES, not the size of the chain: the same
   * `awaitingTier` predicate the room's two ladder tiles and the approvals screen's own KPI strip
   * call, so no two surfaces can disagree about how many decisions are owed.
   */
  const chain = approvalChain(state);
  const approvals = awaitingTier(chain, 'JMC').length + awaitingTier(chain, 'MDOC').length;
  const counts: Record<NavCount, number> = {
    decisions,
    tenders: state.tenders.length,
    approvals,
    contracts: state.contracts.length,
    accounts: state.users.filter((u) => !u.disabled).length,
  };

  /**
   * The secondary group. Two inputs, deliberately kept apart:
   *   · `secPref` — what the reader chose, persisted.
   *   · `activeInSecondary` — a forced open, so a deep link (`#/admin/audit`) can never land on a
   *     highlighted item that is not on screen.
   * The forced open is NOT written back: leaving the section restores the reader's own choice.
   */
  const [secPref, setSecPref] = useState(readSecPref);
  const activeInSecondary = SECONDARY.some((n) => n.view === view);
  const secOpen = secPref || activeInSecondary;
  /**
   * While a secondary destination is the current page the group CANNOT be collapsed — collapsing
   * it would hide the page the reader is on. That makes the disclosure genuinely unavailable
   * there, and it has to SAY so: a button that reports `aria-expanded="true"` and then does
   * nothing when activated is a lie told to exactly the reader who cannot see the caret. It also
   * used to compute `!secOpen`, i.e. always `false` on such a page, so every click wrote
   * `masaar.nav.sec = '0'` — the stored preference could only ever be destroyed there, never
   * restored. The toggle now reads and writes the PREFERENCE, and is inert only where it is
   * announced as inert.
   */
  const secForced = activeInSecondary;
  const toggleSec = () => {
    if (secForced) return;
    const next = !secPref;
    setSecPref(next);
    writeSecPref(next);
  };
  // collapsing must never hide an alarm: the header carries the sum of what it folded away
  const hiddenCount = SECONDARY.reduce((n, i) => n + (i.counted ? counts[i.counted] : 0), 0);

  const qn = q.trim().toLowerCase();
  type Result = { kind: 'tender' | 'contract' | 'entity'; name: string; code: string; hash: string };
  const results: Result[] = qn.length < 2 ? [] : [
    ...state.tenders.filter((x) => (x.title[lang] + ' ' + x.code).toLowerCase().includes(qn)).map((x): Result => ({ kind: 'tender', name: x.title[lang], code: x.code, hash: `#/admin/review/${x.id}` })),
    // deep-link to the record itself (the profile routes exist in App.tsx) — landing on the
    // bare registry would drop the search the operator just made
    ...state.contracts.filter((c) => (c.title[lang] + ' ' + c.code).toLowerCase().includes(qn)).map((c): Result => ({ kind: 'contract', name: c.title[lang], code: c.code, hash: `#/admin/contracts/${c.id}` })),
    ...state.vendors.filter((v) => v.name.toLowerCase().includes(qn)).map((v): Result => ({ kind: 'entity', name: v.name, code: v.id.toUpperCase(), hash: `#/admin/entities/${v.id}` })),
  ].slice(0, 6);

  useEffect(() => {
    if (!menuOpen && qn.length < 2) return;
    const onDown = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setQ('');
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen, qn.length]);

  const crumb = t(`adnav.${view === 'review' ? 'review' : view}`);

  return (
    <AdminUiContext.Provider value={ui}>
      <div className="op-shell" dir={isAr ? 'rtl' : 'ltr'}>
        <aside className="op-side ad-side">
          <div className="ad-side__logo">
            <img src="/logo-on-dark.svg" alt={t('app.title')} onError={(e) => { (e.target as HTMLImageElement).src = '/logo.svg'; }} />
            <span className="ad-side__badge">{t('adnav.badge')}</span>
          </div>
          <nav className="ad-nav" aria-label={t('adnav.navLabel')}>
            {PRIMARY.map((n) => {
              const on = n.view === view || (n.view === 'tenders' && view === 'review');
              return (
                <a
                  key={n.view}
                  href={n.hash}
                  className={`ad-nav__btn${on ? ' ad-nav__btn--on' : ''}`}
                  aria-current={on ? 'page' : undefined}
                >
                  <Icon name={n.icon} size={17} /><span>{t(`adnav.${n.view}`)}</span>
                  {n.counted && <span className="ad-nav__count">{fmtCount(counts[n.counted], lang)}</span>}
                </a>
              );
            })}

            {/* The disclosure. `hidden` is the attribute — a screen reader understands it, whereas
                a bare `display: none` is invisible to the accessibility tree's own bookkeeping;
                `aria-controls` names the container it governs. Only the caret animates: growing a
                block-size costs a layout pass per frame and fights `hidden` besides (§4-ج). */}
            <button
              type="button"
              className="ad-nav__disc"
              aria-expanded={secOpen}
              aria-controls="ad-nav-secondary"
              aria-disabled={secForced || undefined}
              onClick={toggleSec}
            >
              <Icon name="chevronStart" size={14} strokeWidth={2} className="ad-nav__caret" />
              <span>{t('adnav.tools')}</span>
              {!secOpen && hiddenCount > 0 && (
                <span className="ad-nav__count">{fmtCount(hiddenCount, lang)}</span>
              )}
            </button>

            <div id="ad-nav-secondary" className="ad-nav__sec" hidden={!secOpen}>
              {SECONDARY.map((n) => {
                const on = n.view === view;
                return (
                  <a
                    key={n.view}
                    href={n.hash}
                    className={`ad-nav__btn${on ? ' ad-nav__btn--on' : ''}`}
                    aria-current={on ? 'page' : undefined}
                  >
                    <Icon name={n.icon} size={17} /><span>{t(`adnav.${n.view}`)}</span>
                    {n.counted && <span className="ad-nav__count">{fmtCount(counts[n.counted], lang)}</span>}
                  </a>
                );
              })}
            </div>
          </nav>
          <div className="ad-side__sup">
            <div className="ad-side__sup-l">{t('adnav.supLabel')}</div>
            <div className="ad-side__sup-n">{t('adnav.supName')}</div>
            <div className="ad-side__sup-r">SCPP Rev 1.0 · Jan 2026</div>
          </div>
          <div className="ad-side__credit">
            <div className="ad-side__credit-l">{t('shell.creditLabel')}</div>
            <div className="ad-side__credit-n">{t('shell.creditName')}</div>
          </div>
        </aside>

        <main className="op-main">
          <header className="op-topbar">
            <div className="op-crumb">
              <span>{t('admin.title')}</span>
              <span className="op-crumb__sep">/</span>
              <span className="op-crumb__b">{crumb}</span>
            </div>

            <div className="op-search" ref={searchRef} style={{ width: 300 }}>
              <input className="op-search__in" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('adnav.searchPh')} aria-label={t('adnav.searchPh')} />
              <span className="op-search__icon"><Icon name="search" size={14} strokeWidth={2} /></span>
              {qn.length >= 2 && (
                <div className="op-panel op-search__panel">
                  {results.length === 0 ? <div className="op-panel__empty">{t('shell.noResults', { q })}</div> : results.map((r, i) => (
                    <button key={i} className="op-result" onClick={() => { setQ(''); window.location.hash = r.hash; }}>
                      <span className={`ad-searchchip ad-searchchip--${r.kind}`}>{t(`adnav.kind_${r.kind}`)}</span>
                      <span className="op-result__main">
                        <span className="op-result__name">{r.name}</span>
                        <span className="op-result__sub"><span className="op-code">{r.code}</span></span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="op-top-actions">
              <button className="op-langbtn" onClick={() => void i18n.changeLanguage(isAr ? 'en' : 'ar')}>{t('app.switchLang')}</button>
              <NoticeBell portal="admin" />
              <div className="op-notif" ref={menuRef}>
                <button className="op-avatar ad-avatar" title={session?.name ?? t('login.signOut')} aria-label={session?.name ?? t('login.signOut')} onClick={() => setMenuOpen((o) => !o)}>{initials(session?.name ?? '—')}</button>
                {menuOpen && (
                  <div className="op-panel op-menu">
                    <div className="op-menu__head">
                      <div className="op-menu__name">{session?.name}</div>
                      <div className="op-menu__role">{session ? t(`roles.names.${roleKey(session.role)}`) : '—'}</div>
                    </div>
                    <button className="op-menu__out" onClick={onLogout}>{t('login.signOut')}</button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {children}
        </main>

        <ToastViewport />
      </div>
    </AdminUiContext.Provider>
  );
}
