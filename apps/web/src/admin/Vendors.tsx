import { StatusPill } from '@masaar/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount } from '../operator/derive';
import { EmptyState } from '../registry/EmptyState';
import { FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { exportCsv, type ReportColumn } from '../registry/report';
import { ScoreBar } from '../registry/ScoreBar';
import { SearchBox } from '../registry/SearchBox';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { todayIso, useStore, type VendorState } from '../store';
import { useAdminUi } from './AdminShell';
import { deriveParticipation, vendorStats, vendorStatus, type VendorGovStatus } from './entities';

const STATUS_PILL = { eligible: 'done', suspended: 'delayed', banned: 'blocked' } as const;

/** '' = all, 'moo' = MoO-list membership, or one of the governance statuses. */
type VendorFilter = '' | 'moo' | VendorGovStatus;

/** A registry row: the vendor plus its derived governance status and participation counts. */
interface Row {
  vendor: VendorState;
  status: VendorGovStatus;
  bids: number;
  wins: number;
}

/** Entity registry — classification, capability, participation, per-row 360° file. */
export default function Vendors() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const today = todayIso();

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<VendorFilter>('');

  // One pass over the store: status + participation counts are the shape the table,
  // KPIs, sort and export all read from.
  const derived = useMemo<Row[]>(() => state.vendors.map((v) => {
    const stats = vendorStats(deriveParticipation(state, v, today));
    return { vendor: v, status: vendorStatus(v, today), bids: stats.bids, wins: stats.wins };
  }), [state, today]);

  const qn = q.trim().toLowerCase();
  const rows = useMemo(() => derived.filter((r) => {
    if (qn && !r.vendor.name.toLowerCase().includes(qn)) return false;
    if (filter === 'moo') return r.vendor.mooListed;
    if (filter) return r.status === filter;
    return true;
  }), [derived, qn, filter]);

  // Name is Arabic-collated; participation sorts on the real bid count.
  const compare = useMemo(() => ({
    name: arCompare<Row>((r) => r.vendor.name),
    bids: (a: Row, b: Row) => a.bids - b.bids,
  }), []);
  const { sorted, sortKey, dir, toggle } = useTableSort(rows, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  // KPIs read the filtered view — «what the user sees». All counts come from real
  // store fields (MoO membership, derived governance status). Restricted = suspended + banned.
  const restricted = rows.filter((r) => r.status !== 'eligible').length;
  const kpis = [
    { l: t('reg.vendors.kpiShown'), v: rows.length, tone: undefined as string | undefined },
    { l: t('vendors.moo'), v: rows.filter((r) => r.vendor.mooListed).length, tone: undefined },
    { l: t('entity.status_eligible'), v: rows.filter((r) => r.status === 'eligible').length, tone: undefined },
    { l: t('reg.vendors.kpiRestricted'), v: restricted, tone: restricted > 0 ? 'var(--status-delayed)' : undefined },
  ];

  const filterChips: FilterChip[] = [
    { key: '', label: t('reg.vendors.all'), count: derived.length, active: filter === '' },
    { key: 'moo', label: t('vendors.moo'), count: derived.filter((r) => r.vendor.mooListed).length, active: filter === 'moo' },
    { key: 'eligible', label: t('entity.status_eligible'), count: derived.filter((r) => r.status === 'eligible').length, active: filter === 'eligible' },
    { key: 'suspended', label: t('entity.status_suspended'), count: derived.filter((r) => r.status === 'suspended').length, active: filter === 'suspended' },
    { key: 'banned', label: t('entity.status_banned'), count: derived.filter((r) => r.status === 'banned').length, active: filter === 'banned' },
  ];

  // One column contract drives the on-screen table and the CSV — the exported rows
  // are the filtered/sorted set, so the export matches the view.
  const csvColumns: ReportColumn<Row>[] = [
    { key: 'name', label: 'name', value: (r) => r.vendor.name },
    { key: 'mooListed', label: 'mooListed', value: (r) => String(r.vendor.mooListed) },
    { key: 'status', label: 'status', value: (r) => r.status },
    { key: 'techScore', label: 'techScore', value: (r) => r.vendor.techScore },
    { key: 'financialScore', label: 'financialScore', value: (r) => r.vendor.financialScore },
    { key: 'hseScore', label: 'hseScore', value: (r) => r.vendor.hseScore },
    { key: 'bids', label: 'bids', value: (r) => r.bids },
    { key: 'wins', label: 'wins', value: (r) => r.wins },
    { key: 'banUntil', label: 'banUntil', value: (r) => r.vendor.banUntil ?? '' },
  ];

  const doExport = () => {
    exportCsv('masaar-vendor-registry', csvColumns, sorted);
    // local file export only — never written to the server audit log
    toast(t('reg.vendors.toastExport'));
  };

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('vendors.title')}</h1>
          <div className="op-page__sub">{t('vendors.hint')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="op-btn-ghost" onClick={doExport}>{t('reg.vendors.exportCsv')}</button>
        </div>
      </div>

      <div className="ad-kpis" style={{ marginTop: 4 }}>
        {kpis.map((k) => (
          <div key={k.l} className="ad-kpi">
            <div className="ad-kpi__head"><span className="ad-kpi__l">{k.l}</span></div>
            <div className="ad-kpi__row"><span className="ad-kpi__v" style={k.tone ? { color: k.tone } : undefined}>{fmtCount(k.v, lang)}</span></div>
          </div>
        ))}
      </div>

      <div className="acc-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('reg.vendors.searchPh')} style={{ width: 280 }} />
        <FilterChips chips={filterChips} onSelect={(key) => setFilter(key as VendorFilter)} lang={lang} />
      </div>

      {state.vendors.length === 0 ? (
        <EmptyState mode="empty">{t('reg.vendors.emptyStore')}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={<button className="op-btn-ghost" onClick={() => { setQ(''); setFilter(''); }}>{t('reg.vendors.clearFilters')}</button>}
        >
          {t('reg.vendors.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('vendors.name')} sortKey="name" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('vendors.moo')}</th>
                  <th style={{ width: 260 }}>{t('vendors.scores')}</th>
                  <th>{t('vendors.eligibility')}</th>
                  <SortableTh label={t('entity.participation')} sortKey="bids" active={sortKey} dir={dir} onToggle={toggle} />
                  <th className="op-end" style={{ width: 120 }}>{t('tenders.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.vendor.id} className="op-tbl__row">
                    <td><div className="op-tbl__name" dir="auto">{r.vendor.name}</div></td>
                    <td><StatusPill status={r.vendor.mooListed ? 'done' : 'planned'}>{r.vendor.mooListed ? t('vendors.mooYes') : t('vendors.mooNo')}</StatusPill></td>
                    <td>
                      <ScoreBar label={t('vendors.tech')} value={r.vendor.techScore} />
                      <ScoreBar label={t('vendors.fin')} value={r.vendor.financialScore} />
                      <ScoreBar label={t('vendors.hse')} value={r.vendor.hseScore} />
                    </td>
                    <td>
                      <StatusPill status={STATUS_PILL[r.status]}>{t(`entity.status_${r.status}`)}</StatusPill>
                      {r.status === 'banned' && r.vendor.banUntil && <div className="op-tbl__code">{t('vendors.until')} {r.vendor.banUntil}</div>}
                    </td>
                    <td>
                      <span className="op-code" style={{ fontSize: 12 }}>{fmtCount(r.bids, lang)}</span> {t('entity.bids')} · <span className="op-code" style={{ fontSize: 12, color: 'var(--status-done)' }}>{fmtCount(r.wins, lang)}</span> {t('entity.wins')}
                    </td>
                    <td className="op-end">
                      {/* a real link — the file is reachable by keyboard, unlike a bare <tr onClick> */}
                      <a className="op-btn-nav" href={`#/admin/entities/${r.vendor.id}`}>{t('entity.openFile')}</a>
                    </td>
                  </tr>
                ))}
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
