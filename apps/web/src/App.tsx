import { awardVerdict, suggestMethod } from '@masaar/scpp-rules';
import { KpiTile, PathBadge, VerdictStrip } from '@masaar/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AdminShell, { ADMIN_SUBS, type AdminSub } from './admin/AdminShell';
import TenderReview from './admin/TenderReview';
import Gallery from './Gallery';
import Login from './Login';
import { computeNotices } from './notify';
import Dashboard from './operator/Dashboard';
import NewRequest from './operator/NewRequest';
import TenderDetail from './operator/TenderDetail';
import { clearSession, loadSession } from './session';
import { StoreProvider, todayIso, useStore } from './store';

const ACCREDITED_ESTIMATE = 4_200_000;

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

/** In-app notification bell — derived live (phase 5); e-mail joins with the API. */
function NoticeBell() {
  const { t } = useTranslation();
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const notices = computeNotices(state, todayIso());

  return (
    <div className="bell-wrap">
      <button className="bell" aria-label={t('notices.title')} onClick={() => setOpen((o) => !o)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {notices.length > 0 && <span className="bell__count mono">{notices.length}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="bell-panel__head">{t('notices.title')}</div>
          {notices.length === 0 ? (
            <div className="bell-panel__empty">{t('notices.empty')}</div>
          ) : (
            <ul>
              {notices.map((n) => (
                <li key={n.id} className={`bell-item bell-item--${n.severity}`}>
                  {t(`notices.${n.key}`, n.params)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Home() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';

  const [bid, setBid] = useState(4_620_000);
  const [value, setValue] = useState(1_000_000);

  const verdict = awardVerdict(bid, ACCREDITED_ESTIMATE);
  const routing = suggestMethod({ estimatedValueUSD: value });

  return (
    <>
      <section className="kpis m-skin">
        <KpiTile label={t('kpi.openTenders')} value={18} />
        <KpiTile label={t('kpi.awaitingRatification')} value={4} />
        <KpiTile label={t('kpi.scheduleCompliance')} value={87} suffix="%" />
        <KpiTile label={t('kpi.avgAwardDays')} value={64} />
      </section>

      <section className="card">
        <h2>{t('verdict.title')}</h2>
        <p className="hint">{t('verdict.hint')}</p>
        <div className="row">
          <div className="field">
            <label htmlFor="estimate">{t('verdict.estimate')}</label>
            <input id="estimate" className="ro" value={ACCREDITED_ESTIMATE.toLocaleString('en-US')} readOnly />
          </div>
          <div className="field">
            <label htmlFor="bid">{t('verdict.bid')}</label>
            <input
              id="bid"
              type="number"
              step={10_000}
              min={0}
              value={bid}
              onChange={(e) => setBid(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <VerdictStrip verdict={verdict} lang={lang} />
        </div>
      </section>

      <section className="card">
        <h2>{t('routing.title')}</h2>
        <p className="hint">{t('routing.hint')}</p>
        <div className="row">
          <div className="field">
            <label htmlFor="value">{t('routing.value')}</label>
            <input
              id="value"
              type="number"
              step={10_000}
              min={0}
              value={value}
              onChange={(e) => setValue(Number(e.target.value) || 0)}
            />
          </div>
          <PathBadge id={routing.method.id} lang={lang} showClause />
        </div>
        <p className="method-reason">{lang === 'ar' ? routing.reasonAr : routing.reasonEn}</p>
      </section>
    </>
  );
}

const ADMIN_RE = new RegExp(`^#\\/admin\\/(${ADMIN_SUBS.filter((s) => s !== 'overview').join('|')})$`);

function route(hash: string) {
  if (hash === '#/ui') return <Gallery />;
  if (hash === '#/operator') return <Dashboard />;
  if (hash === '#/operator/new') return <NewRequest />;
  const t = /^#\/operator\/t\/(.+)$/.exec(hash);
  if (t) return <TenderDetail id={t[1]!} />;
  if (hash === '#/admin') return <AdminShell sub="overview" />;
  const rv = /^#\/admin\/review\/(.+)$/.exec(hash);
  if (rv) return <TenderReview id={rv[1]!} />;
  const a = ADMIN_RE.exec(hash);
  if (a) return <AdminShell sub={a[1] as AdminSub} />;
  return <Home />;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const hash = useHashRoute();
  const [, forceRender] = useState(0);

  const session = loadSession();
  const needsAuth = hash.startsWith('#/operator') || hash.startsWith('#/admin');
  const section = hash.startsWith('#/operator') ? 'operator' : hash.startsWith('#/admin') ? 'admin' : hash === '#/ui' ? 'ui' : 'home';

  return (
    <StoreProvider>
      <header className="bar">
        <div className="bar-in">
          <img src="/logo.svg" alt={t('app.title')} />
          <div>
            <div className="bar-title">{t('app.title')}</div>
            <div className="bar-sub">{t('app.subtitle')}</div>
          </div>
          <nav className="nav">
            <a className={`nav-link${section === 'home' ? ' nav-link--on' : ''}`} href="#/">
              {t('nav.home')}
            </a>
            <a className={`nav-link${section === 'operator' ? ' nav-link--on' : ''}`} href="#/operator">
              {t('nav.operator')}
            </a>
            <a className={`nav-link${section === 'admin' ? ' nav-link--on' : ''}`} href="#/admin">
              {t('nav.admin')}
            </a>
            <a className={`nav-link${section === 'ui' ? ' nav-link--on' : ''}`} href="#/ui">
              {t('nav.gallery')}
            </a>
          </nav>
          {session && <NoticeBell />}
          {session && (
            <button
              className="user-chip"
              title={t('login.signOut')}
              onClick={() => {
                clearSession();
                forceRender((x) => x + 1);
              }}
            >
              {session.name}
            </button>
          )}
          <button className="lang-btn" onClick={() => i18n.changeLanguage(isAr ? 'en' : 'ar')}>
            {t('app.switchLang')}
          </button>
        </div>
      </header>

      <main className="wrap">
        {needsAuth && !session ? <Login onLogin={() => forceRender((x) => x + 1)} /> : route(hash)}
        <p className="foot">{t('footer')}</p>
      </main>
    </StoreProvider>
  );
}
