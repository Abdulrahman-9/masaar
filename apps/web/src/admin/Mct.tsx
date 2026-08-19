import { workingDaysBetween } from '@masaar/working-days';
import { awardVerdict, lowestQualified, mctCycleStatus } from '@masaar/scpp-rules';
import { StatusPill, VerdictStrip, WdRail } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { aboveOwnFA, accreditedEstimate, calendarOf, todayIso, useStore } from '../store';

/** The Operations-Room (dark) surface: live deadline vigilance per the approved direction. */
export default function Mct() {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);

  const cases = state.tenders.filter((t) => aboveOwnFA(state, t) && t.mct);

  return (
    <section className="card">
      <h2>{tr('mct.title')}</h2>
      <p className="hint">{tr('mct.hint')}</p>

      {cases.length === 0 && <StatusPill status="planned">{tr('mct.none')}</StatusPill>}

      {cases.map((t) => {
        const m = t.mct!;
        const status = mctCycleStatus({
          notifiedOn: m.notifiedOn,
          meetingHeldOn: m.meetingHeldOn,
          agreementReachedOn: m.agreementReachedOn,
          asOf: today,
          calendar: cal,
        });
        const elapsed = workingDaysBetween(m.notifiedOn, today, cal);
        const accredited = accreditedEstimate(m, status.prevailingEstimate);
        const lowest = lowestQualified(t.bidders);
        const verdict = lowest?.priceUSD != null ? awardVerdict(lowest.priceUSD, accredited) : null;

        const cycle: { key: string; done: boolean; date?: string }[] = [
          { key: 'notified', done: true, date: m.notifiedOn },
          { key: 'meeting', done: !!m.meetingHeldOn, date: m.meetingHeldOn },
          { key: 'agreement', done: !!m.agreementReachedOn, date: m.agreementReachedOn },
          { key: 'award', done: false },
        ];

        return (
          <div key={t.id} className="m-skin m-skin--control mct-case">
            <div className="mct-head">
              <div>
                <span className="mono mct-code">{t.code}</span>
                <div className="mct-title">{t.title[lang]}</div>
              </div>
              <StatusPill
                status={
                  status.prevailingEstimate === 'PENDING'
                    ? 'progress'
                    : status.prevailingEstimate === 'AGREED'
                      ? 'done'
                      : 'risk'
                }
              >
                {tr(`mct.prevailing.${status.prevailingEstimate}`)}
                {status.clause && <span className="mono"> {status.clause}</span>}
              </StatusPill>
            </div>

            <WdRail
              elapsed={elapsed}
              title={
                <>
                  {tr('mct.rail')} <span className="mono" style={{ fontSize: 11 }}>{m.notifiedOn}</span>
                </>
              }
            />

            <div className="mct-cycle">
              {cycle.map((c, i) => (
                <div key={c.key} className={`mct-step${c.done ? ' mct-step--done' : i === cycle.findIndex((x) => !x.done) ? ' mct-step--now' : ''}`}>
                  <span className="mct-step__dot" />
                  <span>{tr(`mct.cycle.${c.key}`)}</span>
                  {c.date && <span className="mono mct-step__date">{c.date}</span>}
                </div>
              ))}
            </div>

            <div className="mct-est">
              <div className="bidcell">
                <div className="l">{tr('mct.lcEstimate')}</div>
                <div className="v mono">${m.lcEstimateUSD.toLocaleString('en-US')}</div>
              </div>
              <div className="bidcell">
                <div className="l">{tr('mct.mctEstimate')}</div>
                <div className="v mono">{m.mctEstimateUSD ? `$${m.mctEstimateUSD.toLocaleString('en-US')}` : '—'}</div>
              </div>
              <div className="bidcell bidcell--acc">
                <div className="l">{tr('mct.accredited')} — {tr(`mct.prevailing.${status.prevailingEstimate}`)}</div>
                <div className="v mono">${accredited.toLocaleString('en-US')}</div>
              </div>
              <div className="bidcell">
                <div className="l">{tr('mct.lowestBid')}</div>
                <div className="v mono">{lowest?.priceUSD ? `$${lowest.priceUSD.toLocaleString('en-US')}` : '—'}</div>
              </div>
            </div>

            {verdict && <VerdictStrip verdict={verdict} lang={lang} />}
          </div>
        );
      })}
    </section>
  );
}
