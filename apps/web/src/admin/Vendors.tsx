import { vendorEligible } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score">
      <span className="score__l">{label}</span>
      <span className="score__track">
        <span
          className="score__fill"
          style={{
            width: `${value}%`,
            background: value >= 75 ? 'var(--status-done)' : value >= 60 ? 'var(--status-risk)' : 'var(--status-delayed)',
          }}
        />
      </span>
      <span className="mono score__v">{value}</span>
    </div>
  );
}

/** Vendor registry & pre-qualification — eligibility flags per 10.4 / 14.3. */
export default function Vendors() {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();

  return (
    <section className="card">
      <h2>{tr('vendors.title')}</h2>
      <p className="hint">{tr('vendors.hint')}</p>
      <table className="dtable">
        <thead>
          <tr>
            <th>{tr('vendors.name')}</th>
            <th>{tr('vendors.scores')}</th>
            <th>{tr('vendors.moo')}</th>
            <th>{tr('vendors.eligibility')}</th>
          </tr>
        </thead>
        <tbody>
          {state.vendors.map((v) => {
            const elig = vendorEligible({ suspended: v.suspended, blacklisted: v.blacklisted, inDispute: v.inDispute });
            return (
              <tr key={v.id}>
                <td dir="auto" style={{ fontWeight: 500 }}>{v.name}</td>
                <td style={{ minWidth: 240 }}>
                  <ScoreBar label={tr('vendors.tech')} value={v.techScore} />
                  <ScoreBar label={tr('vendors.fin')} value={v.financialScore} />
                  <ScoreBar label={tr('vendors.hse')} value={v.hseScore} />
                </td>
                <td>
                  <StatusPill status={v.mooListed ? 'done' : 'planned'}>
                    {v.mooListed ? tr('vendors.mooYes') : tr('vendors.mooNo')}
                  </StatusPill>
                </td>
                <td>
                  {elig.ok ? (
                    <StatusPill status="done">{tr('vendors.eligible')}</StatusPill>
                  ) : (
                    <div className="vendor-ban">
                      <StatusPill status="delayed">
                        {tr('vendors.suspended')} <span className="m-clause">SCPP {elig.clause}</span>
                      </StatusPill>
                      {v.banUntil && (
                        <span className="g-hint">
                          {v.banReason?.[lang]} — {tr('vendors.until')} <span className="mono">{v.banUntil}</span>
                        </span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
