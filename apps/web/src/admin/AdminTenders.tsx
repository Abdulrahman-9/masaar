import { METHODS, stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DevChip } from '../operator/DevChip';
import { fmtCount, tenderDeviationWd, tenderStatus, type OpStatus } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { PathChip } from '../operator/PathChip';
import { EmptyState } from '../registry/EmptyState';
import { FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { exportCsv, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { hashParam, useHashParams, writeHashParam } from '../registry/useHashParams';
import { calendarOf, currentStage, todayIso, useStore, type Tender } from '../store';
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

  const [q, setQ] = useState('');
  const [method, setMethod] = useState(0);
  const [fieldId, setFieldId] = useState('');

  /**
   * The URL contract (§5-ج). Every clickable statistic in the follow-up room — a KPI tile, a
   * company bar — lands here, and it lands on a registry that is often the screen the reader is
   * already looking at. Reading these once at mount (the defect this wave fixes) would leave the
   * table unchanged; `useHashParams` re-reads them on every `hashchange`.
   */
  const params = useHashParams();
  const opParam = hashParam(params, 'op', state.operators.map((o) => o.id));
  const statusParam = hashParam(params, 'status') as StatusFilter;
  const pendingParam = hashParam(params, 'pending') === '1';

  const [opFilter, setOpFilter] = useState(opParam);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(statusParam);
  useEffect(() => { setOpFilter(opParam); }, [opParam]);
  useEffect(() => { setStatusFilter(statusParam); }, [statusParam]);
  const setOp = (id: string) => { setOpFilter(id); writeHashParam('op', id || null); };
  // choosing a status by hand supersedes the one the link brought, so the hash follows the choice
  const setStatus = (v: StatusFilter) => { setStatusFilter(v); writeHashParam('status', v || null); };

  const qn = q.trim().toLowerCase();

  // Company + method + field + free-text search + the pending gate, before the status chip
  // narrows further — the chip counts read off this set.
  const searched = useMemo(() => state.tenders.filter((tn) => {
    if (opFilter && tn.operatorId !== opFilter) return false;
    if (method !== 0 && tn.methodId !== method) return false;
    if (fieldId && tn.fieldId !== fieldId) return false;
    if (pendingParam && !pendingRatification(tn)) return false;
    if (qn && !(`${tn.code} ${tn.title.ar} ${tn.title.en}`.toLowerCase().includes(qn))) return false;
    return true;
  }), [state.tenders, opFilter, method, fieldId, pendingParam, qn]);

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

  /**
   * The chips: the four statuses as toggles, plus a STANDING chip for each filter the URL brought
   * in. The standing chips carry their own dismiss, and dismissing rewrites the hash — so the
   * reader always sees why the registry is short, can widen it in one click, and the address bar
   * never describes a screen other than the one on it.
   */
  const statusChips: FilterChip[] = [
    { key: '', label: t('reg.atenders.allStatus'), count: searched.length, active: statusFilter === '' },
    ...STATUS_ORDER.map((s) => ({
      key: s,
      label: t(`status.${s}`),
      count: searched.filter((tn) => tenderStatus(tn, today, cal) === s).length,
      active: statusFilter === s,
    })),
  ];
  const linkChips: FilterChip[] = [
    ...(statusFilter === 'open'
      ? [{ key: 'st-open', label: t('reg.atenders.chipOpen'), count: rows.length, active: true, onRemove: () => setStatus('') }]
      : []),
    ...(opFilter
      ? [{ key: 'op', label: t('reg.atenders.chipOp', { name: operatorName(opFilter) }), count: rows.length, active: true, onRemove: () => setOp('') }]
      : []),
    ...(pendingParam
      ? [{ key: 'pending', label: t('reg.atenders.chipPending'), count: rows.length, active: true, onRemove: () => writeHashParam('pending', null) }]
      : []),
  ];

  // One column contract drives the table read-out and the CSV — the export is exactly the sorted, filtered view.
  const csvColumns: ReportColumn<Tender>[] = [
    { key: 'code', label: 'code', value: (tn) => tn.code },
    { key: 'title', label: 'title', value: (tn) => tn.title[lang] },
    { key: 'method', label: 'method', value: (tn) => tn.methodId },
    { key: 'stage', label: 'stage', value: (tn) => currentStage(tn)?.key ?? 'completed' },
    { key: 'status', label: 'status', value: (tn) => tenderStatus(tn, today, cal) },
    { key: 'deviationWd', label: 'deviationWd', value: (tn) => tenderDeviationWd(tn, today, cal) },
    { key: 'ratification', label: 'ratification', value: (tn) => tn.ratification?.status ?? '' },
  ];

  const doExport = () => {
    exportCsv('masaar-tenders-registry', csvColumns, sorted);
    toast(t('reg.atenders.toastExport'));
  };

  const clearFilters = () => {
    setQ(''); setMethod(0); setFieldId(''); setStatusFilter(''); setOpFilter('');
    // one hash rewrite for the three link-borne filters — «أزل كل المرشّحات» has to clear the
    // address too, or the next render re-seeds the filters it just cleared
    const h = window.location.hash;
    window.location.hash = h.includes('?') ? h.slice(0, h.indexOf('?')) : h;
  };

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
        <FilterChips chips={statusChips} onSelect={(key) => setStatus(key as StatusFilter)} lang={lang} />
        {linkChips.length > 0 && <FilterChips chips={linkChips} onSelect={() => {}} lang={lang} />}
        {/* filter by operating company — the destination every per-company chart row lands on */}
        {state.operators.length > 0 && (
          <select
            className="op-filter-select"
            value={opFilter}
            aria-label={t('fields.allOperators')}
            onChange={(e) => setOp(e.target.value)}
          >
            <option value="">{t('fields.allOperators')}</option>
            {state.operators.map((o) => <option key={o.id} value={o.id}>{lang === 'ar' ? o.name : o.nameEn ?? o.name}</option>)}
          </select>
        )}
        {/* filter by the named procurement path (§11), not a bare id nobody memorises */}
        <select
          className="op-filter-select"
          value={method}
          aria-label={t('admin.allMethods')}
          onChange={(e) => setMethod(Number(e.target.value))}
        >
          <option value={0}>{t('admin.allMethods')}</option>
          {METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {`${String(m.id).padStart(2, '0')} — ${m[lang]} (§${m.scpp})`}
            </option>
          ))}
        </select>
        {/* Filter by oil field (client request 8): the portfolio is read field by field, and the
            field registry is empty in API mode — an empty select is a control with nothing to
            choose, so it is simply not rendered. */}
        {state.fields.length > 0 && (
          <select
            className="op-filter-select"
            value={fieldId}
            aria-label={t('approvals.allFields')}
            onChange={(e) => setFieldId(e.target.value)}
          >
            <option value="">{t('approvals.allFields')}</option>
            {state.fields.map((f) => (
              <option key={f.id} value={f.id}>{lang === 'ar' ? f.name : f.nameEn ?? f.name}</option>
            ))}
          </select>
        )}
      </div>

      {state.tenders.length === 0 ? (
        <EmptyState mode="empty">{t('reg.atenders.emptyStore')}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={<button className="op-btn-ghost" onClick={clearFilters}>{t('reg.atenders.clearFilters')}</button>}
        >
          {t('reg.atenders.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('tenders.colTender')} sortKey="tender" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('tenders.colPath')}</th>
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
