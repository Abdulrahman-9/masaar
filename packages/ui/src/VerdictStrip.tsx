import type { AwardVerdict } from '@masaar/scpp-rules';
import type { Lang } from './CapMeter';

export interface VerdictStripProps {
  /** straight from the engine: awardVerdict(bid, estimate) */
  verdict: AwardVerdict;
  lang: Lang;
  showClause?: boolean;
}

/** The ±20% verdict strip — text, color and clause all come from the engine. */
export function VerdictStrip({ verdict, lang, showClause = true }: VerdictStripProps) {
  const sign = verdict.deltaPct >= 0 ? '+' : '−';
  return (
    <div className={`m-verdict m-verdict--${verdict.action}`}>
      <span className="m-verdict__delta">
        {sign}
        {Math.abs(verdict.deltaPct).toFixed(1)}%
      </span>
      <span>{lang === 'ar' ? verdict.ar : verdict.en}</span>
      {showClause && <span className="m-clause">SCPP {verdict.clause}</span>}
    </div>
  );
}
