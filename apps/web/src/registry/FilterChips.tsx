import { fmtCount } from '../operator/derive';

/**
 * Registry layer (batch 1) — a generic toggle-chip row (`.wz-chip`) shared by
 * every list screen. Each chip reports its pressed state to assistive tech via
 * `aria-pressed`; a count badge (`.acc-count`) is shown when provided.
 * Rendered as a fragment so the chips sit directly in the caller's filter row.
 */
export interface FilterChip {
  key: string;
  label: string;
  count?: number;
  active: boolean;
  /** hover explanation — used for chips whose meaning is not obvious from the label */
  title?: string;
}

export interface FilterChipsProps {
  chips: FilterChip[];
  onSelect: (key: string) => void;
  lang: 'ar' | 'en';
}

export function FilterChips({ chips, onSelect, lang }: FilterChipsProps) {
  return (
    <>
      {chips.map((c) => (
        <button
          key={c.key || 'all'}
          type="button"
          className={`wz-chip${c.active ? ' wz-chip--on' : ''}`}
          aria-pressed={c.active}
          title={c.title}
          onClick={() => onSelect(c.key)}
        >
          {c.label}
          {c.count !== undefined && <span className="acc-count">{fmtCount(c.count, lang)}</span>}
        </button>
      ))}
    </>
  );
}
