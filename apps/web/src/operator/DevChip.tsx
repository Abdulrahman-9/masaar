import { useTranslation } from 'react-i18next';
import { fmtCount } from './derive';

/** Signed working-day deviation, rendered as a coloured chip. Shared everywhere. */
export function DevChip({ wd, className = 'op-dev' }: { wd: number; className?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  if (wd === 0) return <span className={`${className} op-dev--none`}>{t('dev.none')}</span>;
  const n = fmtCount(Math.abs(wd), lang);
  if (wd > 0) return <span className={`${className} ${wd > 5 ? 'op-dev--late' : 'op-dev--warn'}`}>{t('dev.lateWd', { n })}</span>;
  return <span className={`${className} op-dev--early`}>{t('dev.earlyWd', { n })}</span>;
}
