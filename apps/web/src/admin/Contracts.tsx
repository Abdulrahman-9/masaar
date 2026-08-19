import { useMemo, useState } from 'react';
import { guaranteeExpiringSoon } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { fmtCount, fmtMoney } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { todayIso, useStore, type ContractState } from '../store';
import { EmptyState } from '../registry/EmptyState';
import { FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { exportCsv, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { useAdminUi } from './AdminShell';
import { capHealth, contractProgress, currentStageKey, scheduleVariancePct, stageLabel, type CapHealth } from './contractDerive';

const CAP_PILL = { ok: 'done', risk: 'risk', breach: 'blocked' } as const;
/** Best → worst, so the tri-state sort reads ok → risk → breach ascending. */
const HEALTH_ORDER: CapHealth[] = ['ok', 'risk', 'breach'];

/** '' = every tier, otherwise a single cap-health tier. */
type TierFilter = '' | CapHealth;

/** Post-award contracts registry — classified by worst cap health + lifecycle stage,
 *  each row opening the 360° contract file. Contracts are born of tender ratification;
 *  there is no create action here, so the head carries no primary button (honesty rule). */
export default function Contracts() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const today = todayIso();

  const [q, setQ] = useState('');
  const [tier, setTier] = useState<TierFilter>('');

  const contracts = state.contracts;

  const rows = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return contracts.filter((c) => {
      if (tier && capHealth(c) !== tier) return false;
      if (qn && !(
        c.code.toLowerCase().includes(qn) ||
        c.contractorName.toLowerCase().includes(qn) ||
        c.title.ar.includes(q.trim()) ||
        c.title.en.toLowerCase().includes(qn)
      )) return false;
      return true;
    });
  }, [contracts, tier, q]);

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
    { key: '', label: t('reg.contracts.chipAll'), count: contracts.length, active: tier === '' },
    { key: 'ok', label: t('reg.contracts.cap_ok'), count: contracts.filter((c) => capHealth(c) === 'ok').length, active: tier === 'ok' },
    { key: 'risk', label: t('reg.contracts.cap_risk'), count: contracts.filter((c) => capHealth(c) === 'risk').length, active: tier === 'risk' },
    { key: 'breach', label: t('reg.contracts.cap_breach'), count: contracts.filter((c) => capHealth(c) === 'breach').length, active: tier === 'breach' },
  ];

  // One column contract drives the table and the CSV — labels stay machine field names.
  const csvColumns: ReportColumn<ContractState>[] = [
    { key: 'code', label: 'code', value: (c) => c.code },
    { key: 'title', label: 'title', value: (c) => c.title[lang] },
    { key: 'contractor', label: 'contractor', value: (c) => c.contractorName },
    { key: 'valueUSD', label: 'valueUSD', value: (c) => c.valueUSD, format: 'money', total: true },
    { key: 'health', label: 'health', value: (c) => capHealth(c) },
    { key: 'stage', label: 'stage', value: (c) => currentStageKey(c) ?? 'delivered' },
    { key: 'progressPct', label: 'progressPct', value: (c) => contractProgress(c).pct },
    { key: 'voTotalUSD', label: 'voTotalUSD', value: (c) => c.voTotalUSD },
    { key: 'extensionDays', label: 'extensionDays', value: (c) => c.extensionDays },
    { key: 'ldTotalUSD', label: 'ldTotalUSD', value: (c) => c.ldTotalUSD },
  ];

  const doExport = () => {
    // exports exactly the filtered+sorted view — a local file only, never audited server-side
    exportCsv('masaar-contracts-registry', csvColumns, sorted);
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

      <div className="acc-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('reg.contracts.searchPh')} style={{ width: 300 }} />
        <FilterChips chips={filterChips} onSelect={(key) => setTier(key as TierFilter)} lang={lang} />
      </div>

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
          action={<button className="op-btn-ghost" onClick={() => { setQ(''); setTier(''); }}>{t('reg.contracts.clearFilters')}</button>}
        >
          {t('reg.contracts.noMatch')}
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
                  const health = capHealth(c);
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
                        <StatusPill status={CAP_PILL[health]}>{t(`reg.contracts.cap_${health}`)}</StatusPill>
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
