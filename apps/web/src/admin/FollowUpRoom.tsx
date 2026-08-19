import { scheduleCompliancePct, stageByKey } from '@masaar/scpp-rules';
import { useTranslation } from 'react-i18next';
import { fmtCount, tenderDeviationWd } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { EmptyState } from '../registry/EmptyState';
import { aboveOwnFA, calendarOf, currentStage, todayIso, useStore } from '../store';

export default function FollowUpRoom() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);

  const open = state.tenders.filter((x) => currentStage(x));
  const decisions = state.tenders.filter((x) => currentStage(x)?.key === 'ratify' && !x.ratification);
  const inMct = state.tenders.filter((x) => aboveOwnFA(state, x) && x.mct);
  const compliance = Math.round(
    scheduleCompliancePct(state.tenders.flatMap((x) => x.stages.filter((s) => s.plannedTo).map((s) => ({ plannedEnd: s.plannedTo!, actualEnd: s.actualTo })))),
  );
  const lateStages = state.tenders
    .map((x) => ({ tender: x, cur: currentStage(x), dev: tenderDeviationWd(x, today, cal) }))
    .filter((r) => r.cur?.plannedTo && today > r.cur.plannedTo)
    .sort((a, b) => b.dev - a.dev);

  const kpis = [
    { l: t('admin.kpiOpen'), v: open.length, dot: 'var(--status-progress)' },
    { l: t('admin.kpiRatify'), v: decisions.length, dot: 'var(--status-risk)' },
    { l: t('admin.kpiCompliance'), v: `${compliance}%`, dot: 'var(--status-done)' },
    { l: t('admin.kpiMct'), v: inMct.length, dot: 'var(--brand-amber-500)' },
  ];

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('adroom.title')}</h1>
          {/* the portfolio breadth is DERIVED from the live registry (C2) — a hardcoded figure here
              would claim a portfolio size the store cannot vouch for (and reads wrong the moment an
              operator is created), exactly the fabrication the KPI row below never commits. */}
          <div className="op-page__sub">{t('adroom.sub', { operators: fmtCount(state.operators.length, lang) })}</div>
        </div>
        <a className="op-btn-ghost" href="#/operator/reports/weekly">
          <Icon name="printer" size={14} />{t('adroom.weeklyReport')}
        </a>
      </div>

      <div className="ad-kpis">
        {kpis.map((k) => (
          <div key={k.l} className="ad-kpi">
            <div className="ad-kpi__head"><span className="ad-kpi__dot" style={{ background: k.dot }} /><span className="ad-kpi__l">{k.l}</span></div>
            <div className="ad-kpi__row"><span className="ad-kpi__v">{typeof k.v === 'number' ? fmtCount(k.v, lang) : k.v}</span></div>
          </div>
        ))}
      </div>

      <div className="ad-cols">
        {/* Decision queue */}
        <div className="ad-panel">
          <div className="ad-panel__head">
            <div>
              <div className="ad-panel__t">{t('adroom.decisions')}</div>
              <div className="ad-panel__s">{t('adroom.decisionsSub')}</div>
            </div>
            <span className="ad-panel__count ad-panel__count--amber">{decisions.length}</span>
          </div>
          {decisions.length === 0 ? (
            <EmptyState mode="empty" inline>{t('adroom.noDecisions')}</EmptyState>
          ) : (
            decisions.map((d) => (
              <button key={d.id} className="ad-decision" onClick={() => { window.location.hash = `#/admin/review/${d.id}`; }}>
                <span className="ad-decision__icon"><Icon name="check" size={16} /></span>
                <span className="ad-decision__body">
                  <span className="ad-decision__t">{t('adroom.decideRatify')}</span>
                  <span className="ad-decision__meta">
                    <span dir="auto">{d.title[lang]}</span>
                    <span className="op-code">{d.code}</span>
                    <span className="op-scpp">SCPP 6.6</span>
                  </span>
                </span>
                <span className="ad-decision__due">{t('adroom.awaiting')}</span>
                <span className="ad-decision__go">{t('adroom.openDecision')}<Icon name="chevronStart" size={13} strokeWidth={2} className="op-chev-fwd" /></span>
              </button>
            ))
          )}
        </div>

        {/* Late stages */}
        <div className="ad-panel">
          <div className="ad-panel__head">
            <div>
              <div className="ad-panel__t">{t('adroom.lateStages')}</div>
              <div className="ad-panel__s">{t('adroom.lateStagesSub')}</div>
            </div>
            <span className="ad-panel__count ad-panel__count--red">{lateStages.length}</span>
          </div>
          {lateStages.length === 0 ? (
            <EmptyState mode="empty" inline>{t('adroom.noLate')}</EmptyState>
          ) : (
            lateStages.map((l) => (
              <div key={l.tender.id} className="ad-late">
                <div className="ad-late__body">
                  <div className="ad-late__t">{l.cur ? stageByKey(l.cur.key)?.[lang] : ''} — {l.tender.title[lang]}</div>
                  <div className="ad-late__s"><span className="op-code">{l.tender.code}</span></div>
                </div>
                <span className="ad-late__chip">{t('dev.overdueWd', { n: fmtCount(l.dev, lang) })}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
