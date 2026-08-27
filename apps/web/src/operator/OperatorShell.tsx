import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { roleKey } from '../admin/access';
import { NoticeBell } from '../NoticeBell';
import { resolveSessionOrg } from '../orgIdentity';
import { loadSession } from '../session';
import { calendarOf, todayIso, useRegisterDispatchFail, useStore, type Tender } from '../store';
import ThemeToggle from '../ThemeToggle';
import { ToastViewport, useToasts, type ToastOpts } from '../Toasts';
import { deriveTasks } from './derive';
import { Icon } from './Icon';
import QuickLook from './QuickLook';
import './operator.css';

export type OpView = 'inbox' | 'tenders' | 'file' | 'request' | 'reports';

interface OperatorUi {
  toast: (msg: string, opts?: ToastOpts) => void;
  openQuickLook: (tenderId: string) => void;
}
const OperatorUiContext = createContext<OperatorUi | null>(null);
export function useOperatorUi(): OperatorUi {
  const ctx = useContext(OperatorUiContext);
  if (!ctx) throw new Error('useOperatorUi outside OperatorShell');
  return ctx;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('');
}

interface OpNavItem { view: OpView; hash: string; icon: string; key: string; counted?: 'tasks' | 'tenders' }

/** The daily job: what is owed today, the register it is owed against, and raising a new one. */
const PRIMARY: OpNavItem[] = [
  { view: 'inbox', hash: '#/operator', icon: 'inbox', key: 'inbox', counted: 'tasks' },
  { view: 'tenders', hash: '#/operator/tenders', icon: 'list', key: 'tenders', counted: 'tenders' },
  { view: 'request', hash: '#/operator/new', icon: 'plus', key: 'request' },
];

/**
 * «أدوات ومراجع» — printing is periodic, not daily, so it separates from the three above.
 *
 * It stays a FLAT static label, not a disclosure: the rule in spec §4-ب is that a disclosure is
 * emitted only at three or more secondary items. Below that a collapsible group costs a reader a
 * click and a caret to hide one row, which is chrome pretending to be organisation. The admin
 * shell has nine and therefore gets the real disclosure.
 */
const SECONDARY: OpNavItem[] = [
  { view: 'reports', hash: '#/operator/reports', icon: 'chart', key: 'reports' },
];

function go(hash: string) {
  window.location.hash = hash;
}

