import { useTranslation } from 'react-i18next';
import { fmtCount } from '../operator/derive';
import { pageCount } from './usePagination';
import './registry.css';

/**
 * Registry layer (batch 1) — the pagination control strip: range read-out,
 * page-size select and prev/next. Hidden entirely when the whole list fits on
 * one page at the smallest size (nothing to page through).
 */
export interface PaginationBarProps {
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  total: number;
  start: number;
  end: number;
  lang: 'ar' | 'en';
  sizes?: number[];
}

export function PaginationBar({ page, setPage, pageSize, setPageSize, total, start, end, lang, sizes = [10, 25, 50] }: PaginationBarProps) {
  const { t } = useTranslation();
  const smallest = Math.min(...sizes);
  if (total <= smallest) return null;

  const last = pageCount(total, pageSize);
  const atStart = page <= 1;
  const atEnd = page >= last;

  return (
    <div className="reg-pager">
      <span className="reg-pager__range">
        {t('reg.common.range', { from: fmtCount(start, lang), to: fmtCount(end, lang), n: fmtCount(total, lang) })}
      </span>
      <div className="reg-pager__controls">
        <select
          className="reg-pager__size"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label={t('reg.common.pageSize')}
        >
          {sizes.map((s) => <option key={s} value={s}>{fmtCount(s, lang)}</option>)}
        </select>
        <button
          type="button"
          className="op-btn-ghost reg-pager__btn"
          disabled={atStart}
          title={atStart ? t('reg.common.prevDisabled') : undefined}
          onClick={() => setPage(page - 1)}
        >
          {t('reg.common.prev')}
        </button>
        <button
          type="button"
          className="op-btn-ghost reg-pager__btn"
          disabled={atEnd}
          title={atEnd ? t('reg.common.nextDisabled') : undefined}
          onClick={() => setPage(page + 1)}
        >
          {t('reg.common.next')}
        </button>
      </div>
    </div>
  );
}
