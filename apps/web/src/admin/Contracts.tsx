import { useMemo, useState } from 'react';
import { guaranteeExpiringSoon } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { CompletionHistogram } from '../charts/CompletionHistogram';
import { fmtCount, fmtMoney } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { dateRangeInverted, inDateRange, inValueRange, rangeInverted } from '../registry/filters';
import { PROGRESS_BUCKETS, useFilterParams, type ProgressBucket } from '../registry/useHashParams';
import { todayIso, useStore, type ContractStageKey, type ContractState } from '../store';
import { bucketRangeLabel, completionBuckets, progressBucketOf } from './dashboardDerive';
import { EmptyState } from '../registry/EmptyState';
import { activeFilterChips, FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { RangeFilter } from '../registry/RangeFilter';
import { exportCsv, reportStamp, type FilterLabels, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SelectFilter } from '../registry/SelectFilter';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { useStampWords } from '../registry/useStampWords';
import { useAdminUi } from './AdminShell';
import { CONTRACT_STAGES, capHealth, contractProgress, currentStageKey, scheduleVariancePct, stageLabel, type CapHealth } from './contractDerive';

const CAP_PILL = { ok: 'done', risk: 'risk', breach: 'blocked' } as const;
/** Best → worst, so the tri-state sort reads ok → risk → breach ascending. */
const HEALTH_ORDER: CapHealth[] = ['ok', 'risk', 'breach'];

/** Post-award contracts registry — classified by worst cap health + lifecycle stage,
 *  each row opening the 360° contract file. Contracts are born of tender ratification;
 *  there is no create action here, so the head carries no primary button (honesty rule). */
export default function Contracts() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const today = todayIso();
  const words = useStampWords();

  const [q, setQ] = useState('');

  const contracts = state.contracts;

  /**
   * The whole toolbar in the address (§5-ج + client request 7). `?prog=` arrives from a histogram
   * column — here or in the follow-up room — and `?stage=` from the «عقود في مرحلة التنفيذ» tile;
   * request 7 added the completion bucket as a VISIBLE select over the same parameter (it was
   * reachable only by clicking a column before), plus the value and signing-date windows. All of
   * them re-sync on `hashchange`, which is what makes the histogram ON THIS SCREEN work: clicking
   * a column changes only the query string, and a mount-only read would leave the table untouched.
   *
   * Note `health` is this screen's own cap-health chip and is deliberately NOT the ladder's
   * `?tier=` — a contract has no approval tier, and reusing the name would let a link about
   * approving bodies quietly re-point at variation-order caps.
   */
  const f = useFilterParams();
  const progParam = f.get('prog') as ProgressBucket | '';
  const stageParam = f.get('stage') as ContractStageKey | '';
  const vmin = f.get('vmin');
  const vmax = f.get('vmax');
  const dFrom = f.get('from');
  const dTo = f.get('to');
  const [health, setHealth] = useState<'' | CapHealth>('');

  const valueBad = rangeInverted(vmin, vmax);
  const dateBad = dateRangeInverted(dFrom, dTo);

  const qn = q.trim().toLowerCase();
  // every dimension EXCEPT the cap-health chips — the chip counts read off this set, so a chip
  // never promises rows the value window or the search has already removed (request 7)
  const searched = useMemo(() => contracts.filter((c) => {
    if (progParam && progressBucketOf(contractProgress(c).pct) !== progParam) return false;
    if (stageParam && currentStageKey(c) !== stageParam) return false;
    if (!inValueRange(c.valueUSD, vmin, vmax)) return false;
    if (!inDateRange(c.signedOn, dFrom, dTo)) return false;
    if (qn && !(
      c.code.toLowerCase().includes(qn) ||
      c.contractorName.toLowerCase().includes(qn) ||
      c.title.ar.includes(q.trim()) ||
      c.title.en.toLowerCase().includes(qn)
    )) return false;
    return true;
  }), [contracts, q, qn, progParam, stageParam, vmin, vmax, dFrom, dTo]);

  const rows = useMemo(
    () => (health ? searched.filter((c) => capHealth(c) === health) : searched),
    [searched, health],
  );

  // The distribution is drawn over the WHOLE registry, never over the filtered rows: a histogram
  // that redraws itself from its own selection would show one full column and three empty ones,
  // and the reader would lose the shape they were navigating by.
  const buckets = useMemo(() => completionBuckets(contracts), [contracts]);

  // Tri-state sort — code is numeric-collated, value is numeric, health follows the tier order.
  const compare = useMemo(() => ({
    code: arCompare<ContractState>((c) => c.code),
    value: (a: ContractState, b: ContractState) => a.valueUSD - b.valueUSD,
    health: (a: ContractState, b: ContractState) => HEALTH_ORDER.indexOf(capHealth(a)) - HEALTH_ORDER.indexOf(capHealth(b)),
  }), []);
  const { sorted, sortKey, dir, toggle } = useTableSort(rows, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  // KPIs from the FILTERED view — real store fields only (no «disbursed» metric: no such field).
  const kpiCaps = rows.filter((c) => capHealth(c) !== 'ok').length;
  const kpiLate = rows.filter((c) => scheduleVariancePct(c, today) < 0).length;
  const kpiBonds = rows.reduce((n, c) => n + c.guarantees.filter((g) => guaranteeExpiringSoon(g.expiresOn, today)).length, 0);

  const kpis = [
    { l: t('reg.contracts.kpiCount'), v: rows.length, tone: undefined as string | undefined, delta: undefined as string | undefined },
    { l: t('reg.contracts.kpiCaps'), v: kpiCaps, tone: kpiCaps > 0 ? 'var(--status-risk)' : undefined, delta: kpiCaps > 0 ? t('reg.contracts.kpiCapsHint') : undefined },
    { l: t('reg.contracts.kpiLate'), v: kpiLate, tone: kpiLate > 0 ? 'var(--status-delayed)' : undefined, delta: kpiLate > 0 ? t('reg.contracts.kpiLateHint') : undefined },
    { l: t('reg.contracts.kpiBonds'), v: kpiBonds, tone: kpiBonds > 0 ? 'var(--status-risk)' : undefined, delta: kpiBonds > 0 ? t('reg.contracts.kpiBondsHint') : undefined },
  ];

  const filterChips: FilterChip[] = [
    { key: '', label: t('reg.contracts.chipAll'), count: searched.length, active: health === '' },
    { key: 'ok', label: t('reg.contracts.cap_ok'), count: searched.filter((c) => capHealth(c) === 'ok').length, active: health === 'ok' },
    { key: 'risk', label: t('reg.contracts.cap_risk'), count: searched.filter((c) => capHealth(c) === 'risk').length, active: health === 'risk' },
    { key: 'breach', label: t('reg.contracts.cap_breach'), count: searched.filter((c) => capHealth(c) === 'breach').length, active: health === 'breach' },
  ];

  /** ONE declaration of every narrowing — it drives the chips and the export/print stamp alike. */
  const labels: FilterLabels = {
    q: { label: t('reg.stamp.dim.q') },
    health: { label: t('reg.stamp.dim.health'), value: (v) => t(`reg.contracts.cap_${v}`) },
    // the chip prints the SAME range the histogram column does (`bucketRangeLabel`) — the key
    // '25-50' is the machine name of a half-open bucket, not the range a reader should be shown
    prog: { label: t('reg.stamp.dim.prog'), value: (v) => `${bucketRangeLabel(v as ProgressBucket)}%` },
    stage: { label: t('reg.stamp.dim.stage'), value: (v) => stageLabel(v as ContractStageKey, lang) },
    vmin: { label: t('reg.stamp.dim.valueFrom'), value: (v) => fmtMoney(Number(v)) },
    vmax: { label: t('reg.stamp.dim.valueTo'), value: (v) => fmtMoney(Number(v)) },
    from: { label: t('reg.stamp.dim.signedFrom') },
    to: { label: t('reg.stamp.dim.signedTo') },
  };

  const stampParams = useMemo(() => {
    const p = new URLSearchParams();
    if (qn) p.set('q', q.trim());
    if (health) p.set('health', health);
    if (progParam) p.set('prog', progParam);
    if (stageParam) p.set('stage', stageParam);
    if (vmin) p.set('vmin', vmin);
    if (vmax) p.set('vmax', vmax);
    if (dFrom) p.set('from', dFrom);
    if (dTo) p.set('to', dTo);
    return p;
  }, [q, qn, health, progParam, stageParam, vmin, vmax, dFrom, dTo]);

  const stamp = reportStamp({ params: stampParams, labels, lang, rows: sorted.length, today, words });

  const activeChips = activeFilterChips(stampParams, labels, lang, (name) => {
    if (name === 'q') setQ('');
    else if (name === 'health') setHealth('');
    else f.set(name as 'prog', '');
  });

  const clearFilters = () => { setQ(''); setHealth(''); f.clear(); };

  // One column contract drives the table and the CSV — labels stay machine field names.
  const csvColumns: ReportColumn<ContractState>[] = [
    { key: 'code', label: 'code', value: (c) => c.code },
    { key: 'title', label: 'title', value: (c) => c.title[lang] },
    { key: 'contractor', label: 'contractor', value: (c) => c.contractorName },
    { key: 'signedOn', label: 'signedOn', value: (c) => c.signedOn, format: 'date' },
    { key: 'valueUSD', label: 'valueUSD', value: (c) => c.valueUSD, format: 'money', total: true },
    { key: 'health', label: 'health', value: (c) => capHealth(c) },
    { key: 'stage', label: 'stage', value: (c) => currentStageKey(c) ?? 'delivered' },
    { key: 'progressPct', label: 'progressPct', value: (c) => contractProgress(c).pct },
    { key: 'scheduleVariancePct', label: 'scheduleVariancePct', value: (c) => scheduleVariancePct(c, today) },
    { key: 'voTotalUSD', label: 'voTotalUSD', value: (c) => c.voTotalUSD },
    { key: 'extensionDays', label: 'extensionDays', value: (c) => c.extensionDays },
    { key: 'ldTotalUSD', label: 'ldTotalUSD', value: (c) => c.ldTotalUSD },
  ];

  const doExport = () => {
    // exports exactly the filtered+sorted view — a local file only, never audited server-side
    exportCsv('masaar-contracts-registry', csvColumns, sorted, stamp);
    toast(t('reg.contracts.toastExport'));
  };

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('reg.contracts.title')}</h1>
          <div className="op-page__sub">{t('reg.contracts.sub')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="op-btn-ghost"
            onClick={doExport}
            disabled={sorted.length === 0}
            title={sorted.length === 0 ? t('reg.contracts.exportEmpty') : undefined}
          >
            {t('reg.contracts.exportCsv')}
          </button>
        </div>
      </div>

      <div className="ad-kpis" style={{ marginTop: 4 }}>
        {kpis.map((k) => (
          <div key={k.l} className="ad-kpi">
            <div className="ad-kpi__head"><span className="ad-kpi__l">{k.l}</span></div>
            <div className="ad-kpi__row">
              <span className="ad-kpi__v" style={k.tone ? { color: k.tone } : undefined}>{fmtCount(k.v, lang)}</span>
            </div>
            {k.delta && <div className="ad-kpi__delta" style={{ color: k.tone }}>{k.delta}</div>}
          </div>
        ))}
      </div>

      {/* Client request 12(c) — the completion shape of the whole portfolio, above the table it
          filters. Each column is a real link carrying its own bucket. */}
      {contracts.length > 0 && (
        <div className="ad-panel ad-panel--fig" style={{ marginBlockStart: 14 }}>
          <CompletionHistogram buckets={buckets} lang={lang} />
        </div>
      )}

      <div className="acc-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('reg.contracts.searchPh')} style={{ width: 300 }} />
        <FilterChips chips={filterChips} onSelect={(key) => setHealth(key as CapHealth | '')} lang={lang} />
        {/* request 7 — the completion bucket as a control, not only as a histogram click: the
            same `?prog=` parameter, so the column and the select are one filter, never two */}
        <SelectFilter
          allLabel={t('reg.contracts.allProg')}
          value={progParam}
          onChange={(v) => f.set('prog', v)}
          options={PROGRESS_BUCKETS.map((b) => ({ value: b, label: `${bucketRangeLabel(b)}%` }))}
        />
        <SelectFilter
          allLabel={t('reg.contracts.allStages')}
          value={stageParam}
          onChange={(v) => f.set('stage', v)}
          options={CONTRACT_STAGES.map((s) => ({ value: s.key, label: s[lang] }))}
        />
      </div>

      <div className="acc-filters" style={{ marginBlock: '0 12px' }}>
        <RangeFilter
          id="ctr-val" kind="money" label={t('reg.contracts.rangeValue')}
          min={vmin} max={vmax} inverted={valueBad}
          onMin={(v) => f.set('vmin', v)} onMax={(v) => f.set('vmax', v)}
        />
        <RangeFilter
          id="ctr-date" kind="date" label={t('reg.contracts.rangeDate')}
          min={dFrom} max={dTo} inverted={dateBad}
          onMin={(v) => f.set('from', v)} onMax={(v) => f.set('to', v)}
        />
      </div>

      {activeChips.length > 0 && (
        <div className="acc-filters" style={{ marginBlock: '0 10px' }}>
          <FilterChips chips={activeChips} onSelect={() => {}} lang={lang} />
          <button className="op-btn-ghost" onClick={clearFilters}>{t('reg.contracts.clearFilters')}</button>
        </div>
      )}

      <div className="reg-stamp">{stamp}</div>

      {contracts.length === 0 ? (
        <EmptyState
          mode="empty"
          action={<a className="op-btn-ghost" href="#/admin/tenders">{t('reg.contracts.emptyGoTenders')}</a>}
        >
          {t('reg.contracts.emptyStore')}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={<button className="op-btn-ghost" onClick={clearFilters}>{t('reg.contracts.clearFilters')}</button>}
        >
          {valueBad || dateBad ? t('reg.range.invertedBody') : t('reg.contracts.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('reg.contracts.colContract')} sortKey="code" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('reg.contracts.colContractor')}</th>
                  <SortableTh label={t('reg.contracts.colValue')} sortKey="value" active={sortKey} dir={dir} onToggle={toggle} className="op-end" style={{ width: 150 }} />
                  <SortableTh label={t('reg.contracts.colCaps')} sortKey="health" active={sortKey} dir={dir} onToggle={toggle} style={{ width: 170 }} />
                  <th style={{ width: 190 }}>{t('reg.contracts.colStage')}</th>
                  <th className="op-end" style={{ width: 96 }} />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => {
                  const cHealth = capHealth(c);
                  const stageKey = currentStageKey(c);
                  const prog = contractProgress(c);
                  const bondSoon = c.guarantees.some((g) => guaranteeExpiringSoon(g.expiresOn, today));
                  const behind = scheduleVariancePct(c, today) < 0;
                  const href = `#/admin/contracts/${c.id}`;
                  return (
                    <tr key={c.id} className="op-tbl__row">
                      <td>
                        <div className="op-tbl__name" dir="auto">{c.title[lang]}</div>
                        <div className="op-tbl__code">{c.code}</div>
                      </td>
                      <td dir="auto">{c.contractorName}</td>
                      <td className="op-end mono">{fmtMoney(c.valueUSD)}</td>
                      <td>
                        <StatusPill status={CAP_PILL[cHealth]}>{t(`reg.contracts.cap_${cHealth}`)}</StatusPill>
                        {bondSoon && <div className="op-tbl__code" style={{ color: 'var(--status-risk)' }}>{t('reg.contracts.bondSoon')}</div>}
                      </td>
                      <td>
                        {stageKey ? (
                          <>
                            <div style={{ fontSize: 13 }}>{stageLabel(stageKey, lang)}</div>
                            <div className="op-tbl__code">{fmtCount(prog.done, lang)}/{fmtCount(prog.total, lang)} · {fmtCount(prog.pct, lang)}%</div>
                            {behind && <div className="op-tbl__code" style={{ color: 'var(--status-delayed)' }}>{t('reg.contracts.behind')}</div>}
                          </>
                        ) : (
                          <StatusPill status="done">{t('reg.contracts.delivered')}</StatusPill>
                        )}
                      </td>
                      <td className="op-end">
                        {/* a real link, so the file is reachable by keyboard — an onClick <tr> is not */}
                        <a className="acc-open" href={href}>
                          {t('reg.contracts.openFile')}
                          <Icon name="chevronEnd" size={12} strokeWidth={2} className="op-chev-fwd" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            total={total}
            start={start}
            end={end}
            lang={lang}
          />
        </>
      )}
    </div>
  );
}
