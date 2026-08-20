import { stageByKey, type ApprovalTier } from '@masaar/scpp-rules';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiMode } from '../config';
import { fmtCount, fmtMoney } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { EmptyState } from '../registry/EmptyState';
import { FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { exportCsv, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SectionExplainer } from '../registry/SectionExplainer';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { hashParam, useHashParams, writeHashParam } from '../registry/useHashParams';
import { currentStage, todayIso, useStore } from '../store';
import { approvalChain, awaitingTier, ratifiedInMonth, type ApprovalRow } from './adminDerive';
import { useAdminUi } from './AdminShell';
import { TierPill } from './TierPill';

/** '' = both gated tiers, else one of them. ط1 is never in this registry — it opens no gate. */
type TierFilter = '' | Exclude<ApprovalTier, 'OPERATOR'>;
const GATED: Exclude<ApprovalTier, 'OPERATOR'>[] = ['JMC', 'MDOC'];

/** Ladder order for the sortable tier column — the two gates in ascending authority. */
const TIER_RANK: Record<string, number> = { JMC: 1, MDOC: 2 };

/**
 * «سلسلة الموافقات» — the approval chain (client decision ق1, replacing the MCT screen per ق3).
 *
 * The client does not run an abstract cost cycle; it runs a named chain of approving bodies, and
 * this is that chain made visible: every request whose estimated value climbs past the operating
 * company's own authority, the body whose signature it waits on, and where its decision stands.
 * Nothing here is stored — the tier is derived from the value against the GLOBAL ladder, so the
 * screen re-sorts itself the moment a ceiling moves, and no row can claim an approval the store
 * cannot vouch for.
 */
export default function Approvals() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const today = todayIso();
  const tiers = state.approvalTiers;

  const [q, setQ] = useState('');
  /**
   * The `?tier=` deep link — the follow-up room's tiles and the donut's legend land here already
   * narrowed to the band they counted. It carried the same mount-only defect `Fields.tsx` did:
   * moving from `?tier=JMC` to `?tier=MDOC` without leaving the screen changed the address and
   * nothing else. `useHashParams` makes it re-sync, and `OPERATOR` is rejected by this screen's
   * own set because the chain, by definition (ق1), never holds a ط1 row.
   */
  const params = useHashParams();
  const tierParam = hashParam(params, 'tier') as ApprovalTier | '';
  const seedTier: TierFilter = tierParam === 'JMC' || tierParam === 'MDOC' ? tierParam : '';
  const [tierFilter, setTierFilter] = useState<TierFilter>(seedTier);
  useEffect(() => { setTierFilter(seedTier); }, [seedTier]);
  const setTier = (v: TierFilter) => { setTierFilter(v); writeHashParam('tier', v || null); };
  /**
   * `?pending=1` — the gate that makes this screen able to HOLD what the follow-up room's
   * «بانتظار موافقة …» tiles counted. Those tiles count `decision === 'pending'` within a band;
   * `?tier=JMC` alone opens the whole band, ratified and returned requests included, so the tile
   * said «1» and the registry listed «2» the moment anything in the band was decided. The
   * parameter is already in the §5-ج whitelist; this screen simply had no reader for it.
   *
   * It is URL-borne only — never offered as a toggle beside the tier chips, because «awaiting a
   * decision» is not a fourth band; it shows as the removable chip that says why the list is short.
   */
  const pendingOnly = hashParam(params, 'pending') === '1';
  const [operatorId, setOperatorId] = useState('');
  const [fieldId, setFieldId] = useState('');

  const chain = useMemo(() => approvalChain(state), [state]);

  const fieldName = (id: string | undefined) => {
    const f = state.fields.find((x) => x.id === id);
    return f ? (lang === 'ar' ? f.name : f.nameEn ?? f.name) : null;
  };
  const operatorName = (id: string | undefined) => {
    const o = state.operators.find((x) => x.id === id);
    return o ? (lang === 'ar' ? o.name : o.nameEn ?? o.name) : null;
  };

  const qn = q.trim().toLowerCase();
  // everything EXCEPT the tier chip — the chip counts read off this set, so a chip never promises
  // rows the pending gate or the search has already removed
  const searched = useMemo(() => chain.filter((r) => {
    if (pendingOnly && r.decision !== 'pending') return false;
    if (operatorId && r.tender.operatorId !== operatorId) return false;
    if (fieldId && r.tender.fieldId !== fieldId) return false;
    if (qn && !(`${r.tender.code} ${r.tender.title.ar} ${r.tender.title.en}`.toLowerCase().includes(qn))) return false;
    return true;
  }), [chain, pendingOnly, operatorId, fieldId, qn]);
  const rows = useMemo(
    () => (tierFilter ? searched.filter((r) => r.tier === tierFilter) : searched),
    [searched, tierFilter],
  );

  const compare = useMemo(() => ({
    tender: arCompare<ApprovalRow>((r) => r.tender.title[lang]),
    value: (a: ApprovalRow, b: ApprovalRow) => a.tender.estimatedValueUSD - b.tender.estimatedValueUSD,
    tier: (a: ApprovalRow, b: ApprovalRow) => (TIER_RANK[a.tier] ?? 0) - (TIER_RANK[b.tier] ?? 0),
  }), [lang]);
  const { sorted, sortKey, dir, toggle } = useTableSort(rows, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  // Every KPI counts the FILTERED rows — narrow the registry and the strip follows it (derived,
  // never a headline the table cannot substantiate).
  const awaitingJmc = awaitingTier(rows, 'JMC').length;
  const awaitingMdoc = awaitingTier(rows, 'MDOC').length;
  const ratifiedMonth = ratifiedInMonth(rows, today).length;
  const kpis = [
    { l: t('approvals.kpiJmc'), v: awaitingJmc, tone: awaitingJmc > 0 ? 'var(--brand-amber-700)' : undefined },
    { l: t('approvals.kpiMdoc'), v: awaitingMdoc, tone: awaitingMdoc > 0 ? 'var(--brand-navy-800)' : undefined },
    { l: t('approvals.kpiRatified'), v: ratifiedMonth, tone: undefined as string | undefined },
  ];

  const tierChips: FilterChip[] = [
    { key: '', label: t('approvals.allTiers'), count: searched.length, active: tierFilter === '' },
    ...GATED.map((tier) => ({
      key: tier,
      label: t(`tier.pill.${tier}`),
      count: searched.filter((r) => r.tier === tier).length,
      active: tierFilter === tier,
    })),
  ];
  /** The URL-borne filter, as a standing chip carrying its own dismiss (§5-ج). */
  const linkChips: FilterChip[] = pendingOnly
    ? [{ key: 'pending', label: t('approvals.chipPending'), count: rows.length, active: true, onRemove: () => writeHashParam('pending', null) }]
    : [];

  const csvColumns: ReportColumn<ApprovalRow>[] = [
    { key: 'code', label: 'code', value: (r) => r.tender.code },
    { key: 'title', label: 'title', value: (r) => r.tender.title[lang] },
    { key: 'operator', label: 'operator', value: (r) => operatorName(r.tender.operatorId) ?? '' },
    { key: 'field', label: 'field', value: (r) => fieldName(r.tender.fieldId) ?? '' },
    { key: 'valueUSD', label: 'valueUSD', value: (r) => r.tender.estimatedValueUSD },
    { key: 'tier', label: 'tier', value: (r) => r.tier },
    { key: 'stage', label: 'stage', value: (r) => currentStage(r.tender)?.key ?? 'completed' },
    { key: 'decision', label: 'decision', value: (r) => r.decision },
  ];
  const doExport = () => {
    exportCsv('masaar-approval-chain', csvColumns, sorted);
    toast(t('approvals.toastExport'));
  };

  // «مسح الفلاتر» has to clear the ADDRESS too, or the next render re-seeds the tier it just
  // cleared and the pending gate stays on invisibly
  const clearFilters = () => {
    setQ(''); setTierFilter(''); setOperatorId(''); setFieldId('');
    const h = window.location.hash;
    window.location.hash = h.includes('?') ? h.slice(0, h.indexOf('?')) : h;
  };

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('approvals.title')}</h1>
          <div className="op-page__sub">{t('approvals.sub', { n: fmtCount(chain.length, lang) })}</div>
        </div>
        {/* the admin reads the chain here and decides inside the tender file — no primary act on this screen */}
        <button className="op-btn-ghost" onClick={doExport}>{t('approvals.exportCsv')}</button>
      </div>

      {/* The ladder itself, in the client's own numbers — collapsed, because the registry is the
          subject and the model is one click away for whoever needs it. */}
      <SectionExplainer title={t('approvals.explainTitle')}>
        <p>{t('approvals.explainIntro')}</p>
        <p><strong>{t('tier.pill.OPERATOR')}</strong> — {t('tier.band.OPERATOR', { max: fmtMoney(tiers.operatorMaxUSD) })}</p>
        <p><strong>{t('tier.pill.JMC')}</strong> — {t('tier.band.JMC', { min: fmtMoney(tiers.operatorMaxUSD), max: fmtMoney(tiers.jmcMaxUSD) })}</p>
        <p><strong>{t('tier.pill.MDOC')}</strong> — {t('tier.band.MDOC', { min: fmtMoney(tiers.jmcMaxUSD) })}</p>
        <p>{t('approvals.explainFailClosed')}</p>
      </SectionExplainer>

      {/* Honesty (Design Principle 4): the ladder is client-side configuration — there is no
          server route that issues it yet, and the screen says so rather than implying one. */}
      {isApiMode && <div className="wz-note wz-note--warn" style={{ marginBlockStart: 12 }}>{t('approvals.localLadder')}</div>}

      <div className="ad-kpis ad-kpis--3" style={{ marginBlockStart: 12 }}>
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
        <SearchBox value={q} onChange={setQ} placeholder={t('approvals.searchPh')} style={{ width: 280 }} />
        <FilterChips chips={tierChips} onSelect={(key) => setTier(key as TierFilter)} lang={lang} />
        {linkChips.length > 0 && <FilterChips chips={linkChips} onSelect={() => {}} lang={lang} />}
        {/* the registries are empty in API mode (no /operators, /fields route) — an empty select
            would be a control with nothing to choose, so it is simply not rendered */}
        {state.operators.length > 0 && (
          <select className="op-filter-select" value={operatorId} aria-label={t('fields.allOperators')} onChange={(e) => setOperatorId(e.target.value)}>
            <option value="">{t('fields.allOperators')}</option>
            {state.operators.map((o) => <option key={o.id} value={o.id}>{lang === 'ar' ? o.name : o.nameEn ?? o.name}</option>)}
          </select>
        )}
        {state.fields.length > 0 && (
          <select className="op-filter-select" value={fieldId} aria-label={t('approvals.allFields')} onChange={(e) => setFieldId(e.target.value)}>
            <option value="">{t('approvals.allFields')}</option>
            {state.fields.map((f) => <option key={f.id} value={f.id}>{lang === 'ar' ? f.name : f.nameEn ?? f.name}</option>)}
          </select>
        )}
      </div>

      {chain.length === 0 ? (
        <EmptyState mode="empty">{t('approvals.emptyStore', { max: fmtMoney(tiers.operatorMaxUSD) })}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={<button className="op-btn-ghost" onClick={clearFilters}>{t('approvals.clearFilters')}</button>}
        >
          {t('approvals.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  {/* only the action column is pinned — the rest size to their content, so the
                      tender title keeps the width it needs in both languages */}
                  <SortableTh label={t('tenders.colTender')} sortKey="tender" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('approvals.colField')}</th>
                  <SortableTh label={t('approvals.colValue')} sortKey="value" active={sortKey} dir={dir} onToggle={toggle} />
                  <SortableTh label={t('approvals.colTier')} sortKey="tier" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('approvals.colBody')}</th>
                  <th>{t('tenders.colStage')}</th>
                  <th>{t('approvals.colDecision')}</th>
                  <th style={{ width: 150 }} className="op-end" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const cur = currentStage(r.tender);
                  const field = fieldName(r.tender.fieldId);
                  return (
                    <tr key={r.tender.id} className="op-tbl__row">
                      <td>
                        <div className="op-tbl__name" dir="auto">{r.tender.title[lang]}</div>
                        <div className="op-tbl__code">{r.tender.code}</div>
                      </td>
                      <td>
                        {field
                          ? <span dir="auto" style={{ fontSize: 12.5 }}>{field}</span>
                          : <span className="op-dev op-dev--none" title={t('approvals.noField')}>—</span>}
                      </td>
                      <td><span className="op-code">{fmtMoney(r.tender.estimatedValueUSD)}</span></td>
                      <td><TierPill tier={r.tier} tiers={tiers} /></td>
                      <td><span style={{ fontSize: 12.5 }}>{t(`tier.body.${r.tier}`)}</span></td>
                      <td>{cur ? stageByKey(cur.key)?.[lang] ?? cur.key : t('tenders.completed')}</td>
                      <td>
                        <span className={`ad-dec ad-dec--${r.decision}`}>{t(`approvals.dec.${r.decision}`)}</span>
                      </td>
                      <td className="op-end">
                        {/* a real link — the decision itself is taken in the tender file, never here */}
                        <a className="acc-open" href={`#/admin/review/${r.tender.id}`}>
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
