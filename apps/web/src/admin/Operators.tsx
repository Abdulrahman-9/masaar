import { contractFinancialAuthority } from '@masaar/scpp-rules';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiMode } from '../config';
import { fmtCount, fmtMoney } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { loadSession } from '../session';
import {
  aboveOwnFA, govReasonValid, useStore,
  type OperatorOrg,
} from '../store';
import { EmptyState } from '../registry/EmptyState';
import { FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { exportCsv, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { useAdminUi } from './AdminShell';
import { roleKey } from './access';
import { Modal } from './Modal';
import { useActor } from './UserActions';

/** '' = every company, else one of the honest data-derived buckets. */
type ChipFilter = '' | 'costCycle' | 'noAccounts';

/** One operating company enriched with its live governance counts — the sort/CSV row. */
interface OperatorRow {
  op: OperatorOrg;
  accounts: number;
  accountsTotal: number;
  tenders: number;
  aboveFa: number;
  /** the FA of each of the company's fields' contracts (§7.1) — display is derived, never stored */
  faList: number[];
  fieldCount: number;
}

/**
 * The operating companies (المشغّلون) — the counterpart to the vendor registry.
 * Each one's Financial Authority (§7) decides which of its requests enter the MCT
 * cost cycle (6.9), which ROC participation tier applies (12.2), and what counts as
 * split procurement (7.2). That is why editing it is a justified, audited action.
 */
export default function Operators() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const session = loadSession();
  const actor = useActor();
  const isSuper = session?.role === 'SUPER_ADMIN';

  const [dialog, setDialog] = useState<null | { kind: 'add' }>(null);
  const [q, setQ] = useState('');
  const [chipFilter, setChipFilter] = useState<ChipFilter>('');

  const nameOf = (o: OperatorOrg) => (lang === 'ar' ? o.name : o.nameEn ?? o.name);

  // Every company with its live counts, computed once from the store — the
  // single source that feeds the KPI strip, the table and the CSV export.
  const allRows: OperatorRow[] = useMemo(() => state.operators.map((op) => {
    const tendersOfOp = state.tenders.filter((x) => x.operatorId === op.id);
    const opFieldIds = new Set(state.fields.filter((f) => f.operatorId === op.id).map((f) => f.id));
    // only EFFECTIVE contracts count toward the displayed authority — a terminated/expired
    // contract must not stretch the range and misrepresent current authority on a governance screen.
    const faList = state.serviceContracts
      .filter((c) => opFieldIds.has(c.fieldId))
      .map((c) => contractFinancialAuthority(c))
      .filter((n): n is number => n != null);
    return {
      op,
      accounts: state.users.filter((u) => u.operatorId === op.id && !u.disabled).length,
      accountsTotal: state.users.filter((u) => u.operatorId === op.id).length,
      tenders: tendersOfOp.length,
      aboveFa: tendersOfOp.filter((x) => aboveOwnFA(state, x)).length,
      faList,
      fieldCount: opFieldIds.size,
    };
  }), [state]);

  const orphanTenders = state.tenders.filter((x) => !x.operatorId).length;

  const qn = q.trim().toLowerCase();
  const filtered = useMemo(() => allRows.filter((r) => {
    if (qn && !(
      r.op.name.toLowerCase().includes(qn) ||
      (r.op.nameEn ?? '').toLowerCase().includes(qn) ||
      r.op.id.toLowerCase().includes(qn)
    )) return false;
    if (chipFilter === 'costCycle' && !(r.aboveFa > 0)) return false;
    if (chipFilter === 'noAccounts' && r.accountsTotal !== 0) return false;
    return true;
  }), [allRows, qn, chipFilter]);

  // Tri-state sort — the company name is Arabic-collated; the numeric columns sort by value.
  const compare = useMemo(() => ({
    name: arCompare<OperatorRow>((r) => (lang === 'ar' ? r.op.name : r.op.nameEn ?? r.op.name)),
    fa: (a: OperatorRow, b: OperatorRow) => Math.min(...(a.faList.length ? a.faList : [0])) - Math.min(...(b.faList.length ? b.faList : [0])),
    accounts: (a: OperatorRow, b: OperatorRow) => a.accounts - b.accounts,
    tenders: (a: OperatorRow, b: OperatorRow) => a.tenders - b.tenders,
    aboveFa: (a: OperatorRow, b: OperatorRow) => a.aboveFa - b.aboveFa,
  }), [lang]);
  const { sorted, sortKey, dir, toggle } = useTableSort(filtered, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  // KPIs summed over the FILTERED companies — every value is a real store count.
  const kAccounts = filtered.reduce((s, r) => s + r.accounts, 0);
  const kTenders = filtered.reduce((s, r) => s + r.tenders, 0);
  const kAboveFa = filtered.reduce((s, r) => s + r.aboveFa, 0);
  const kpis = [
    { l: t('reg.operators.kpiCompanies'), v: filtered.length, title: undefined as string | undefined },
    { l: t('reg.operators.kpiAccounts'), v: kAccounts, title: undefined },
    { l: t('reg.operators.kpiTenders'), v: kTenders, title: undefined },
    { l: t('reg.operators.kpiAboveFa'), v: kAboveFa, title: t('operators.aboveFaNote') },
  ];

  const filterChips: FilterChip[] = [
    { key: '', label: t('reg.operators.chipAll'), count: allRows.length, active: chipFilter === '' },
    { key: 'costCycle', label: t('reg.operators.chipCostCycle'), count: allRows.filter((r) => r.aboveFa > 0).length, active: chipFilter === 'costCycle', title: t('operators.aboveFaNote') },
    { key: 'noAccounts', label: t('reg.operators.chipNoAccounts'), count: allRows.filter((r) => r.accountsTotal === 0).length, active: chipFilter === 'noAccounts' },
  ];
  const onChip = (key: string) => setChipFilter(key as ChipFilter);

  // One column contract drives the CSV — headers stay the machine field names,
  // rows are the filtered+sorted set exactly as shown on screen.
  const csvColumns: ReportColumn<OperatorRow>[] = [
    { key: 'name', label: 'name', value: (r) => r.op.name },
    { key: 'nameEn', label: 'nameEn', value: (r) => r.op.nameEn ?? '' },
    { key: 'id', label: 'id', value: (r) => r.op.id },
    { key: 'faMin', label: 'faMinUSD', value: (r) => (r.faList.length ? Math.min(...r.faList) : '') },
    { key: 'faMax', label: 'faMaxUSD', value: (r) => (r.faList.length ? Math.max(...r.faList) : '') },
    { key: 'fields', label: 'fields', value: (r) => r.fieldCount },
    { key: 'accountsEnabled', label: 'accountsEnabled', value: (r) => r.accounts },
    { key: 'accountsTotal', label: 'accountsTotal', value: (r) => r.accountsTotal },
    { key: 'tenders', label: 'tenders', value: (r) => r.tenders },
    { key: 'tendersAboveFa', label: 'tendersAboveFa', value: (r) => r.aboveFa },
  ];
  const doExport = () => {
    exportCsv('masaar-operators-registry', csvColumns, sorted);
    // local file export only — the server audit log will never contain this row
    toast(t('reg.operators.toastExport'));
  };

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('operators.title')}</h1>
          <div className="op-page__sub">{t('operators.sub', { n: fmtCount(state.operators.length, lang) })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="op-btn-primary" disabled={!isSuper} title={isSuper ? undefined : t('access.gateNotSuper')} onClick={() => setDialog({ kind: 'add' })}>
            {t('operators.add')}
          </button>
          <button className="op-btn-ghost" onClick={doExport}>{t('reg.operators.exportCsv')}</button>
        </div>
      </div>

      {/* Honesty: this registry has no /operators endpoint — say so plainly in API mode. */}
      {isApiMode ? (
        <div className="wz-note wz-note--warn" style={{ marginBottom: 12 }}>{t('reg.operators.localOnly')}</div>
      ) : (
        <div className="wz-note wz-note--info" style={{ marginBottom: 12 }}>{t('operators.localNote')}</div>
      )}
      {!isSuper && (
        <div className="wz-note wz-note--warn" style={{ marginBottom: 12 }}>
          {t('access.gateBanner', { role: session ? t(`roles.names.${roleKey(session.role)}`) : '—' })}
        </div>
      )}
      {orphanTenders > 0 && (
        <div className="wz-note wz-note--warn" style={{ marginBottom: 12 }}>
          {/* an unowned tender has no field, so no Service Contract and no derivable authority:
              the engine fails CLOSED and reads it as ABOVE authority (§7.1) — no default figure. */}
          {t('operators.orphanTenders', { n: fmtCount(orphanTenders, lang) })}
        </div>
      )}

      <div className="ad-kpis" style={{ marginTop: 4 }}>
        {kpis.map((k) => (
          <div key={k.l} className="ad-kpi">
            <div className="ad-kpi__head"><span className="ad-kpi__l" title={k.title}>{k.l}</span></div>
            <div className="ad-kpi__row"><span className="ad-kpi__v">{fmtCount(k.v, lang)}</span></div>
          </div>
        ))}
      </div>

      <div className="acc-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('reg.operators.searchPh')} style={{ width: 280 }} />
        <FilterChips chips={filterChips} onSelect={onChip} lang={lang} />
      </div>

      {state.operators.length === 0 ? (
        <EmptyState
          mode="empty"
          action={<button className="op-btn-primary" disabled={!isSuper} title={isSuper ? undefined : t('access.gateNotSuper')} onClick={() => setDialog({ kind: 'add' })}>{t('operators.add')}</button>}
        >
          {t('reg.operators.empty')}
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={<button className="op-btn-ghost" onClick={() => { setQ(''); setChipFilter(''); }}>{t('reg.operators.clearFilters')}</button>}
        >
          {t('reg.operators.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('operators.colCompany')} sortKey="name" active={sortKey} dir={dir} onToggle={toggle} />
                  <SortableTh label={t('operators.colFa')} sortKey="fa" active={sortKey} dir={dir} onToggle={toggle} style={{ width: 190 }} />
                  <SortableTh label={t('operators.colAccounts')} sortKey="accounts" active={sortKey} dir={dir} onToggle={toggle} style={{ width: 130 }} />
                  <SortableTh label={t('operators.colTenders')} sortKey="tenders" active={sortKey} dir={dir} onToggle={toggle} style={{ width: 130 }} />
                  <SortableTh label={t('operators.colAboveFa')} sortKey="aboveFa" active={sortKey} dir={dir} onToggle={toggle} style={{ width: 160 }} />
                  <th style={{ width: 120 }} className="op-end" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.op.id} className="op-tbl__row">
                    <td>
                      <div className="op-tbl__name" dir="auto">{nameOf(r.op)}</div>
                      <div className="op-tbl__code">{r.op.id}</div>
                    </td>
                    <td>
                      {r.faList.length === 0
                        ? <span className="op-dev op-dev--none">—</span>
                        : Math.min(...r.faList) === Math.max(...r.faList)
                          ? <span className="op-code">{fmtMoney(r.faList[0]!)}</span>
                          : <span className="op-code">{fmtMoney(Math.min(...r.faList))}–{fmtMoney(Math.max(...r.faList))}</span>}
                    </td>
                    <td>
                      {r.accountsTotal === 0
                        ? <span className="op-dev op-dev--none">—</span>
                        : <span style={{ fontSize: 12 }}>{t('operators.nAccounts', { n: fmtCount(r.accounts, lang), all: fmtCount(r.accountsTotal, lang) })}</span>}
                    </td>
                    <td>
                      {r.tenders === 0
                        ? <span className="op-dev op-dev--none">—</span>
                        : <span className="acc-mono">{fmtCount(r.tenders, lang)}</span>}
                    </td>
                    <td>
                      {r.aboveFa > 0
                        ? <span className="acc-attr" title={t('operators.aboveFaNote')}>{t('operators.nAboveFa', { n: fmtCount(r.aboveFa, lang) })}</span>
                        : <span className="op-dev op-dev--none">—</span>}
                    </td>
                    <td className="op-end">
                      {/* FA is edited on the field's Service Contract (§7.1) — go there */}
                      <a className="acc-open" href={`#/admin/fields?op=${r.op.id}`}>
                        {t('operators.openFields', { n: fmtCount(r.fieldCount, lang) })}
                      </a>
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

      <div className="ad-empty-inline" style={{ marginTop: 10 }}>{t('operators.noDelete')}</div>

      {dialog?.kind === 'add' && <AddOperatorModal onClose={() => setDialog(null)} />}
    </div>
  );

}

function AddOperatorModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [reason, setReason] = useState('');

  const dupName = state.operators.some((o) => o.name.trim() === name.trim() && name.trim());
  const gate =
    !name.trim() ? t('operators.nameRequired')
    : dupName ? t('operators.dupName')
    : !govReasonValid(reason) ? t('access.reasonMin')
    : null;

  const submit = () => {
    if (gate || !actor) return;
    const id = `op-${Date.now().toString(36)}`;
    // FA is not set here — it arrives with the field's Service Contract (§7.1)
    dispatch({ type: 'CREATE_OPERATOR', operatorId: id, name: name.trim(), nameEn: nameEn.trim() || undefined, reason: reason.trim(), by: actor });
    toast(t('operators.toastAdd', { name: name.trim() }));
    onClose();
  };

  return (
    <Modal
      title={t('operators.add')} sub={t('operators.title')} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <button className="op-btn-primary" disabled={!!gate} onClick={submit}>{t('operators.addConfirm')}</button>
      </>}
    >
      <div className="wz-field">
        <label className="wz-field__l" htmlFor="op-name">{t('operators.name')}</label>
        <input id="op-name" className="wz-in" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="wz-field" style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="op-nameen">{t('operators.nameEn')}</label>
        <input id="op-nameen" className="wz-in" dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </div>
      <div className="wz-note wz-note--info" style={{ marginTop: 12 }}>{t('operators.faViaContract')}</div>
      <div style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="op-reason">{t('access.reason')}</label>
        <textarea id="op-reason" className="wz-ta" rows={2} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('access.reasonPh')} style={{ width: '100%', marginTop: 6 }} />
      </div>
      <div className="wz-gate" style={{ marginTop: 6 }}>{gate ?? t('access.auditNote')}</div>
    </Modal>
  );
}

