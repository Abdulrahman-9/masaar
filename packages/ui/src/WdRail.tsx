import type { ReactNode } from 'react';

export interface WdRailMarker {
  /** working-day position of the marker */
  at: number;
  label: string;
}

export interface WdRailProps {
  /** working days elapsed since the trigger */
  elapsed: number;
  /** rail length in working days */
  total?: number;
  /** deadline markers, ascending (default: MCT 14/21 WD) */
  markers?: readonly WdRailMarker[];
  title?: ReactNode;
}

const MCT_MARKERS: readonly WdRailMarker[] = [
  { at: 14, label: '14 WD' },
  { at: 21, label: '21 WD' },
];

/**
 * Working-day rail with deadline markers — color shifts as deadlines pass:
 * navy → orange past the first marker → red past the last.
 */
export function WdRail({ elapsed, total = 24, markers = MCT_MARKERS, title }: WdRailProps) {
  const first = markers[0]?.at ?? total;
  const last = markers[markers.length - 1]?.at ?? total;
  const tone = elapsed > last ? 'late' : elapsed > first ? 'warn' : 'ok';
  const fillPct = Math.min((elapsed / total) * 100, 100);

  return (
    <div className={`m-rail m-rail--${tone}`}>
      <div className="m-rail__head">
        {title != null && <span className="m-rail__title">{title}</span>}
        <span className="m-rail__day">{`DAY ${elapsed} / ${total} WD`}</span>
      </div>
      <div className="m-rail__track">
        <div className="m-rail__fill" style={{ width: `${fillPct}%` }} />
        {markers.map((m) => (
          <div key={m.at} className="m-rail__mk" style={{ insetInlineStart: `${(m.at / total) * 100}%` }} />
        ))}
      </div>
      <div className="m-rail__lbls">
        <span>0</span>
        {markers.map((m) => (
          <span key={m.at}>{m.label}</span>
        ))}
        <span>{total}</span>
      </div>
    </div>
  );
}
