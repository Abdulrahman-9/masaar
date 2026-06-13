import {
  METHODS,
  detectSplitRisk,
  minParticipants,
  suggestMethod,
  type SoleSourceCase,
} from '@masaar/scpp-rules';
import { PathBadge } from '@masaar/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { todayIso, useStore } from '../store';

/** FA comes from each Service Contract (§7) — configurable per operator; demo value. */
const FINANCIAL_AUTHORITY_USD = 5_000_000;

export default function NewRequest() {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();

  const [title, setTitle] = useState('');
  const [budgetCode, setBudgetCode] = useState('');
  const [value, setValue] = useState(500_000);
  const [soleCase, setSoleCase] = useState<'' | SoleSourceCase>('');
  const [specialized, setSpecialized] = useState(false);
  const [complex, setComplex] = useState(false);
  const [preqList, setPreqList] = useState(false);
  const [recent, setRecent] = useState(false);
  const [overrideId, setOverrideId] = useState<number | ''>('');
  const [justification, setJustification] = useState('');

  const suggestion = suggestMethod({
    estimatedValueUSD: Math.max(value, 0),
    soleSourceCase: soleCase || undefined,
    specializedOrEmergency: specialized,
    technicallyComplex: complex,
    hasPreQualifiedList: preqList,
    hasRecentQualifiedBidders: recent,
  });

  const finalMethodId = overrideId === '' ? suggestion.method.id : overrideId;
  const overridden = overrideId !== '' && overrideId !== suggestion.method.id;
  const minInv = minParticipants(METHODS.find((m) => m.id === finalMethodId)!.key);

  // anti-splitting check (7.2) against existing requests under the same budget code
  const splitGroups = budgetCode
    ? detectSplitRisk(
        [
          ...state.tenders.map((x) => ({
            id: x.code,
            budgetCode: x.budgetCode,
            estimatedValueUSD: x.estimatedValueUSD,
            raisedOn: x.createdOn,
          })),
          { id: 'NEW', budgetCode, estimatedValueUSD: value, raisedOn: todayIso() },
        ],
        FINANCIAL_AUTHORITY_USD,
      ).filter((g) => g.requestIds.includes('NEW'))
    : [];

  const canSubmit = title.trim().length > 0 && budgetCode.trim().length > 0 && value > 0 && (!overridden || justification.trim().length > 0);

  const submit = () => {
    if (!canSubmit) return;
    dispatch({
      type: 'CREATE_TENDER',
      title: { ar: title, en: title },
      budgetCode: budgetCode.trim(),
      estimatedValueUSD: value,
      methodId: finalMethodId,
      overrideJustification: overridden ? justification.trim() : undefined,
    });
    window.location.hash = '#/operator';
  };

  return (
    <>
      <div className="page-head">
        <h1>{tr('new.title')}</h1>
        <a className="btn" href="#/operator">
          {tr('detail.back')}
        </a>
      </div>

      <section className="card">
        <div className="form-grid">
          <div className="field field--wide">
            <label htmlFor="nr-title">{tr('new.name')}</label>
            <input id="nr-title" dir="auto" style={{ fontFamily: 'var(--font-sans)', width: '100%' }} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="nr-budget">{tr('new.budgetCode')}</label>
            <input id="nr-budget" value={budgetCode} onChange={(e) => setBudgetCode(e.target.value)} placeholder="RU-DRL-77" />
          </div>
          <div className="field">
            <label htmlFor="nr-value">{tr('new.value')}</label>
            <input id="nr-value" type="number" min={0} step={10_000} value={value} onChange={(e) => setValue(Number(e.target.value) || 0)} />
          </div>
        </div>

        <div className="flag-row">
          <span className="g-label">{tr('new.flags')}</span>
          <label className="flag"><input type="checkbox" checked={specialized} onChange={(e) => setSpecialized(e.target.checked)} /> {tr('new.flagSpecialized')}</label>
          <label className="flag"><input type="checkbox" checked={complex} onChange={(e) => setComplex(e.target.checked)} /> {tr('new.flagComplex')}</label>
          <label className="flag"><input type="checkbox" checked={preqList} onChange={(e) => setPreqList(e.target.checked)} /> {tr('new.flagPreq')}</label>
          <label className="flag"><input type="checkbox" checked={recent} onChange={(e) => setRecent(e.target.checked)} /> {tr('new.flagRecent')}</label>
          <label className="flag">
            {tr('new.soleCase')}{' '}
            <select value={soleCase} onChange={(e) => setSoleCase(e.target.value as '' | SoleSourceCase)}>
              <option value="">{tr('new.soleNone')}</option>
              {(['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>{tr('new.suggested')}</h2>
        <div className="row" style={{ marginTop: 12 }}>
          <PathBadge id={suggestion.method.id} lang={lang} showClause />
          {minInv > 0 && (
            <span className="g-hint">
              {tr('new.minParticipants')}: <span className="mono">{minInv}</span>
            </span>
          )}
        </div>
        <p className="method-reason">{lang === 'ar' ? suggestion.reasonAr : suggestion.reasonEn}</p>

        <div className="row" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="nr-override">{tr('new.override')}</label>
            <select id="nr-override" value={overrideId} onChange={(e) => setOverrideId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">{tr('new.overrideNone')}</option>
              {METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {String(m.id).padStart(2, '0')} — {lang === 'ar' ? m.ar : m.en}
                </option>
              ))}
            </select>
          </div>
          {overridden && (
            <div className="field field--wide">
              <label htmlFor="nr-just">{tr('new.justification')}</label>
              <input id="nr-just" dir="auto" style={{ fontFamily: 'var(--font-sans)', width: '100%' }} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder={tr('new.justificationHint')} />
            </div>
          )}
        </div>

        {splitGroups.length > 0 && (
          <div className="warn-strip">
            {tr('new.splitWarning')} <span className="mono">({splitGroups[0]!.requestIds.join(' + ')} = ${splitGroups[0]!.combinedValueUSD.toLocaleString('en-US')})</span>{' '}
            <span className="m-clause">SCPP 7.2</span>
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <button className="btn btn--primary" disabled={!canSubmit} onClick={submit}>
            {tr('new.submit')}
          </button>
        </div>
      </section>
    </>
  );
}
