import { scheduleCompliancePct, stageByKey } from '@masaar/scpp-rules';
import { useTranslation } from 'react-i18next';
import { fmtCount, tenderDeviationWd } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { EmptyState } from '../registry/EmptyState';
import { calendarOf, currentStage, tenderApprovalTier, todayIso, useStore } from '../store';
import { approvalChain, awaitingTier } from './adminDerive';
import { TierPill } from './TierPill';

export default function FollowUpRoom() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);

  const open = state.tenders.filter((x) => currentStage(x));
  const decisions = state.tenders.filter((x) => currentStage(x)?.key === 'ratify' && !x.ratification);
  // The two outstanding-signature counts, in the client's own vocabulary (ق1/ق3). They replace
  // the single «في دورة MCT» tile, which named a substrate the client asked never to show: the
  // question a manager actually opens this room with is «whose signature is this waiting on».
  // Same two guards the retired tile carried, read off the ladder instead of the cost cycle:
  //   · only requests that owe a signature OUTSIDE the operating company (approvalChain drops
  //     ط1 — the ladder's reading of the old `aboveOwnFA` guard);
  //   · only requests still undecided (awaitingTier's `pending` — the ladder's reading of the
  //     old «a cost case is open» guard; ratified/returned/cancelled/suspended wait on nobody).
  const chain = approvalChain(state);
  const awaitingJmc = awaitingTier(chain, 'JMC').length;
  const awaitingMdoc = awaitingTier(chain, 'MDOC').length;
  const compliance = Math.round(
    scheduleCompliancePct(state.tenders.flatMap((x) => x.stages.filter((s) => s.plannedTo).map((s) => ({ plannedEnd: s.plannedTo!, actualEnd: s.actualTo })))),
  );
  const lateStages = state.tenders
    .map((x) => ({ tender: x, cur: currentStage(x), dev: tenderDeviationWd(x, today, cal) }))
    .filter((r) => r.cur?.plannedTo && today > r.cur.plannedTo)
    .sort((a, b) => b.dev - a.dev);

  /** `href` = the tile is a real link to the registry that lists exactly what it counted. */
  const kpis: { l: string; v: number | string; dot: string; href?: string }[] = [
    { l: t('admin.kpiOpen'), v: open.length, dot: 'var(--status-progress)' },
    { l: t('admin.kpiRatify'), v: decisions.length, dot: 'var(--status-risk)' },
    { l: t('admin.kpiCompliance'), v: `${compliance}%`, dot: 'var(--status-done)' },
    { l: t('admin.kpiAwaitJmc'), v: awaitingJmc, dot: 'var(--brand-amber-500)', href: '#/admin/approvals?tier=JMC' },
    { l: t('admin.kpiAwaitMdoc'), v: awaitingMdoc, dot: 'var(--brand-navy-800)', href: '#/admin/approvals?tier=MDOC' },
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

      <div className="ad-kpis ad-kpis--5">
        {kpis.map((k) => {
          const body = (
            <>
              <div className="ad-kpi__head">
                <span className="ad-kpi__dot" style={{ background: k.dot }} />
                <span className="ad-kpi__l">{k.l}</span>
                {k.href && <Icon name="chevronEnd" size={12} strokeWidth={2} className="op-chev-fwd ad-kpi__go" />}
              </div>
              <div className="ad-kpi__row"><span className="ad-kpi__v">{typeof k.v === 'number' ? fmtCount(k.v, lang) : k.v}</span></div>
            </>
          );
          // a counted queue the manager can actually open — the tile carries the same `?tier=`
          // the registry reads, so it lands already narrowed to the band it counted
          return k.href
            ? <a key={k.l} className="ad-kpi ad-kpi--link" href={k.href}>{body}</a>
            : <div key={k.l} className="ad-kpi">{body}</div>;
        })}
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
                    {/* whose signature this queue entry is actually waiting on (ق1) — the queue is
                        read at a glance, and «who decides» is the first thing it should answer */}
                    <TierPill tier={tenderApprovalTier(state, d)} tiers={state.approvalTiers} />
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
