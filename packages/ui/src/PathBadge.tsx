import { METHODS } from '@masaar/scpp-rules';
import type { Lang } from './CapMeter';

export interface PathBadgeProps {
  /** method id 1–8 (SCPP §11) */
  id: number;
  lang: Lang;
  showClause?: boolean;
}

/** Compact method chip: «07 المناقصة العامة» / "07 Public Tender" + clause. */
export function PathBadge({ id, lang, showClause = false }: PathBadgeProps) {
  const m = METHODS.find((x) => x.id === id);
  if (!m) return null;
  return (
    <span className="m-path">
      <span className="m-path__no">{String(m.id).padStart(2, '0')}</span>
      <span>{lang === 'ar' ? m.ar : m.en}</span>
      {showClause && <span className="m-clause">SCPP {m.scpp}</span>}
    </span>
  );
}
