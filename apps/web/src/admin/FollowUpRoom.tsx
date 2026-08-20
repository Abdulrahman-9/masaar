import { scheduleCompliancePct } from '@masaar/scpp-rules';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CompanyBars } from '../charts/CompanyBars';
import { CompletionHistogram } from '../charts/CompletionHistogram';
import { Sparkline } from '../charts/Sparkline';
import { TierDonut } from '../charts/TierDonut';
import { fmtCount, fmtMoney, fmtMoneyShort, tenderStatus } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { orgName } from '../orgIdentity';
import { EmptyState } from '../registry/EmptyState';
import { calendarOf, currentStage, tenderApprovalTier, todayIso, useStore } from '../store';
import { approvalChain, awaitingTier, decisionQueue } from './adminDerive';
import {
  companyStats, complianceSeries, completionBuckets, contractsAtStage, SCOPES, tierCountsOf,
} from './dashboardDerive';
import { TierPill } from './TierPill';

export default function FollowUpRoom() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();
  // memoized: `calendarOf` builds a fresh object each call, which would defeat every derivation
  // memo below it
  const cal = useMemo(() => calendarOf(state), [state]);

  const open = state.tenders.filter((x) => currentStage(x));
  const decisions = decisionQueue(state);
  // The two outstanding-signature counts, in the client's own vocabulary (ق1/ق3). They replace
  // the single «في دورة MCT» tile, which named a substrate the client asked never to show: the
  // question a manager actually opens this room with is «whose signature is this waiting on».
  const chain = approvalChain(state);
  const awaitingJmc = awaitingTier(chain, 'JMC').length;
  const awaitingMdoc = awaitingTier(chain, 'MDOC').length;
  const compliance = Math.round(
    scheduleCompliancePct(state.tenders.flatMap((x) => x.stages.filter((s) => s.plannedTo).map((s) => ({ plannedEnd: s.plannedTo!, actualEnd: s.actualTo })))),
  );
  // «مراحل متأخرة» — the same predicate `tenderStatus` uses for 'delayed', which is exactly what
  // `#/admin/tenders?status=delayed` lists. The removed «مراحل متجاوزة للمخطط» panel counted this
  // and then made the reader scroll a list; the tile counts it and opens the registry that holds it.
  const late = state.tenders.filter((x) => tenderStatus(x, today, cal) === 'delayed').length;
  const inExecution = contractsAtStage(state, 'execute').length;

  const companies = useMemo(() => companyStats(state, today, cal), [state, today, cal]);
  const tierCounts = useMemo(() => tierCountsOf(state, state.tenders), [state]);
  const buckets = useMemo(() => completionBuckets(state.contracts), [state.contracts]);
  const series = useMemo(() => complianceSeries(state, today), [state, today]);

  /**
   * A tile that COUNTS ROWS is a real `<a>` to the registry listing exactly those rows (§5), and
   * the «افتح السجل مصفّى» line is printed in the RESTING state, not revealed on hover: an
   * affordance that only exists under a pointer does not exist for a touch or keyboard reader.
   *
   * «الالتزام بالجداول» is the one tile with NO destination, and that is the honest answer rather
   * than a missing feature. It is a ratio over every stage ever closed — a percentage has no
   * registry of rows to open, and the screen it used to point at (`#/admin/compliance`) answers a
   * different question entirely: §9 local content and §12.2 MDOC nominations, not schedule. It
   * therefore renders as a plain tile with no affordance line, and states the WINDOW it measures
   * instead; the month-by-month strip immediately below decomposes the same measurement over time.
   *
   * No trend delta is emitted on any tile — the store keeps no earlier snapshot to compare
   * against, and the no-fabrication rule forbids inventing one: a «—» or a «0%» in a trend slot
   * asserts a comparison that was never made, which is the same lie as a wrong number.
   *
   * The two ladder tiles count `decision === 'pending'` rows, so they carry `pending=1` as well as
   * the band: `?tier=JMC` alone opens the whole band including the requests already decided, which
   * is a larger set than the number printed on the tile.
   */
  const kpis: { l: string; v: number | string; dot: string; href?: string; window?: string }[] = [
    { l: t('admin.kpiOpen'), v: open.length, dot: 'var(--status-progress)', href: '#/admin/tenders?status=open' },
    { l: t('admin.kpiRatify'), v: decisions.length, dot: 'var(--status-risk)', href: '#/admin/tenders?pending=1' },
    { l: t('adroom.kpiLate'), v: late, dot: 'var(--status-delayed)', href: '#/admin/tenders?status=delayed' },
    { l: t('adroom.kpiExecuting'), v: inExecution, dot: 'var(--status-done)', href: '#/admin/contracts?stage=execute' },
    { l: t('admin.kpiCompliance'), v: `${compliance}%`, dot: 'var(--status-done)', window: t('adroom.windowAllTime') },
    { l: t('admin.kpiAwaitJmc'), v: awaitingJmc, dot: 'var(--tier-jmc)', href: '#/admin/approvals?tier=JMC&pending=1' },
    { l: t('admin.kpiAwaitMdoc'), v: awaitingMdoc, dot: 'var(--tier-mdoc)', href: '#/admin/approvals?tier=MDOC&pending=1' },
  ];

  const ladderSub = t('ch.donut.sub', {
    op: fmtMoney(state.approvalTiers.operatorMaxUSD),
    jmc: fmtMoney(state.approvalTiers.jmcMaxUSD),
  });

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

      <div className="ad-kpis ad-kpis--wrap">
        {kpis.map((k) => {
          const body = (
            <>
              <span className="ad-kpi__head">
                <span className="ad-kpi__dot" style={{ background: k.dot }} />
                <span className="ad-kpi__l">{k.l}</span>
              </span>
              <span className="ad-kpi__row">
                <span className="ad-kpi__v">{typeof k.v === 'number' ? fmtCount(k.v, lang) : k.v}</span>
              </span>
              {k.href ? (
                <span className="ad-kpi__go">
                  {t('adroom.openFiltered')}
                  <Icon name="chevronStart" size={12} strokeWidth={2} className="op-chev-fwd" />
                </span>
              ) : (
                // the same slot in the tile anatomy, saying what the figure covers instead of
                // promising a registry it cannot open
                <span className="ad-kpi__win">{k.window}</span>
              )}
            </>
          );
          return k.href
            ? <a key={k.l} className="ad-kpi ad-kpi--link" href={k.href}>{body}</a>
            : <div key={k.l} className="ad-kpi">{body}</div>;
        })}
      </div>

      {/* (د) schedule compliance month by month — placed directly under the strip that carries the
          all-time ratio, because it is the only decomposition of that figure this store can
          honestly draw. `Sparkline` returns null below two derivable points, so a store that
          cannot support a series prints no series, and never a line through a single number. */}
      {series.length >= 2 && (
        <div className="ad-panel ad-panel--fig" style={{ marginBlockStart: 14 }}>
          {/* the same `<figure>` skeleton the other three charts use — one anatomy per surface
              class, and it is what spaces the caption, the strip and the note evenly */}
          <figure className="ch">
            <figcaption className="ch__cap">
              <span className="ch__t">{t('ch.spark.title')}</span>
              <span className="ch__s">{t('ch.spark.sub')}</span>
            </figcaption>
            <Sparkline points={series} lang={lang} />
            {/* the two percentages on this screen measure different windows and are computed by
                the same function — say which is which, rather than leave a reader to hunt for a
                discrepancy that is not one */}
            <div className="ch__note">{t('ch.spark.note')}</div>
          </figure>
        </div>
      )}

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

        {/* (ب) the ladder split — the figure lives directly in the panel, never in a card inside it */}
        <div className="ad-panel ad-panel--fig">
          <TierDonut counts={tierCounts} lang={lang} sub={ladderSub} />
        </div>
      </div>

      <div className="ad-cols">
        {/* (أ) per-company bars — all twelve companies, zero rows included */}
        <div className="ad-panel ad-panel--fig">
          <CompanyBars rows={companies} lang={lang} />
        </div>

        {/* (ج) contract completion distribution */}
        <div className="ad-panel ad-panel--fig">
          <CompletionHistogram buckets={buckets} lang={lang} />
        </div>
      </div>

      {/* Client request 2 — the per-company detail, folded away by default because it answers a
          second question («what kind of work does each company run») that the bars above do not.
          A native <details>: the panel IS the disclosure, so nothing is nested inside a card. */}
      <details className="ad-panel ad-disc">
        <summary className="ad-panel__head ad-disc__sum">
          <div>
            <div className="ad-panel__t">{t('adroom.companies')}</div>
            <div className="ad-panel__s">{t('adroom.companiesSub')}</div>
          </div>
          <span className="ad-panel__count">{fmtCount(companies.length, lang)}</span>
          <Icon name="chevronEnd" size={14} strokeWidth={2} className="ad-disc__caret" />
        </summary>
        <div style={{ overflowX: 'auto' }}>
          <table className="op-tbl">
            <thead>
              <tr>
                <th>{t('adroom.colCompany')}</th>
                <th className="op-end">{t('adroom.colFields')}</th>
                {SCOPES.map((s) => <th key={s} className="op-end">{t(`compliance.scope.${s}`)}</th>)}
                <th className="op-end">{t('adroom.colTenders')}</th>
                <th className="op-end">{t('adroom.colLate')}</th>
                <th className="op-end">{t('adroom.colContracts')}</th>
                <th className="op-end">{t('adroom.colContractValue')}</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((r) => (
                <tr key={r.op.id} className="op-tbl__row">
                  <td>
                    {/* a real link: the operators registry, narrowed to this company */}
                    <a className="acc-open" href={`#/admin/operators?op=${encodeURIComponent(r.op.id)}`} dir="auto">
                      {orgName(r.op, lang)}
                      <Icon name="chevronEnd" size={12} strokeWidth={2} className="op-chev-fwd" />
                    </a>
                  </td>
                  <td className="op-end mono">{fmtCount(r.fields, lang)}</td>
                  {SCOPES.map((s) => (
                    <td key={s} className="op-end mono">
                      {r.scopes[s] === 0 ? <span className="op-dev op-dev--none">—</span> : fmtCount(r.scopes[s], lang)}
                    </td>
                  ))}
                  <td className="op-end mono">{fmtCount(r.tenders, lang)}</td>
                  <td className="op-end mono" style={r.late > 0 ? { color: 'var(--status-delayed)' } : undefined}>
                    {r.late === 0 ? <span className="op-dev op-dev--none">—</span> : fmtCount(r.late, lang)}
                  </td>
                  <td className="op-end mono">{fmtCount(r.contracts, lang)}</td>
                  <td className="op-end mono">
                    {r.contractValueUSD === 0 ? <span className="op-dev op-dev--none">—</span> : fmtMoneyShort(r.contractValueUSD)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* the one thing a reader cannot infer from the zeros: a contract is attributed to a
            company only through its originating tender, and a contract signed without one is
            attributed to nobody rather than guessed at */}
        <div className="ad-empty-inline" style={{ textAlign: 'start' }}>{t('adroom.companiesNote')}</div>
      </details>
    </div>
  );
}
