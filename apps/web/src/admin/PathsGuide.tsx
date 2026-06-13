import { METHODS, minParticipants, stageByKey, suggestMethod } from '@masaar/scpp-rules';
import { PathBadge } from '@masaar/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultStageKeys } from '../store';

/** Interactive 8-method explainer on the Engineering-Blueprint skin. */
export default function PathsGuide() {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const [selected, setSelected] = useState(7);

  const method = METHODS.find((m) => m.id === selected)!;
  const stages = defaultStageKeys(selected);
  const minInv = minParticipants(method.key);
  // the routing reason doubles as the method's condition summary
  const reason = suggestMethod({
    estimatedValueUSD:
      method.key === 'low-value' ? 5_000 : method.key === 'rfp' ? 50_000 : 1_000_000,
    soleSourceCase: method.key === 'sole' ? 'a' : undefined,
    hasRecentQualifiedBidders: method.key === 'fast-track',
    specializedOrEmergency: method.key === 'direct',
    technicallyComplex: method.key === 'two-phased',
    hasPreQualifiedList: method.key === 'limited',
  });

  return (
    <section className="card">
      <h2>{tr('paths.title')}</h2>
      <p className="hint">{tr('paths.hint')}</p>

      <div className="m-skin m-skin--blueprint skin-stage" style={{ marginTop: 8 }}>
        <div className="g-row">
          {METHODS.map((m) => (
            <button
              key={m.id}
              className={`paths-pick${selected === m.id ? ' paths-pick--on' : ''}`}
              onClick={() => setSelected(m.id)}
            >
              <PathBadge id={m.id} lang={lang} />
            </button>
          ))}
        </div>

        <div className="paths-detail">
          <div className="mct-head" style={{ marginBottom: 4 }}>
            <h3 style={{ margin: 0 }}>
              {lang === 'ar' ? method.ar : method.en} <span className="m-clause">SCPP {method.scpp}</span>
            </h3>
            {minInv > 0 && (
              <span className="g-hint">
                {tr('new.minParticipants')}: <span className="mono">{minInv}</span>
              </span>
            )}
          </div>
          <p className="paths-cond">{lang === 'ar' ? reason.reasonAr : reason.reasonEn}</p>

          <div className="g-label" style={{ marginTop: 14 }}>{tr('paths.stages')}</div>
          <ol className="paths-stages">
            {stages.map((key, i) => (
              <li key={key}>
                <span className="mono paths-no">{String(i + 1).padStart(2, '0')}</span>
                {stageByKey(key)?.[lang] ?? key}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
