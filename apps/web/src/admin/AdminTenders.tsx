import { METHODS, stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DevChip } from '../operator/DevChip';
import { fmtCount, fmtMoney, tenderDeviationWd, tenderStatus, type OpStatus } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { PathChip } from '../operator/PathChip';
import { EmptyState } from '../registry/EmptyState';
import { inDateRange, inValueRange, rangeInverted, dateRangeInverted } from '../registry/filters';
import { activeFilterChips, FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { RangeFilter } from '../registry/RangeFilter';
import { exportCsv, reportStamp, type FilterLabels, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SelectFilter } from '../registry/SelectFilter';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { SCOPE_KEYS, useFilterParams } from '../registry/useHashParams';
import { calendarOf, currentStage, tenderApprovalTier, todayIso, useStore, type Tender } from '../store';
import { useStampWords } from '../registry/useStampWords';
import { useAdminUi } from './AdminShell';
import { pendingRatification } from './adminDerive';

/** The four live statuses a tender can hold (from tenderStatus), in reading order. */
const STATUS_ORDER: OpStatus[] = ['progress', 'risk', 'delayed', 'done'];
/**
 * `open` is not a `tenderStatus` — it is the union of the three live ones, and it exists so the
 * follow-up room's «المناقصات المفتوحة» tile can land on a registry holding EXACTLY the rows it
 * counted. It arrives only through the URL, so it is not offered as a chip beside the four
 * statuses it contains (that would read as a fifth, parallel state); it shows as the removable
 * chip that says why the registry is short.
 */
type StatusFilter = '' | OpStatus | 'open';

export default function AdminTenders() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const today = todayIso();
  const cal = calendarOf(state);
  const words = useStampWords();

  const [q, setQ] = useState('');

  /**
   * The URL contract (§5-ج), now carrying the whole toolbar (client request 7). Every clickable
   * statistic in the follow-up room lands here — often on the screen the reader is already looking
   * at — and every control on this screen writes back, so the address, the table, the counts, the
   * chips and the export stamp are one fact. Reading these once at mount (the defect phase 3 fixed)
   * would leave the table unchanged; `useFilterParams` re-reads them on every `hashchange`.
   */
  const f = useFilterParams();
  const opFilter = f.get('op', state.operators.map((o) => o.id));
  const fieldFilter = f.get('field', state.fields.map((x) => x.id));
  const methodFilter = f.get('method');
  const tierFilter = f.get('tier');
  const scopeFilter = f.get('scope');
  const statusFilter = f.get('status') as StatusFilter;
  const pendingParam = f.get('pending') === '1';
  const vmin = f.get('vmin');
  const vmax = f.get('vmax');
  const dFrom = f.get('from');
  const dTo = f.get('to');

  const valueBad = rangeInverted(vmin, vmax);
  const dateBad = dateRangeInverted(dFrom, dTo);

  const qn = q.trim().toLowerCase();

  // Every dimension EXCEPT the status chips, so the chip counts read off this set — a chip never
  // promises rows the value window or the search has already removed.
  const searched = useMemo(() => state.tenders.filter((tn) => {
    if (opFilter && tn.operatorId !== opFilter) return false;
    if (methodFilter && tn.methodId !== Number(methodFilter)) return false;
    if (fieldFilter && tn.fieldId !== fieldFilter) return false;
    if (tierFilter && tenderApprovalTier(state, tn) !== tierFilter) return false;
    if (scopeFilter && (tn.scope ?? 'OTHER') !== scopeFilter) return false;
    if (!inValueRange(tn.estimatedValueUSD, vmin, vmax)) return false;
    if (!inDateRange(tn.createdOn, dFrom, dTo)) return false;
    if (pendingParam && !pendingRatification(tn)) return false;
    if (qn && !(`${tn.code} ${tn.title.ar} ${tn.title.en}`.toLowerCase().includes(qn))) return false;
    return true;
  }), [state, opFilter, methodFilter, fieldFilter, tierFilter, scopeFilter, vmin, vmax, dFrom, dTo, pendingParam, qn]);

  const rows = useMemo(
    () => (statusFilter
      ? searched.filter((tn) => (statusFilter === 'open'
        ? currentStage(tn) !== undefined
        : tenderStatus(tn, today, cal) === statusFilter))
      : searched),
    [searched, statusFilter, today],
  );

  // Tri-state sort — title is Arabic-collated; deviation sorts by signed working days.
  const compare = useMemo(() => ({
    tender: arCompare<Tender>((tn) => tn.title[lang]),
    value: (a: Tender, b: Tender) => a.estimatedValueUSD - b.estimatedValueUSD,
    deviation: (a: Tender, b: Tender) => tenderDeviationWd(a, today, cal) - tenderDeviationWd(b, today, cal),
  }), [lang, today]);
  const { sorted, sortKey, dir, toggle } = useTableSort(rows, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  // KPIs read the filtered set — as you narrow the registry the counts follow the view (honest, derived).
  const pending = rows.filter(pendingRatification).length;
  const late = rows.filter((tn) => tenderStatus(tn, today, cal) === 'delayed').length;
  const done = rows.filter((tn) => tenderStatus(tn, today, cal) === 'done').length;
  const kpis = [
    { l: t('reg.atenders.kpiTotal'), v: rows.length, tone: undefined as string | undefined },
    { l: t('reg.atenders.kpiPending'), v: pending, tone: pending > 0 ? 'var(--brand-amber-700)' : undefined },
    { l: t('reg.atenders.kpiLate'), v: late, tone: late > 0 ? 'var(--status-delayed)' : undefined },
    { l: t('reg.atenders.kpiDone'), v: done, tone: done > 0 ? 'var(--status-done)' : undefined },
  ];

  const operatorName = (id: string) => {
    const o = state.operators.find((x) => x.id === id);
    return o ? (lang === 'ar' ? o.name : o.nameEn ?? o.name) : id;
  };
  const fieldName = (id: string) => {
    const x = state.fields.find((y) => y.id === id);
    return x ? (lang === 'ar' ? x.name : x.nameEn ?? x.name) : id;
  };
  const methodName = (id: string) => {
    const m = METHODS.find((x) => String(x.id) === id);
    return m ? `${String(m.id).padStart(2, '0')} — ${m[lang]}` : id;
  };

  /**
   * ONE declaration of every narrowing this screen can hold, in reading order. It drives the
   * removable chips AND the export/print stamp, so the registry cannot show a filter it does not
   * print, nor print one it does not show (design principle 4).
   */
  const labels: FilterLabels = {
    q: { label: t('reg.stamp.dim.q') },
    op: { label: t('reg.stamp.dim.op'), value: operatorName },
    field: { label: t('reg.stamp.dim.field'), value: fieldName },
    method: { label: t('reg.stamp.dim.method'), value: methodName },
    tier: { label: t('reg.stamp.dim.tier'), value: (v) => t(`tier.pill.${v}`) },
    scope: { label: t('reg.stamp.dim.scope'), value: (v) => t(`compliance.scope.${v}`) },
    status: { label: t('reg.stamp.dim.status'), value: (v) => (v === 'open' ? t('reg.atenders.chipOpen') : t(`status.${v}`)) },
    pending: { label: '', value: () => t('reg.atenders.chipPending') },
    vmin: { label: t('reg.stamp.dim.valueFrom'), value: (v) => fmtMoney(Number(v)) },
    vmax: { label: t('reg.stamp.dim.valueTo'), value: (v) => fmtMoney(Number(v)) },
    from: { label: t('reg.stamp.dim.dateFrom') },
    to: { label: t('reg.stamp.dim.dateTo') },
  };

  /** The EFFECTIVE filter state — including the search box, which lives in local state so a
   *  keystroke does not push a history entry, but which narrows the rows exactly like the rest. */
  const stampParams = useMemo(() => {
    const p = new URLSearchParams();
    if (qn) p.set('q', q.trim());
    if (opFilter) p.set('op', opFilter);
    if (fieldFilter) p.set('field', fieldFilter);
    if (methodFilter) p.set('method', methodFilter);
    if (tierFilter) p.set('tier', tierFilter);
    if (scopeFilter) p.set('scope', scopeFilter);
    if (statusFilter) p.set('status', statusFilter);
    if (pendingParam) p.set('pending', '1');
    if (vmin) p.set('vmin', vmin);
    if (vmax) p.set('vmax', vmax);
    if (dFrom) p.set('from', dFrom);
    if (dTo) p.set('to', dTo);
    return p;
  }, [q, qn, opFilter, fieldFilter, methodFilter, tierFilter, scopeFilter, statusFilter, pendingParam, vmin, vmax, dFrom, dTo]);

  const stamp = reportStamp({ params: stampParams, labels, lang, rows: sorted.length, today, words });

  const statusChips: FilterChip[] = [
    { key: '', label: t('reg.atenders.allStatus'), count: searched.length, active: statusFilter === '' },
    ...STATUS_ORDER.map((s) => ({
      key: s,
      label: t(`status.${s}`),
      count: searched.filter((tn) => tenderStatus(tn, today, cal) === s).length,
      active: statusFilter === s,
    })),
  ];
  /** Every ACTIVE dimension, each carrying its own dismiss — «q» clears the box, the rest the hash. */
  const activeChips = activeFilterChips(stampParams, labels, lang, (name) => {
    if (name === 'q') setQ(''); else f.set(name as 'op', '');
  });

  // One column contract drives the table read-out and the CSV — the export is exactly the sorted, filtered view.
  const csvColumns: ReportColumn<Tender>[] = [
    { key: 'code', label: 'code', value: (tn) => tn.code },
    { key: 'title', label: 'title', value: (tn) => tn.title[lang] },
    { key: 'operator', label: 'operator', value: (tn) => (tn.operatorId ? operatorName(tn.operatorId) : '') },
    { key: 'field', label: 'field', value: (tn) => (tn.fieldId ? fieldName(tn.fieldId) : '') },
    { key: 'method', label: 'method', value: (tn) => tn.methodId },
    { key: 'scope', label: 'scope', value: (tn) => tn.scope ?? 'OTHER' },
    { key: 'estimatedValueUSD', label: 'estimatedValueUSD', value: (tn) => tn.estimatedValueUSD, format: 'money', total: true },
    { key: 'tier', label: 'tier', value: (tn) => tenderApprovalTier(state, tn) },
    { key: 'createdOn', label: 'createdOn', value: (tn) => tn.createdOn, format: 'date' },
    { key: 'stage', label: 'stage', value: (tn) => currentStage(tn)?.key ?? 'completed' },
    { key: 'status', label: 'status', value: (tn) => tenderStatus(tn, today, cal) },
    { key: 'deviationWd', label: 'deviationWd', value: (tn) => tenderDeviationWd(tn, today, cal) },
    { key: 'ratification', label: 'ratification', value: (tn) => tn.ratification?.status ?? '' },
  ];

  const doExport = () => {
    exportCsv('masaar-tenders-registry', csvColumns, sorted, stamp);
    toast(t('reg.atenders.toastExport'));
  };

  const clearFilters = () => { setQ(''); f.clear(); };

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('admin.allTenders')}</h1>
          <div className="op-page__sub">{t('reg.atenders.sub', { n: fmtCount(state.tenders.length, lang) })}</div>
          {/* Client request 8 / ق4 — «المطابقة» is stated in one visible line rather than left to
              be inferred from a column header; the pills and the chip carry the same arithmetic
              in their tooltips, so the definition and the computation cannot drift apart. */}
          <div className="op-page__def">{t('match.def')}</div>
        </div>
        {/* Admin reviews, never creates — no primary. The export mirrors the filtered rows on screen. */}
        <button className="op-btn-ghost" onClick={doExport}>{t('reg.atenders.exportCsv')}</button>
      </div>

      <div className="ad-kpis" style={{ marginTop: 4 }}>
        {kpis.map((k) => (
          <div key={k.l} className="ad-kpi">
            <div className="ad-kpi__head"><span className="ad-kpi__l">{k.l}</span></div>
            <div className="ad-kpi__row">
              <span className="ad-kpi__v" style={k.tone ? { color: k.tone } : undefined}>{fmtCount(k.v, lang)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="acc-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('reg.atenders.searchPh')} style={{ width: 280 }} />
        <FilterChips chips={statusChips} onSelect={(key) => f.set('status', key)} lang={lang} />
        {/* filter by operating company — the destination every per-company chart row lands on */}
        <SelectFilter
          allLabel={t('fields.allOperators')}
          value={opFilter}
          hideWhenEmpty
          onChange={(v) => f.set('op', v)}
          options={state.operators.map((o) => ({ value: o.id, label: lang === 'ar' ? o.name : o.nameEn ?? o.name }))}
        />
        {/* Filter by oil field (client request 8): the portfolio is read field by field, and the
            field registry is empty in API mode — an empty select is a control with nothing to
            choose, so it is simply not rendered. */}
        <SelectFilter
          allLabel={t('approvals.allFields')}
          value={fieldFilter}
          hideWhenEmpty
          onChange={(v) => f.set('field', v)}
          options={state.fields.map((x) => ({ value: x.id, label: lang === 'ar' ? x.name : x.nameEn ?? x.name }))}
        />
        {/* filter by the named procurement path (§11), not a bare id nobody memorises */}
        <SelectFilter
          allLabel={t('admin.allMethods')}
          value={methodFilter}
          onChange={(v) => f.set('method', v)}
          options={METHODS.map((m) => ({ value: String(m.id), label: `${String(m.id).padStart(2, '0')} — ${m[lang]} (§${m.scpp})` }))}
        />
        {/* request 7 — the approving body, derived from the value against the GLOBAL ladder (ق1) */}
        <SelectFilter
          allLabel={t('reg.atenders.allTiers')}
          value={tierFilter}
          onChange={(v) => f.set('tier', v)}
          options={(['OPERATOR', 'JMC', 'MDOC'] as const).map((x) => ({ value: x, label: t(`tier.pill.${x}`) }))}
        />
        {/* request 7 — the §9 work scope; a request with none recorded reads as «أخرى», the same
            default `CREATE_TENDER` applies, so the four options partition the registry exactly */}
        <SelectFilter
          allLabel={t('reg.atenders.allScopes')}
          value={scopeFilter}
          onChange={(v) => f.set('scope', v)}
          options={SCOPE_KEYS.map((s) => ({ value: s, label: t(`compliance.scope.${s}`) }))}
        />
      </div>

      <div className="acc-filters" style={{ marginBlock: '0 12px' }}>
        <RangeFilter
          id="atn-val" kind="money" label={t('reg.atenders.rangeValue')}
          min={vmin} max={vmax} inverted={valueBad}
          onMin={(v) => f.set('vmin', v)} onMax={(v) => f.set('vmax', v)}
        />
        <RangeFilter
          id="atn-date" kind="date" label={t('reg.atenders.rangeDate')}
          min={dFrom} max={dTo} inverted={dateBad}
          onMin={(v) => f.set('from', v)} onMax={(v) => f.set('to', v)}
        />
      </div>

      {activeChips.length > 0 && (
        <div className="acc-filters" style={{ marginBlock: '0 10px' }}>
          <FilterChips chips={activeChips} onSelect={() => {}} lang={lang} />
          <button className="op-btn-ghost" onClick={clearFilters}>{t('reg.atenders.clearFilters')}</button>
        </div>
      )}

      {/* WYSIWYG (design principle 4): the exact sentence the CSV and the printed page will carry,
          shown before either is produced — the reader can check the claim, not take it on trust. */}
      <div className="reg-stamp">{stamp}</div>

      {state.tenders.length === 0 ? (
        <EmptyState mode="empty">{t('reg.atenders.emptyStore')}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={<button className="op-btn-ghost" onClick={clearFilters}>{t('reg.atenders.clearFilters')}</button>}
        >
          {valueBad || dateBad ? t('reg.range.invertedBody') : t('reg.atenders.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('tenders.colTender')} sortKey="tender" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('tenders.colPath')}</th>
                  <SortableTh label={t('approvals.colValue')} sortKey="value" active={sortKey} dir={dir} onToggle={toggle} className="op-end" style={{ width: 140 }} />
                  <th>{t('tenders.colStage')}</th>
                  <th>{t('tenders.colStatus')}</th>
                  <SortableTh label={t('tenders.colDeviation')} sortKey="deviation" active={sortKey} dir={dir} onToggle={toggle} className="op-end" />
                  <th>{t('adtenders.colRatify')}</th>
                  <th style={{ width: 150 }} className="op-end" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((tender) => {
                  const cur = currentStage(tender);
                  const status = tenderStatus(tender, today, cal);
                  return (
                    <tr key={tender.id} className="op-tbl__row">
                      <td>
                        <div className="op-tbl__name" dir="auto">{tender.title[lang]}</div>
                        <div className="op-tbl__code">{tender.code}</div>
                      </td>
                      <td><PathChip id={tender.methodId} lang={lang} /></td>
                      <td className="op-end mono">{fmtMoney(tender.estimatedValueUSD)}</td>
                      <td>{cur ? stageByKey(cur.key)?.[lang] : t('tenders.completed')}</td>
                      <td><StatusPill status={status} title={t(`match.status.${status}`)}>{t(`status.${status}`)}</StatusPill></td>
                      <td className="op-end"><DevChip wd={tenderDeviationWd(tender, today, cal)} /></td>
                      <td>
                        {tender.ratification ? (
                          <StatusPill status={tender.ratification.status === 'ratified' ? 'done' : 'delayed'}>{t(`review.${tender.ratification.status}`)}</StatusPill>
                        ) : (
                          <span className="op-dev op-dev--none">—</span>
                        )}
                      </td>
                      <td className="op-end">
                        {/* a real link, so review is reachable by keyboard — an onClick <tr> is not */}
                        <a className="acc-open" href={`#/admin/review/${tender.id}`}>
                          {t('reg.atenders.openReview')}
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
