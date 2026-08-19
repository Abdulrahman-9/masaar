import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { useDialogA11y } from '../useDialogA11y';

/** Centered admin modal (decision / edit / governance). One decision per modal. */
export function Modal({ title, sub, onClose, children, footer }: { title: string; sub?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { panelRef, titleId } = useDialogA11y(onClose);
  return (
    <div className="ad-modal" onClick={onClose}>
      <div
        ref={panelRef}
        className="ad-modal__card"
        onClick={(e) => e.stopPropagation()}
        dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="ad-modal__head">
          <div>
            <div className="ad-modal__title" id={titleId}>{title}</div>
            {sub && <div className="ad-modal__sub">{sub}</div>}
          </div>
          <button className="op-drawer__close" onClick={onClose} aria-label={t('a11y.closeDialog')}>✕</button>
        </div>
        <div className="ad-modal__body">{children}</div>
        {footer && <div className="ad-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
