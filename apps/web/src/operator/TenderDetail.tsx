import { calendarDaysBetween } from '@masaar/working-days';
import {
  awardVerdict,
  bidderCounts,
  checkAnnouncement,
  isPriceVisible,
  lowestQualified,
  stageByKey,
  stageCanClose,
  stageDeviationDays,
  type AnnouncementMode,
} from '@masaar/scpp-rules';
import { PathBadge, StatusPill, Stepper, VerdictStrip } from '@masaar/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  announcementInput,
  currentStage,
  evalStepName,
  expectedAwardDate,
  requiredDocsFor,
  stageStatus,
  todayIso,
  useStore,
  type Tender,
} from '../store';

type Lang = 'ar' | 'en';

/* ================= Plan panel ================= */

function PlanPanel({ t }: { t: Tender }) {
  const { t: tr, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as Lang;
  const { dispatch } = useStore();
  const today = todayIso();

  const announceStage = t.stages.find((s) => s.key === 'announce');
  const announceDays =
    announceStage?.plannedFrom && announceStage.plannedTo
      ? calendarDaysBetween(announceStage.plannedFrom, announceStage.plannedTo)
      : undefined;
  const announceTooShort = t.methodId === 7 && announceDays !== undefined && announceDays < 21;
  const award = expectedAwardDate(t);

  return (
    <div>
      <table className="dtable">
        <thead>
          <tr>
            <th>{tr('plan.stage')}</th>
            <th>{tr('plan.from')}</th>
            <th>{tr('plan.to')}</th>
            <th>{tr('plan.actual')}</th>
            <th>{tr('plan.status')}</th>
          </tr>
        </thead>
        <tbody>
          {t.stages.map((s) => {
            const def = stageByKey(s.key);
            const status = stageStatus(s, today);
            const dev = s.actualTo && s.plannedTo ? stageDeviationDays(s.plannedTo, s.actualTo) : 0;
            return (
              <tr key={s.key}>
                <td>{def?.[lang] ?? s.key}</td>
                <td>
                  <input
                    className="date-in"
                    type="date"
                    value={s.plannedFrom ?? ''}
                    disabled={!!s.actualTo}
                    onChange={(e) => dispatch({ type: 'PLAN_STAGE', tenderId: t.id, stageKey: s.key, plannedFrom: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="date-in"
                    type="date"
                    value={s.plannedTo ?? ''}
                    disabled={!!s.actualTo}
                    onChange={(e) => dispatch({ type: 'PLAN_STAGE', tenderId: t.id, stageKey: s.key, plannedTo: e.target.value })}
                  />
                </td>
                <td className="mono">{s.actualTo ?? '—'}</td>
                <td>
                  <StatusPill status={status}>
                    {tr(`gallery.pill${status === 'done' ? 'Done' : status === 'progress' ? 'Progress' : status === 'delayed' ? 'Delayed' : 'Planned'}`)}
                    {s.actualTo && dev > 0 ? <span className="mono"> +{dev}</span> : null}
                  </StatusPill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="plan-foot">
        <span>
          {tr('plan.awardDate')}: <span className="mono">{award ?? '—'}</span>
        </span>
        {announceTooShort && (
          <span className="warn-strip warn-strip--inline">
            {tr('plan.announceMin')} <span className="mono">({announceDays}d &lt; 21d)</span> <span className="m-clause">SCPP 11.1</span>
          </span>
        )}
      </div>
    </div>
  );
}

/* ================= Announcement panel ================= */

function AnnouncementPanel({ t }: { t: Tender }) {
  const { t: tr, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as Lang;
  const { dispatch } = useStore();
  const a = t.announcement;
  const result = checkAnnouncement(announcementInput(a));
  const published = !!a.publishedOn;

  const set = (patch: Partial<typeof a>) => dispatch({ type: 'SET_ANNOUNCEMENT', tenderId: t.id, patch });

  return (
    <div className="ann-grid">
      <div>
        <div className="g-label">{tr('ann.mode')}</div>
        <div className="seg">
          {(['public', 'limited', 'direct'] as AnnouncementMode[]).map((m) => (
            <button key={m} className={`seg__btn${a.mode === m ? ' seg__btn--on' : ''}`} disabled={published} onClick={() => set({ mode: m })}>
              {tr(`ann.${m}`)}
            </button>
          ))}
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label>{tr('ann.period')}</label>
            <input type="number" min={1} value={a.periodDays} disabled={published} onChange={(e) => set({ periodDays: Number(e.target.value) || 0 })} />
          </div>
          {a.mode === 'public' ? (
            <>
              {a.newspapers.map((n, i) => (
                <div className="field" key={i}>
                  <label>{tr('ann.newspaper')} {i + 1}</label>
                  <input dir="auto" style={{ fontFamily: 'var(--font-sans)' }} value={n} disabled={published}
                    onChange={(e) => {
                      const arr = [...a.newspapers] as [string, string, string];
                      arr[i] = e.target.value;
                      set({ newspapers: arr });
                    }} />
                </div>
              ))}
            </>
          ) : (
            <div className="field">
              <label>{tr('ann.invitees')}</label>
              <input type="number" min={0} value={a.inviteeCount} disabled={published} onChange={(e) => set({ inviteeCount: Number(e.target.value) || 0 })} />
            </div>
          )}
        </div>

        <div className="flag-row" style={{ marginTop: 4 }}>
          {a.mode === 'public' ? (
            <>
              <label className="flag"><input type="checkbox" checked={a.lcWebsite} disabled={published} onChange={(e) => set({ lcWebsite: e.target.checked })} /> {tr('ann.lcSite')}</label>
              <label className="flag"><input type="checkbox" checked={a.rocWebsite} disabled={published} onChange={(e) => set({ rocWebsite: e.target.checked })} /> {tr('ann.rocSite')}</label>
            </>
          ) : (
            <label className="flag"><input type="checkbox" checked={a.inviteesPreQualified} disabled={published} onChange={(e) => set({ inviteesPreQualified: e.target.checked })} /> {tr('ann.preq')}</label>
          )}
        </div>
      </div>

      <div>
        <div className="g-label">{tr('ann.checks')}</div>
        <ul className="checks">
          {result.checks.map((c) => (
            <li key={c.id} className={c.ok ? 'checks__ok' : 'checks__no'}>
              <span className="checks__mark">{c.ok ? '✓' : '✗'}</span>
              <span>{lang === 'ar' ? c.ar : c.en}</span>
              <span className="m-clause">SCPP {c.clause}</span>
            </li>
          ))}
        </ul>
        {published ? (
          <StatusPill status="done">
            {tr('ann.publishedOn')} <span className="mono">{a.publishedOn}</span>
          </StatusPill>
        ) : (
          <button className="btn btn--primary" disabled={!result.ok} onClick={() => dispatch({ type: 'PUBLISH_ANNOUNCEMENT', tenderId: t.id })}>
            {tr('ann.publish')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ================= Bids panel ================= */

function BidsPanel({ t }: { t: Tender }) {
  const { t: tr, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as Lang;
  const { dispatch } = useStore();
  const [newBidder, setNewBidder] = useState('');

  const step = evalStepName(t.evaluationStep);
  const counts = bidderCounts(t.bidders);
  const lowest = lowestQualified(t.bidders);
  const verdict = lowest?.priceUSD != null ? awardVerdict(lowest.priceUSD, t.estimatedValueUSD) : null;
  const technicalEditable = t.evaluationStep === 1;

  return (
    <div>
      <Stepper
        steps={[tr('gallery.step1'), tr('gallery.step2'), tr('gallery.step3'), tr('gallery.step4')]}
        current={t.evaluationStep}
        onSelect={(i) => dispatch({ type: 'SET_EVAL_STEP', tenderId: t.id, step: i })}
      />

      <table className="dtable" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>{tr('bids.bidder')}</th>
            <th>{tr('bids.docs')}</th>
            <th>{tr('bids.bond')}</th>
            <th>{tr('bids.technical')}</th>
            <th>{tr('bids.price')}</th>
          </tr>
        </thead>
        <tbody>
          {t.bidders.map((b) => {
            const priceVisible = isPriceVisible(step, b);
            const isLowest = lowest?.id === b.id;
            return (
              <tr key={b.id} className={isLowest ? 'row--lowest' : undefined}>
                <td dir="auto">{b.name}</td>
                <td><StatusPill status={b.docsOk ? 'done' : 'delayed'}>{b.docsOk ? '✓' : '✗'}</StatusPill></td>
                <td><StatusPill status={b.bondOk ? 'done' : 'delayed'}>{b.bondOk ? '✓' : '✗'}</StatusPill></td>
                <td>
                  <div className="seg seg--sm">
                    <button
                      className={`seg__btn${b.technicalResult === 'pass' ? ' seg__btn--on' : ''}`}
                      disabled={!technicalEditable}
                      onClick={() => dispatch({ type: 'SET_TECHNICAL', tenderId: t.id, bidderId: b.id, result: 'pass' })}
                    >
                      {tr('bids.pass')}
                    </button>
                    <button
                      className={`seg__btn seg__btn--danger${b.technicalResult === 'fail' ? ' seg__btn--on' : ''}`}
                      disabled={!technicalEditable}
                      onClick={() => dispatch({ type: 'SET_TECHNICAL', tenderId: t.id, bidderId: b.id, result: 'fail' })}
                    >
                      {tr('bids.fail')}
                    </button>
                  </div>
                </td>
                <td>
                  {priceVisible ? (
                    <input
                      className="price-in"
                      type="number"
                      min={0}
                      step={10_000}
                      value={b.priceUSD ?? ''}
                      onChange={(e) => dispatch({ type: 'SET_PRICE', tenderId: t.id, bidderId: b.id, priceUSD: Number(e.target.value) || 0 })}
                    />
                  ) : (
                    <span className="locked" title="SCPP 12.4.2">{tr('bids.locked')}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 12 }}>
        <input
          dir="auto"
          style={{ fontFamily: 'var(--font-sans)' }}
          className="bidder-in"
          placeholder={tr('bids.addBidder')}
          value={newBidder}
          onChange={(e) => setNewBidder(e.target.value)}
        />
        <button
          className="btn"
          disabled={!newBidder.trim()}
          onClick={() => {
            dispatch({ type: 'ADD_BIDDER', tenderId: t.id, name: newBidder.trim() });
            setNewBidder('');
          }}
        >
          +
        </button>
        <span className="g-hint" style={{ marginInlineStart: 'auto' }}>
          {tr('bids.applied')} <span className="mono">{counts.applied}</span> · {tr('bids.qualified')}{' '}
          <span className="mono">{counts.qualified}</span> · {tr('bids.priced')} <span className="mono">{counts.priced}</span>
        </span>
      </div>

      {verdict && (
        <div style={{ marginTop: 16 }}>
          <VerdictStrip verdict={verdict} lang={lang} />
        </div>
      )}
    </div>
  );
}

/* ================= Close-stage panel ================= */

function ClosePanel({ t }: { t: Tender }) {
  const { t: tr, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as Lang;
  const { dispatch } = useStore();
  const [actualTo, setActualTo] = useState(todayIso());

  const stage = currentStage(t);
  if (!stage) {
    return <StatusPill status="done">{tr('operator.allDone')}</StatusPill>;
  }
  const def = stageByKey(stage.key);
  const required = requiredDocsFor(stage.key);
  const gate = stageCanClose(required, stage.uploadedDocs);
  const dev = stage.plannedTo ? stageDeviationDays(stage.plannedTo, actualTo) : 0;

  return (
    <div className="close-grid">
      <div>
        <div className="g-label">{tr('close.stage')}</div>
        <h3 style={{ margin: '6px 0 14px' }}>{def?.[lang] ?? stage.key}</h3>
        <div className="field" style={{ maxWidth: 220 }}>
          <label>{tr('close.actualDate')}</label>
          <input className="date-in" type="date" value={actualTo} onChange={(e) => setActualTo(e.target.value)} />
        </div>
        {stage.plannedTo && (
          <p className="g-hint" style={{ marginTop: 10 }}>
            {tr('close.deviation')}:{' '}
            <span className={`mono ${dev > 0 ? 'late-num' : ''}`}>{dev > 0 ? `+${dev}` : dev}</span>
          </p>
        )}
      </div>
      <div>
        <div className="g-label">{tr('close.docs')}</div>
        <ul className="docs">
          {required.map((d) => (
            <li key={d}>
              <label className="flag">
                <input
                  type="checkbox"
                  checked={stage.uploadedDocs.includes(d)}
                  onChange={() => dispatch({ type: 'TOGGLE_DOC', tenderId: t.id, stageKey: stage.key, doc: d })}
                />{' '}
                {tr(`docs.${d}`)}
              </label>
            </li>
          ))}
        </ul>
        {!gate.ok && (
          <p className="g-hint late-num" style={{ marginBottom: 10 }}>
            {tr('close.missing')}: {gate.missing.map((d) => tr(`docs.${d}`)).join('، ')}
          </p>
        )}
        <button
          className="btn btn--primary"
          disabled={!gate.ok}
          onClick={() => dispatch({ type: 'COMPLETE_STAGE', tenderId: t.id, stageKey: stage.key, actualTo })}
        >
          {tr('close.complete')}
        </button>
      </div>
    </div>
  );
}

/* ================= shell ================= */

const TABS = ['plan', 'announce', 'bids', 'close'] as const;
type Tab = (typeof TABS)[number];

export default function TenderDetail({ id }: { id: string }) {
  const { t: tr, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as Lang;
  const { state } = useStore();
  const [tab, setTab] = useState<Tab>('plan');

  const tender = state.tenders.find((x) => x.id === id);
  if (!tender) {
    return (
      <p className="g-hint">
        — <a href="#/operator">{tr('detail.back')}</a>
      </p>
    );
  }

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
        <a className="btn" href="#/operator">{tr('detail.back')}</a>
      </div>

      <div className="tabs">
        {TABS.map((k) => (
          <button key={k} className={`tab${tab === k ? ' tab--on' : ''}`} onClick={() => setTab(k)}>
            {tr(`detail.tabs.${k}`)}
          </button>
        ))}
      </div>

      <section className="card">
        {tab === 'plan' && <PlanPanel t={tender} />}
        {tab === 'announce' && <AnnouncementPanel t={tender} />}
        {tab === 'bids' && <BidsPanel t={tender} />}
        {tab === 'close' && <ClosePanel t={tender} />}
      </section>
    </>
  );
}