export default function OperatorShell({
  view,
  tenderId,
  onLogout,
  children,
}: {
  view: OpView;
  tenderId?: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const isAr = lang === 'ar';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);

  const session = loadSession();
  // the operating company + its Service Contract, resolved from the registries (never a literal);
  // each part is dropped from the chrome when it cannot be resolved
  const org = resolveSessionOrg(state, lang);
  const { toast } = useToasts();
  useRegisterDispatchFail((error) => toast(t('toastv2.dispatchFail'), { kind: 'error', desc: error }));
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickId, setQuickId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const ui = useMemo<OperatorUi>(
    () => ({
      toast,
      openQuickLook: (id: string) => setQuickId(id),
    }),
    [toast],
  );

  const tasks = deriveTasks(state, today, cal);
  const counts = { tasks: tasks.length, tenders: state.tenders.length };

  // live search (≥ 2 chars) across name + code → jump to the file
  const qn = q.trim().toLowerCase();
  const results: Tender[] =
    qn.length < 2 ? [] : state.tenders.filter((x) => (x.title[lang] + ' ' + x.code).toLowerCase().includes(qn)).slice(0, 5);

  // close the open panels when clicking outside them
  useEffect(() => {
    if (!menuOpen && qn.length < 2) return;
    const onDown = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setQ('');
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen, qn.length]);

  const crumbTender = tenderId ? state.tenders.find((x) => x.id === tenderId) : undefined;
  const viewLabel = t(`onav.${view === 'file' ? 'tenders' : view}`);

  return (
    <OperatorUiContext.Provider value={ui}>
      <div className="op-shell" dir={isAr ? 'rtl' : 'ltr'}>
        {/* ---------- Sidebar ---------- */}
        <aside className="op-side">
          <div className="op-side__logo">
            <img src="/logo-on-dark.svg" alt={t('app.title')} onError={(e) => { (e.target as HTMLImageElement).src = '/logo.svg'; }} />
          </div>
          <nav className="op-nav" aria-label={t('onav.navLabel')}>
            {PRIMARY.map((n) => {
              const on = n.view === view || (n.view === 'tenders' && view === 'file');
              return (
                <a
                  key={n.view}
                  href={n.hash}
                  className={`op-nav__btn${on ? ' op-nav__btn--on' : ''}`}
                  aria-current={on ? 'page' : undefined}
                >
                  <Icon name={n.icon} size={17} />
                  <span>{t(`onav.${n.key}`)}</span>
                  {n.counted && <span className="op-nav__count">{counts[n.counted]}</span>}
                </a>
              );
            })}
            <div className="op-nav__group">{t('onav.tools')}</div>
            {SECONDARY.map((n) => {
              const on = n.view === view;
              return (
                <a
                  key={n.view}
                  href={n.hash}
                  className={`op-nav__btn${on ? ' op-nav__btn--on' : ''}`}
                  aria-current={on ? 'page' : undefined}
                >
                  <Icon name={n.icon} size={17} />
                  <span>{t(`onav.${n.key}`)}</span>
                </a>
              );
            })}
          </nav>
          {org.name && (
            <div className="op-side__op">
              <div className="op-side__op-l">{t('shell.operatorLabel')}</div>
              <div className="op-side__op-name" dir="auto">{org.name}</div>
              {org.contractRef && <div className="op-side__op-ref">{org.contractRef}</div>}
            </div>
          )}
          <div className="op-side__credit">
            <div className="op-side__credit-l">{t('shell.creditLabel')}</div>
            <div className="op-side__credit-n">{t('shell.creditName')}</div>
          </div>
        </aside>

        {/* ---------- Main ---------- */}
        <main className="op-main">
          <header className="op-topbar">
            <div className="op-crumb">
              {org.name && (
                <>
                  <span dir="auto">{org.name}</span>
                  <span className="op-crumb__sep">/</span>
                </>
              )}
              <span className={view === 'file' ? 'op-crumb__b--muted' : 'op-crumb__b'}>{viewLabel}</span>
              {crumbTender && (
                <>
                  <span className="op-crumb__sep">/</span>
                  <span className="op-crumb__c">{crumbTender.code}</span>
                </>
              )}
            </div>

            <div className="op-search" ref={searchRef}>
              <input
                className="op-search__in"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('shell.searchPlaceholder')}
                aria-label={t('shell.searchPlaceholder')}
              />
              <span className="op-search__icon">
                <Icon name="search" size={14} strokeWidth={2} />
              </span>
              {qn.length >= 2 && (
                <div className="op-panel op-search__panel">
                  {results.length === 0 ? (
                    <div className="op-panel__empty">{t('shell.noResults', { q })}</div>
                  ) : (
                    results.map((r) => (
                      <button
                        key={r.id}
                        className="op-result"
                        onClick={() => {
                          setQ('');
                          go(`#/operator/t/${r.id}`);
                        }}
                      >
                        <span className="op-result__main">
                          <span className="op-result__name">{r.title[lang]}</span>
                          <span className="op-result__sub">
                            <span className="op-code">{r.code}</span>
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="op-top-actions">
              <ThemeToggle />
              <button className="op-langbtn" onClick={() => void i18n.changeLanguage(isAr ? 'en' : 'ar')}>
                {t('app.switchLang')}
              </button>

              <NoticeBell portal="operator" />

              <div className="op-notif" ref={menuRef}>
                <button
                  className="op-avatar"
                  title={session?.name ?? t('login.signOut')}
                  aria-label={session?.name ?? t('login.signOut')}
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  {initials(session?.name ?? '—')}
                </button>
                {menuOpen && (
                  <div className="op-panel op-menu">
                    <div className="op-menu__head">
                      <div className="op-menu__name">{session?.name}</div>
                      <div className="op-menu__role">{session ? t(`roles.names.${roleKey(session.role)}`) : '—'}</div>
                    </div>
                    <button className="op-menu__out" onClick={onLogout}>
                      {t('login.signOut')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {children}
        </main>

        {/* ---------- Toasts (shared v2 queue) ---------- */}
        <ToastViewport />

        {/* ---------- Quick-look drawer ---------- */}
        {quickId && <QuickLook tenderId={quickId} onClose={() => setQuickId(null)} />}
      </div>
    </OperatorUiContext.Provider>
  );
}
