import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NoticeBell } from '../NoticeBell';
import { fmtCount } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { loadSession } from '../session';
import { useRegisterDispatchFail, useStore } from '../store';
import { ToastViewport, useToasts, type ToastOpts } from '../Toasts';
import { roleKey } from './access';
import { decisionQueue } from './adminDerive';
import './admin.css';

export type AdminView =
  | 'room' | 'tenders' | 'contracts' | 'entities' | 'reports'
  | 'users' | 'roles' | 'operators' | 'fields' | 'holidays'
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

const PRIMARY: { view: AdminView; hash: string; icon: string; counted?: 'decisions' | 'tenders' | 'accounts' }[] = [
  { view: 'room', hash: '#/admin', icon: 'layers', counted: 'decisions' },
  { view: 'tenders', hash: '#/admin/tenders', icon: 'list', counted: 'tenders' },
  { view: 'contracts', hash: '#/admin/contracts', icon: 'doc' },
  // entities are companies, not people — the people glyph belongs to the access registry
  { view: 'entities', hash: '#/admin/entities', icon: 'building' },
  { view: 'reports', hash: '#/admin/reports', icon: 'chart' },
  { view: 'users', hash: '#/admin/users', icon: 'users', counted: 'accounts' },
];
const TOOLS: { view: AdminView; hash: string; icon: string }[] = [
  { view: 'operators', hash: '#/admin/operators', icon: 'building' },
  { view: 'fields', hash: '#/admin/fields', icon: 'layers' },
  { view: 'holidays', hash: '#/admin/holidays', icon: 'calendar' },
  // 'shield' is the compliance glyph; 'lock' was free
  { view: 'roles', hash: '#/admin/roles', icon: 'lock' },
  { view: 'approvals', hash: '#/admin/approvals', icon: 'check' },
  // schedule sits directly above §9 compliance: the two answer «هل التزمنا؟» about different
  // things (time / local content), and the adjacency is what makes the difference readable
  { view: 'schedule', hash: '#/admin/schedule', icon: 'clock' },
  { view: 'compliance', hash: '#/admin/compliance', icon: 'shield' },
  { view: 'paths', hash: '#/admin/paths', icon: 'chart' },
  { view: 'audit', hash: '#/admin/audit', icon: 'doc' },
];

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
  const counts = { decisions, tenders: state.tenders.length, accounts: state.users.filter((u) => !u.disabled).length };

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
          <nav className="ad-nav">
            {PRIMARY.map((n) => {
              const on = n.view === view || (n.view === 'tenders' && view === 'review');
              return (
                <a key={n.view} href={n.hash} className={`ad-nav__btn${on ? ' ad-nav__btn--on' : ''}`}>
                  <Icon name={n.icon} size={17} /><span>{t(`adnav.${n.view}`)}</span>
                  {n.counted && <span className="ad-nav__count">{fmtCount(counts[n.counted], lang)}</span>}
                </a>
              );
            })}
            <div className="ad-nav__group">{t('adnav.tools')}</div>
            {TOOLS.map((n) => (
              <a key={n.view} href={n.hash} className={`ad-nav__btn${n.view === view ? ' ad-nav__btn--on' : ''}`}>
                <Icon name={n.icon} size={17} /><span>{t(`adnav.${n.view}`)}</span>
              </a>
            ))}
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
