import { METHODS, stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { useDialogA11y } from '../useDialogA11y';
import { calendarOf, expectedAwardDate, todayIso, useStore } from '../store';
import { DevChip } from './DevChip';
import { fmtMoney, stageDevWd, stageViewStatus, tenderStatus } from './derive';
import { Icon } from './Icon';

/** 440px preview drawer — stage segments + per-stage deviation, opens onto the file. */
export default function QuickLook({ tenderId, onClose }: { tenderId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { panelRef, titleId } = useDialogA11y(onClose);
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);
  const tender = state.tenders.find((x) => x.id === tenderId);
  if (!tender) return null;

  const method = METHODS.find((m) => m.id === tender.methodId);
  const status = tenderStatus(tender, today, cal);
  const award = expectedAwardDate(tender);

  return (
    <div className="op-drawer" onClick={onClose}>
      <div
        ref={panelRef}
        className="op-drawer__panel"
        onClick={(e) => e.stopPropagation()}
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="op-drawer__head">
          <div className="op-drawer__main">
            <div className="op-drawer__namerow">
              <span className="op-drawer__name" id={titleId}>{tender.title[lang]}</span>
              <StatusPill status={status}>{t(`status.${status}`)}</StatusPill>
            </div>
            <div className="op-drawer__sub">
              <span className="op-code">{tender.code}</span> · {method ? method[lang] : ''} · {fmtMoney(tender.estimatedValueUSD)}
              {award && (
                <>
                  {' · '}
                  {t('ql.award')} <span className="op-code">{award}</span>
                </>
              )}
            </div>
          </div>
          <button className="op-drawer__close" onClick={onClose} aria-label={t('ql.close')}>
            ✕
          </button>
        </div>

        <div className="op-drawer__body">
          <div>
            <div className="op-drawer__label">{t('ql.segs')}</div>
            <div className="op-segs">
              {tender.stages.map((s) => {
                const st = stageViewStatus(tender, s, today);
                return <span key={s.key} className={`op-seg op-seg--${st}`} />;
              })}
            </div>
          </div>

          <div>
            <div className="op-drawer__label">{t('ql.stages')}</div>
            <div className="op-drawer__items">
              {tender.stages.map((s) => {
                const def = stageByKey(s.key);
                const st = stageViewStatus(tender, s, today);
                const from = s.plannedFrom ?? '—';
                const to = s.actualTo ?? s.plannedTo ?? '—';
                return (
                  <div key={s.key} className="op-drawer__item">
                    <div className="op-drawer__main">
                      <div className="op-drawer__iname">{def ? def[lang] : s.key}</div>
                      <div className="op-drawer__irange">
                        {from} → {to}
                      </div>
                    </div>
                    <DevChip wd={stageDevWd(s, today, cal)} className="op-drawer__idev op-dev" />
                    <StatusPill status={st}>{t(`status.${st}`)}</StatusPill>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="op-drawer__foot">
          <a className="op-btn-ghost" href={`#/operator/t/${tender.id}/report`}>
            <Icon name="printer" size={13} />
            {t('ql.a4')}
          </a>
          <span style={{ flex: 1 }} />
          <button
            className="op-btn-primary"
            onClick={() => {
              onClose();
              window.location.hash = `#/operator/t/${tender.id}`;
            }}
          >
            {t('ql.openFile')}
          </button>
        </div>
      </div>
    </div>
  );
}
