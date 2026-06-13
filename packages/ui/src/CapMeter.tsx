import type { CapResult } from '@masaar/scpp-rules';
import type { ReactNode } from 'react';

export type Lang = 'ar' | 'en';

const VERDICTS: Record<CapResult['status'], { ar: string; en: string }> = {
  ok: { ar: 'ضمن السقف', en: 'Within cap' },
  risk: { ar: 'يقترب من السقف', en: 'Approaching cap' },
  breach: { ar: 'خرق السقف', en: 'Cap breached' },
};

export interface CapMeterProps {
  /** straight from the engine: variationOrdersCap(), extensionCap(), … */
  result: CapResult;
  lang: Lang;
  label?: ReactNode;
  /** override the big numeric read-out (defaults to usedPct%) */
  valueText?: string;
  showClause?: boolean;
}

/**
 * Cap meter — green → orange at ≥ 80% of the cap → red at/past it.
 * The status comes from the engine, never recomputed in the UI.
 */
export function CapMeter({ result, lang, label, valueText, showClause = true }: CapMeterProps) {
  const fillPct = Math.min((result.usedPct / result.capPct) * 100, 100);
  return (
    <div className={`m-meter m-meter--${result.status}`}>
      {(label != null || showClause) && (
        <div className="m-meter__head">
          {label != null && <span className="m-meter__label">{label}</span>}
          {showClause && <span className="m-clause">SCPP {result.clause}</span>}
        </div>
      )}
      <div className="m-meter__track">
        <div className="m-meter__fill" style={{ width: `${fillPct}%` }} />
        <div className="m-meter__tick" style={{ insetInlineStart: '80%' }} />
      </div>
      <div className="m-meter__read">
        <span className="m-meter__val">{valueText ?? `${result.usedPct.toFixed(1)}%`}</span>
        <span className="m-meter__verdict">{VERDICTS[result.status][lang]}</span>
      </div>
    </div>
  );
}
