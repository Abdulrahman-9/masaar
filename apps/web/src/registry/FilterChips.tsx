import { useTranslation } from 'react-i18next';
import { fmtCount } from '../operator/derive';
import { Icon } from '../operator/Icon';
import './registry.css';

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
  /**
   * A filter that arrived from the URL (§5-ج). It renders as a STANDING chip with its own
   * dismiss control instead of a toggle: the reader has to be able to see why the registry is
   * short and widen it in one click, and dismissing has to rewrite the hash so the address and
   * the screen never drift apart. A toggle cannot do that — a pressed toggle looks the same
   * whether the reader chose it or a link chose it for them.
   */
  onRemove?: () => void;
}

export interface FilterChipsProps {
  chips: FilterChip[];
  onSelect: (key: string) => void;
  lang: 'ar' | 'en';
}

export function FilterChips({ chips, onSelect, lang }: FilterChipsProps) {
  const { t } = useTranslation();
  return (
    <>
      {chips.map((c) =>
        c.onRemove ? (
          // a <button> inside a <button> is invalid HTML, so the body is a <span> and only the
          // dismiss is focusable — one control, one act, reachable by keyboard
          <span key={c.key || 'all'} className="wz-chip wz-chip--on reg-chip" title={c.title}>
            {c.label}
            {c.count !== undefined && <span className="acc-count">{fmtCount(c.count, lang)}</span>}
            <button
              type="button"
              className="reg-chip__x"
              aria-label={t('reg.filter.remove', { label: c.label })}
              onClick={c.onRemove}
            >
              <Icon name="close" size={11} strokeWidth={2.4} />
            </button>
          </span>
        ) : (
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
        ),
      )}
    </>
  );
}
