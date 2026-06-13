import { awardVerdict, bidderCounts, lowestQualified, stageByKey, stageDeviationDays } from '@masaar/scpp-rules';
import { PathBadge, StatusPill, VerdictStrip } from '@masaar/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadSession } from '../session';
import { accreditedEstimate, currentStage, todayIso, useStore, type Tender } from '../store';
import { mctCycleStatus } from '@masaar/scpp-rules';

/**
 * Admin tender review — the ROC ratify / return-with-notes screen.
 * Award actions are only enabled once the tender reaches the ratification stage.
 */
export default function TenderReview({ id }: { id: string }) {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const [notes, setNotes] = useState('');
  const today = todayIso();
  const session = loadSession();
  const reviewer = session?.name ?? 'ROC';

  const tender: Tender | undefined = state.tenders.find((x) => x.id === id);
  if (!tender) {
    return (
      <p className="g-hint">
        — <a href="#/admin">{tr('review.back')}</a>
      </p>
    );
  }

  const cur = currentStage(tender);
  const atRatify = cur?.key === 'ratify';
  const decided = tender.ratification;

  // accredited estimate: if above-FA use the prevailing MCT estimate, else the tender estimate
  let accredited = tender.estimatedValueUSD;
  if (tender.mct) {
    const s = mctCycleStatus({
      notifiedOn: tender.mct.notifiedOn,
      meetingHeldOn: tender.mct.meetingHeldOn,
      agreementReachedOn: tender.mct.agreementReachedOn,
      asOf: today,
    });
    accredited = accreditedEstimate(tender.mct, s.prevailingEstimate);
  }
  const lowest = lowestQualified(tender.bidders);
  const verdict = lowest?.priceUSD != null ? awardVerdict(lowest.priceUSD, accredited) : null;
  const counts = bidderCounts(tender.bidders);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <span className="mono tcard__code">{tender.code}</span>
            <PathBadge id={tender.methodId} lang={lang} showClause />
          </div>
          <h1 style={{ marginTop: 8 }}>{tender.title[lang]}</h1>
        </div>
        <a className="btn" href="#/admin">{tr('review.back')}</a>
      </div>

      <section className="card">
        <h2>{tr('review.award')}</h2>
        <p className="hint">{tr('review.awardHint')}</p>
        <div className="bid-cells">
          <div className="bidcell"><div className="l">{tr('mct.accredited')}</div><div className="v mono">${accredited.toLocaleString('en-US')}</div></div>
          <div className="bidcell"><div className="l">{tr('review.lowest')}</div><div className="v mono">{lowest?.priceUSD ? `$${lowest.priceUSD.toLocaleString('en-US')}` : '—'}</div></div>
          <div className="bidcell"><div className="l">{tr('bids.qualified')}</div><div className="v mono">{counts.qualified} / {counts.applied}</div></div>
        </div>
        {verdict && <div style={{ marginTop: 14 }}><VerdictStrip verdict={verdict} lang={lang} /></div>}
      </section>

      <section className="card">
        <h2>{tr('review.stages')}</h2>
        <table className="dtable">
          <thead>
            <tr>
              <th>{tr('plan.stage')}</th>
              <th>{tr('plan.to')}</th>
              <th>{tr('plan.actual')}</th>
              <th>{tr('review.dev')}</th>
            </tr>
          </thead>
          <tbody>
            {tender.stages.map((s) => {
              const dev = s.actualTo && s.plannedTo ? stageDeviationDays(s.plannedTo, s.actualTo) : null;
              return (
                <tr key={s.key}>
                  <td>{stageByKey(s.key)?.[lang] ?? s.key}</td>
                  <td className="mono">{s.plannedTo ?? '—'}</td>
                  <td className="mono">{s.actualTo ?? '—'}</td>
                  <td className={dev != null && dev > 0 ? 'mono late-num' : 'mono'}>
                    {dev == null ? '—' : dev > 0 ? `+${dev}` : dev}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>{tr('review.decision')}</h2>
        {decided ? (
          <div className="vendor-ban">
            <StatusPill status={decided.status === 'ratified' ? 'done' : 'delayed'}>
              {tr(`review.${decided.status}`)} — {decided.by} · <span className="mono">{decided.on}</span>
            </StatusPill>
            {decided.notes && <p className="method-reason">{tr('review.notes')}: {decided.notes}</p>}
          </div>
        ) : !atRatify ? (
          <StatusPill status="planned">
            {tr('review.notReady')}
            {cur && <> — {stageByKey(cur.key)?.[lang]}</>}
          </StatusPill>
        ) : (
          <>
            <p className="hint">{tr('review.decisionHint')}</p>
            <div className="field field--wide" style={{ marginBottom: 14 }}>
              <label htmlFor="rv-notes">{tr('review.notes')}</label>
              <textarea
                id="rv-notes"
                className="notes-in"
                dir="auto"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tr('review.notesHint')}
              />
            </div>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn btn--primary" onClick={() => dispatch({ type: 'RATIFY', tenderId: tender.id, by: reviewer })}>
                {tr('review.ratify')}
              </button>
              <button
                className="btn btn--danger"
                disabled={!notes.trim()}
                onClick={() => dispatch({ type: 'RETURN_WITH_NOTES', tenderId: tender.id, by: reviewer, notes })}
              >
                {tr('review.return')}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
