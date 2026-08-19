import { METHODS, stageByKey } from '@masaar/scpp-rules';
import { KpiTile, StatusPill } from '@masaar/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { calendarOf, currentStage, todayIso, useStore, type Tender } from '../store';
import { EmptyState } from '../registry/EmptyState';
import { FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { SearchBox } from '../registry/SearchBox';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { DevChip } from './DevChip';
import {
  deriveTasks,
  fmtCount,
  progressPct,
  tenderDeviationWd,
  tenderStatus,
  type OpStatus,
  type TaskGroup,
} from './derive';
import { Icon } from './Icon';
import { useOperatorUi } from './OperatorShell';
import { PathChip } from './PathChip';

const PROGRESS_COLOR: Record<OpStatus, string> = {
  progress: 'var(--status-progress)',
  risk: 'var(--status-risk)',
  delayed: 'var(--status-delayed)',
  done: 'var(--status-done)',
};

/** The status vocabulary a live tender can carry — the same set tenderStatus derives. */
const STATUSES: OpStatus[] = ['progress', 'risk', 'delayed', 'done'];

/** '' = every status, otherwise one derived OpStatus. */
type StatusFilter = '' | OpStatus;

export default function TendersList() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { openQuickLook } = useOperatorUi();
  const today = todayIso();
  const cal = calendarOf(state);

  const [q, setQ] = useState('');
  const [method, setMethod] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');

  // One derived task per open tender (its current stage) → its urgency group.
  // Reused, never re-derived, so the KPI counts stay honest to deriveTasks.
  const taskGroupById = useMemo(() => {
    const m = new Map<string, TaskGroup>();
    for (const tk of deriveTasks(state, today, cal)) m.set(tk.tender.id, tk.group);
    return m;
  }, [state, today]);

  const qn = q.trim().toLowerCase();
  const rows = useMemo(
    () =>
      state.tenders.filter((x) => {
        if (qn && !(`${x.title[lang]} ${x.code}`.toLowerCase().includes(qn))) return false;
        if (method !== 0 && x.methodId !== method) return false;
        if (statusFilter && tenderStatus(x, today, cal) !== statusFilter) return false;
        return true;
      }),
    [state.tenders, qn, method, statusFilter, lang, today],
  );

  // KPIs read from the filtered set — what the screen shows is what they count.
  const lateCount = rows.filter((x) => taskGroupById.get(x.id) === 'late').length;
  const dueWeekCount = rows.filter((x) => taskGroupById.get(x.id) === 'week').length;

  // Sort: code (Arabic-aware collation) and schedule progress. "none" restores filter order.
  const compare = useMemo(
    () => ({
      code: arCompare<Tender>((x) => x.code),
      progress: (a: Tender, b: Tender) => progressPct(a) - progressPct(b),
    }),
    [],
  );
  const { sorted, sortKey, dir, toggle } = useTableSort(rows, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  // Chip counts span every tender (one dimension of the filter), like the access registry.
  const statusCount = (s: OpStatus) => state.tenders.filter((x) => tenderStatus(x, today, cal) === s).length;
  const filterChips: FilterChip[] = [
    { key: '', label: t('reg.tlist.allStatus'), count: state.tenders.length, active: statusFilter === '' },
    ...STATUSES.map((s) => ({ key: s, label: t(`status.${s}`), count: statusCount(s), active: statusFilter === s })),
  ];

  const clearFilters = () => {
    setQ('');
    setMethod(0);
    setStatusFilter('');
  };

  return (
    <div className="op-page op-page--tenders">
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('tenders.title')}</h1>
          <div className="op-page__sub">{t('reg.tlist.sub', { n: fmtCount(state.tenders.length, lang) })}</div>
        </div>
        <a className="op-btn-primary" href="#/operator/new">
          <Icon name="plus" size={14} />
          {t('onav.request')}
        </a>
      </div>

      <div className="kpis m-skin">
        <KpiTile label={t('reg.tlist.kpiTotal')} value={rows.length} />
        <KpiTile label={t('reg.tlist.kpiLate')} value={lateCount} />
        <KpiTile label={t('reg.tlist.kpiDueWeek')} value={dueWeekCount} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBlock: '16px 12px' }}>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={t('reg.tlist.searchPh')}
          style={{ width: 280, marginInlineStart: 0 }}
        />
        <FilterChips chips={filterChips} onSelect={(key) => setStatusFilter(key as StatusFilter)} lang={lang} />
        <select
          className="reg-select"
          value={method}
          aria-label={t('reg.tlist.allMethods')}
          onChange={(e) => setMethod(Number(e.target.value))}
          style={{ marginInlineStart: 'auto' }}
        >
          <option value={0}>{t('reg.tlist.allMethods')}</option>
          {METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {`${String(m.id).padStart(2, '0')} — ${m[lang]} (§${m.scpp})`}
            </option>
          ))}
        </select>
      </div>

      {state.tenders.length === 0 ? (
        <EmptyState mode="empty">{t('reg.tlist.emptyStore')}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={
            <button className="op-btn-ghost" onClick={clearFilters}>
              {t('reg.tlist.clearFilters')}
            </button>
          }
        >
          {t('reg.tlist.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('tenders.colTender')} sortKey="code" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('tenders.colPath')}</th>
                  <th>{t('tenders.colStage')}</th>
                  <SortableTh
                    label={t('tenders.colProgress')}
                    sortKey="progress"
                    active={sortKey}
                    dir={dir}
                    onToggle={toggle}
                    style={{ width: 160 }}
                  />
                  <th>{t('tenders.colStatus')}</th>
                  <th className="op-end">{t('tenders.colDeviation')}</th>
                  <th className="op-end" style={{ width: 190 }}>
                    {t('tenders.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((x) => {
                  const cur = currentStage(x);
                  const status = tenderStatus(x, today, cal);
                  const pct = progressPct(x);
                  const href = `#/operator/t/${x.id}`;
                  return (
                    <tr key={x.id} className="op-tbl__row">
                      <td>
                        <div className="op-tbl__name" dir="auto">
                          {x.title[lang]}
                        </div>
                        <div className="op-tbl__code">{x.code}</div>
                      </td>
                      <td>
                        <PathChip id={x.methodId} lang={lang} />
                      </td>
                      <td>{cur ? stageByKey(cur.key)?.[lang] ?? cur.key : t('tenders.completed')}</td>
                      <td>
                        <div className="op-prog">
                          <div className="op-prog__track">
                            <div
                              className="op-prog__fill"
                              style={{ width: `${pct}%`, background: PROGRESS_COLOR[status] }}
                            />
                          </div>
                          <span className="op-prog__v">{pct}%</span>
                        </div>
                      </td>
                      <td>
                        <StatusPill status={status}>{t(`status.${status}`)}</StatusPill>
                      </td>
                      <td className="op-end">
                        <DevChip wd={tenderDeviationWd(x, today, cal)} />
                      </td>
                      <td className="op-end">
                        <div className="op-rowbtns">
                          <button className="op-btn-ghost" onClick={() => openQuickLook(x.id)}>
                            <Icon name="eye" size={13} />
                            {t('tenders.preview')}
                          </button>
                          {/* a real link so the file is keyboard-reachable — a bare <tr onClick> is not */}
                          <a className="op-btn-nav" href={href}>
                            {t('tenders.file')}
                          </a>
                        </div>
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
