import {
  extensionCap,
  guaranteeExpiringSoon,
  liquidatedDamagesCap,
  performanceBondValid,
  variationOrdersCap,
} from '@masaar/scpp-rules';
import { CapMeter, StatusPill } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { todayIso, useStore } from '../store';

/** Post-award contract management — every cap clause is a live meter (§18–§21). */
export default function Contracts() {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();

  return (
    <section className="card">
      <h2>{tr('contracts.title')}</h2>
      <p className="hint">{tr('contracts.hint')}</p>

      {state.contracts.map((c) => {
        const vo = variationOrdersCap(c.voTotalUSD, c.valueUSD);
        const ext = extensionCap(c.extensionDays, c.termDays);
        const ld = liquidatedDamagesCap(c.ldTotalUSD, c.valueUSD);
        return (
          <div key={c.id} className="contract">
            <div className="mct-head">
              <div>
                <span className="mono tcard__code">{c.code}</span>
                <div className="mct-title" style={{ color: 'var(--fg-1)' }}>{c.title[lang]}</div>
              </div>
              <span className="g-hint">
                {tr('contracts.value')} <span className="mono">${c.valueUSD.toLocaleString('en-US')}</span> ·{' '}
                {tr('contracts.term')} <span className="mono">{c.termDays}d</span>
              </span>
            </div>

            <div className="g-grid3">
              <CapMeter result={vo} lang={lang} label={tr('contracts.vo')} />
              <CapMeter
                result={ext}
                lang={lang}
                label={tr('contracts.extension')}
                valueText={`${c.extensionDays}d / ${ext.usedPct.toFixed(1)}%`}
              />
              <CapMeter result={ld} lang={lang} label={tr('contracts.ld')} />
            </div>

            <table className="dtable" style={{ marginTop: 18 }}>
              <thead>
                <tr>
                  <th>{tr('contracts.guarantee')}</th>
                  <th>{tr('operator.value')}</th>
                  <th>{tr('contracts.check')}</th>
                  <th>{tr('contracts.expiry')}</th>
                </tr>
              </thead>
              <tbody>
                {c.guarantees.map((g) => {
                  const check =
                    g.kind === 'performance' ? performanceBondValid(g.valueUSD, c.valueUSD) : { ok: true, pct: 0 };
                  const soon = guaranteeExpiringSoon(g.expiresOn, today);
                  return (
                    <tr key={g.kind + g.expiresOn}>
                      <td>{tr(`contracts.kind.${g.kind}`)}</td>
                      <td className="mono">${g.valueUSD.toLocaleString('en-US')}</td>
                      <td>
                        <StatusPill status={check.ok ? 'done' : 'delayed'}>
                          {check.ok ? tr('contracts.ok') : tr('contracts.below')}
                          {g.kind === 'performance' && <span className="mono"> {check.pct}%</span>}
                        </StatusPill>
                      </td>
                      <td>
                        <span className="mono">{g.expiresOn}</span>{' '}
                        {soon && <StatusPill status="risk">{tr('contracts.expiringSoon')}</StatusPill>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}
