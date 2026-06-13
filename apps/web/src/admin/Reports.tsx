import {
  METHODS,
  guaranteeExpiringSoon,
  mctCycleStatus,
  scheduleCompliancePct,
} from '@masaar/scpp-rules';
import { workingDaysBetween } from '@masaar/working-days';
import { StatusPill } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { isAboveFA, todayIso, totalDeviationDays, useStore } from '../store';

function HBar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  return (
    <div className="hbar">
      <span className="hbar__l">{label}</span>
      <span className="hbar__track">
        <span className="hbar__fill" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="mono hbar__v">
        {value}
        {suffix}
      </span>
    </div>
  );
}

/** Reports (phase 5) — every figure recomputed from state via the engine. */
export default function Reports() {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();

  // method distribution
  const dist = METHODS.map((m) => ({ m, n: state.tenders.filter((t) => t.methodId === m.id).length })).filter((x) => x.n > 0);
  const distMax = Math.max(...dist.map((x) => x.n), 1);

  // compliance per tender
  const compliance = state.tenders.map((t) => ({
    t,
    pct: scheduleCompliancePct(t.stages.filter((s) => s.plannedTo).map((s) => ({ plannedEnd: s.plannedTo!, actualEnd: s.actualTo }))),
    dev: totalDeviationDays(t),
  }));

  // SCPP deadline compliance
  const published = state.tenders.filter((t) => t.announcement.publishedOn && t.announcement.mode === 'public');
  const annOk = published.filter((t) => t.announcement.periodDays >= 21).length;
  const mctCases = state.tenders.filter((t) => isAboveFA(t) && t.mct?.meetingHeldOn);
  const mctOk = mctCases.filter((t) => workingDaysBetween(t.mct!.notifiedOn, t.mct!.meetingHeldOn!) <= 14).length;

  // expiring guarantees
  const expiring = state.contracts.flatMap((c) =>
    c.guarantees.filter((g) => guaranteeExpiringSoon(g.expiresOn, today)).map((g) => ({ c, g })),
  );

  const exportCsv = () => {
    const rows = [
      ['code', 'title', 'method', 'valueUSD', 'compliancePct', 'deviationDays'],
      ...compliance.map(({ t, pct, dev }) => [t.code, t.title[lang], String(t.methodId), String(t.estimatedValueUSD), String(pct), String(dev)]),
    ];
    // BOM keeps Arabic intact when Excel opens the file
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `masaar-report-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <section className="card">
        <div className="lab-headlike">
          <h2>{tr('reports.title')}</h2>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={exportCsv}>{tr('reports.csv')}</button>
            <button className="btn" onClick={() => window.print()}>{tr('reports.print')}</button>
          </div>
        </div>
        <p className="hint">{tr('reports.hint')}</p>

        <div className="g-label">{tr('reports.dist')}</div>
        <div className="hbars">
          {dist.map(({ m, n }) => (
            <HBar key={m.id} label={`${String(m.id).padStart(2, '0')} — ${lang === 'ar' ? m.ar : m.en}`} value={n} max={distMax} />
          ))}
        </div>

        <div className="g-label" style={{ marginTop: 22 }}>{tr('reports.deadlines')}</div>
        <div className="hbars">
          <HBar label={tr('reports.ann21')} value={annOk} max={Math.max(published.length, 1)} suffix={`/${published.length}`} />
          <HBar label={tr('reports.mct14')} value={mctOk} max={Math.max(mctCases.length, 1)} suffix={`/${mctCases.length}`} />
        </div>
      </section>

      <section className="card">
        <h2>{tr('reports.leaderboard')}</h2>
        <table className="dtable">
          <thead>
            <tr>
              <th>{tr('admin.code')}</th>
              <th>{tr('admin.titleCol')}</th>
              <th>{tr('reports.compliance')}</th>
              <th>{tr('operator.deviationDays')}</th>
            </tr>
          </thead>
          <tbody>
            {[...compliance]
              .sort((a, b) => b.pct - a.pct)
              .map(({ t, pct, dev }) => (
                <tr key={t.id}>
                  <td className="mono">{t.code}</td>
                  <td>{t.title[lang]}</td>
                  <td>
                    <StatusPill status={pct >= 90 ? 'done' : pct >= 60 ? 'risk' : 'delayed'}>
                      <span className="mono">{pct}%</span>
                    </StatusPill>
                  </td>
                  <td className="mono">{dev > 0 ? `+${dev}` : dev}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>{tr('reports.expiring')}</h2>
        {expiring.length === 0 ? (
          <StatusPill status="done">{tr('reports.noneExpiring')}</StatusPill>
        ) : (
          <table className="dtable">
            <thead>
              <tr>
                <th>{tr('admin.code')}</th>
                <th>{tr('contracts.guarantee')}</th>
                <th>{tr('operator.value')}</th>
                <th>{tr('contracts.expiry')}</th>
              </tr>
            </thead>
            <tbody>
              {expiring.map(({ c, g }) => (
                <tr key={c.id + g.kind}>
                  <td className="mono">{c.code}</td>
                  <td>{tr(`contracts.kind.${g.kind}`)}</td>
                  <td className="mono">${g.valueUSD.toLocaleString('en-US')}</td>
                  <td>
                    <span className="mono">{g.expiresOn}</span> <StatusPill status="risk">{tr('contracts.expiringSoon')}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
