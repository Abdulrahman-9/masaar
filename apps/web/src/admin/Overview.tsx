import { scheduleCompliancePct, stageByKey } from '@masaar/scpp-rules';
import { KpiTile, PathBadge, StatusPill } from '@masaar/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { currentStage, isAboveFA, stageStatus, todayIso, totalDeviationDays, useStore } from '../store';

export default function Overview() {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const [methodFilter, setMethodFilter] = useState<number | 0>(0);
  const today = todayIso();

  const open = state.tenders.filter((t) => currentStage(t));
  const awaitingRatify = state.tenders.filter((t) => currentStage(t)?.key === 'ratify');
  const compliance = scheduleCompliancePct(
    state.tenders.flatMap((t) => t.stages.filter((s) => s.plannedTo).map((s) => ({ plannedEnd: s.plannedTo!, actualEnd: s.actualTo }))),
  );
  const inMct = state.tenders.filter((t) => isAboveFA(t) && t.mct);

  // deviation alerts sorted by severity
  const alerts = state.tenders
    .map((t) => {
      const closedDev = totalDeviationDays(t);
      const cur = currentStage(t);
      const runningLate = cur?.plannedTo && today > cur.plannedTo;
      return { t, dev: closedDev, runningLate: !!runningLate, stage: cur };
    })
    .filter((a) => a.dev > 0 || a.runningLate)
    .sort((a, b) => b.dev - a.dev);

  const rows = methodFilter === 0 ? state.tenders : state.tenders.filter((t) => t.methodId === methodFilter);

  return (
    <>
      <section className="kpis m-skin">
        <KpiTile label={tr('admin.kpiOpen')} value={open.length} />
        <KpiTile label={tr('admin.kpiRatify')} value={awaitingRatify.length} />
        <KpiTile label={tr('admin.kpiCompliance')} value={Math.round(compliance)} suffix="%" />
        <KpiTile label={tr('admin.kpiMct')} value={inMct.length} />
      </section>

      <section className="card">
        <h2>{tr('admin.alerts')}</h2>
        <p className="hint">{tr('admin.alertsHint')}</p>
        {alerts.length === 0 ? (
          <StatusPill status="done">{tr('admin.noAlerts')}</StatusPill>
        ) : (
          <ul className="alerts">
            {alerts.map(({ t, dev, runningLate, stage }) => (
              <li key={t.id}>
                <span className="mono tcard__code">{t.code}</span>
                <span className="alerts__title">{t.title[lang]}</span>
                {dev > 0 && (
                  <StatusPill status="delayed">
                    {tr('operator.deviationDays')} <span className="mono">+{dev}</span>
                  </StatusPill>
                )}
                {runningLate && stage && (
                  <StatusPill status="risk">
                    {stageByKey(stage.key)?.[lang]} — {tr('admin.pastPlanned')}
                  </StatusPill>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="lab-headlike">
          <h2>{tr('admin.allTenders')}</h2>
          <select value={methodFilter} onChange={(e) => setMethodFilter(Number(e.target.value))}>
            <option value={0}>{tr('admin.allMethods')}</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
              <option key={id} value={id}>{String(id).padStart(2, '0')}</option>
            ))}
          </select>
        </div>
        <table className="dtable" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>{tr('admin.code')}</th>
              <th>{tr('admin.titleCol')}</th>
              <th>{tr('admin.method')}</th>
              <th>{tr('operator.value')}</th>
              <th>{tr('admin.stage')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const cur = currentStage(t);
              const st = cur ? stageStatus(cur, today) : 'done';
              return (
                <tr key={t.id} className="row--link" onClick={() => { window.location.hash = `#/admin/review/${t.id}`; }}>
                  <td className="mono">{t.code}</td>
                  <td>{t.title[lang]}</td>
                  <td><PathBadge id={t.methodId} lang={lang} /></td>
                  <td className="mono">${t.estimatedValueUSD.toLocaleString('en-US')}</td>
                  <td>
                    <StatusPill status={st === 'done' ? 'done' : st === 'delayed' ? 'delayed' : 'progress'}>
                      {cur ? stageByKey(cur.key)?.[lang] : tr('operator.allDone')}
                    </StatusPill>
                    {t.ratification && (
                      <StatusPill status={t.ratification.status === 'ratified' ? 'done' : 'delayed'}>
                        {tr(`review.${t.ratification.status}`)}
                      </StatusPill>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
