import { rocParticipation } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { FINANCIAL_AUTHORITY_USD, todayIso, useStore } from '../store';

const STATE_COMPANIES = [
  { code: 'IDC', status: 'accepted' },
  { code: 'SCOP', status: 'accepted' },
  { code: 'HEESCO', status: 'pending' },
  { code: 'OEC', status: 'declined' },
  { code: 'PRDC', status: 'pending' },
] as const;

/** Committees & compliance: ROC nominations (12.2) + local content 20%. */
export default function Compliance() {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();

  return (
    <>
      <section className="card">
        <h2>{tr('compliance.nomTitle')}</h2>
        <p className="hint">{tr('compliance.nomHint')}</p>
        <table className="dtable">
          <thead>
            <tr>
              <th>{tr('admin.code')}</th>
              <th>{tr('admin.titleCol')}</th>
              <th>{tr('compliance.tier')}</th>
              <th>{tr('compliance.deadline')}</th>
            </tr>
          </thead>
          <tbody>
            {state.tenders.map((t) => {
              const trigger = t.mct?.notifiedOn ?? t.announcement.publishedOn ?? t.createdOn;
              const p = rocParticipation(t.estimatedValueUSD, FINANCIAL_AUTHORITY_USD, trigger);
              const missed = p.nominationDeadline != null && today > p.nominationDeadline;
              return (
                <tr key={t.id}>
                  <td className="mono">{t.code}</td>
                  <td>{t.title[lang]}</td>
                  <td>
                    <StatusPill status={p.tier === 'witness-validate' ? 'risk' : p.tier === 'observer' ? 'progress' : 'planned'}>
                      {tr(`compliance.tiers.${p.tier}`)} <span className="m-clause">SCPP {p.clause}</span>
                    </StatusPill>
                  </td>
                  <td>
                    {p.nominationDeadline ? (
                      <span className="vendor-ban">
                        <span className="mono">{p.nominationDeadline}</span>
                        {missed ? (
                          <StatusPill status="delayed">{tr('compliance.missed')}</StatusPill>
                        ) : (
                          <StatusPill status="progress">{tr('compliance.open')}</StatusPill>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>{tr('compliance.lcTitle')}</h2>
        <p className="hint">{tr('compliance.lcHint')}</p>
        <div className="lc-grid">
          <svg viewBox="0 0 120 120" className="donut" role="img" aria-label="20% local content">
            <circle cx="60" cy="60" r="48" fill="none" stroke="var(--paper-200)" strokeWidth="16" />
            <circle
              cx="60"
              cy="60"
              r="48"
              fill="none"
              stroke="var(--brand-amber-500)"
              strokeWidth="16"
              strokeDasharray="60.3 241.3"
              strokeLinecap="butt"
              transform="rotate(-90 60 60)"
            />
            <text x="60" y="66" textAnchor="middle" className="donut__t">20%</text>
          </svg>
          <table className="dtable">
            <thead>
              <tr>
                <th>{tr('compliance.company')}</th>
                <th>{tr('compliance.response')}</th>
              </tr>
            </thead>
            <tbody>
              {STATE_COMPANIES.map((c) => (
                <tr key={c.code}>
                  <td className="mono">{c.code}</td>
                  <td>
                    <StatusPill status={c.status === 'accepted' ? 'done' : c.status === 'pending' ? 'progress' : 'delayed'}>
                      {tr(`compliance.resp.${c.status}`)}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
