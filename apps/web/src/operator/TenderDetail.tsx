import { stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { calendarDaysBetween, workingDaysBetween } from '@masaar/working-days';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { calendarOf, currentStage, expectedAwardDate, stageStatus, todayIso, useStore } from '../store';
import { fmtCount, fmtMoney, tenderStatus, wizardTypeFor } from './derive';
import FileBidders from './FileBidders';
import FileDocs from './FileDocs';
import FileTimeline from './FileTimeline';
import { Icon } from './Icon';
import { PathChip } from './PathChip';

type Tab = 'timeline' | 'docs' | 'bidders';

export default function TenderDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);

  const [tab, setTab] = useState<Tab>('timeline');
  const [focus, setFocus] = useState<string | null>(null);

  const tender = state.tenders.find((x) => x.id === id);
  if (!tender) {
    return (
      <div className="op-page op-page--file">
        <a className="file-back" href="#/operator">
          <Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />
          {t('file.back')}
        </a>
        <div className="op-empty">{t('file.notFound')}</div>
      </div>
    );
  }

  const status = tenderStatus(tender, today, cal);
  const active = currentStage(tender);
  const award = expectedAwardDate(tender);

  const froms = tender.stages.map((s) => s.plannedFrom).filter((d): d is string => !!d);
  const tos = tender.stages.map((s) => s.plannedTo).filter((d): d is string => !!d);
  const duration = froms.length && tos.length ? calendarDaysBetween(froms.reduce((a, b) => (a < b ? a : b)), tos.reduce((a, b) => (a > b ? a : b))) : 0;

  // "you are here" due label from the active stage
  let hereDue = '';
  if (active?.plannedTo) {
    if (today > active.plannedTo) hereDue = t('dev.overdueWd', { n: fmtCount(workingDaysBetween(active.plannedTo, today, cal), lang) });
    else {
      const rem = workingDaysBetween(today, active.plannedTo, cal);
      hereDue = rem <= 0 ? t('dev.dueToday') : t('dev.dueWd', { n: fmtCount(rem, lang) });
    }
  }

  const openWizard = (stageKey: string) => {
    window.location.hash = `#/operator/t/${tender.id}/w/${wizardTypeFor(stageKey)}`;
  };

  return (
    <div className="op-page op-page--file">
      <a className="file-back" href="#/operator">
        <Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />
        {t('file.back')}
      </a>

      <div className="file-head">
        <div className="file-head__main">
          <div className="file-head__tags">
            <span className="file-codechip">{tender.code}</span>
            <PathChip id={tender.methodId} lang={lang} />
            <StatusPill status={status}>{t(`status.${status}`)}</StatusPill>
          </div>
          <h1 className="file-title">{tender.title[lang]}</h1>
          <div className="file-meta">
            <span>{t('file.value')} <b className="op-code">{fmtMoney(tender.estimatedValueUSD)}</b></span>
            <span>{t('file.awardExpected')} <b className="op-code">{award ?? '—'}</b></span>
            <span>{t('file.plannedDuration')} <b>{t('file.days', { n: fmtCount(duration, lang) })}</b></span>
          </div>
        </div>
        <a className="op-btn-ghost" href={`#/operator/t/${tender.id}/report`}>
          <Icon name="download" size={14} />
          {t('file.reportPrint')}
        </a>
      </div>

      {active && (
        <div className="file-here">
          <span className="file-here__label"><span className="file-here__dot" />{t('file.hereLabel')}</span>
          <div className="file-here__body">
            <div className="file-here__stage">{stageByKey(active.key)?.[lang] ?? active.key}</div>
            <div className="file-here__req">
              {t('file.hereRequired', { req: t(`taskAction.${active.key}`) })}{hereDue && <> · <b>{hereDue}</b></>}
            </div>
          </div>
          <button className="file-here__cta" onClick={() => openWizard(active.key)}>
            {t('file.hereCtaLabel')}
            <Icon name="chevronStart" size={13} strokeWidth={2} className="op-chev-fwd" />
          </button>
        </div>
      )}

      <div className="file-tabs">
        {(['timeline', 'docs', 'bidders'] as Tab[]).map((k) => (
          <button key={k} className={`file-tab${tab === k ? ' file-tab--on' : ''}`} onClick={() => setTab(k)}>
            {t(`file.tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === 'timeline' && <FileTimeline tender={tender} focus={focus} onFocus={setFocus} onWizard={openWizard} />}
      {tab === 'docs' && <FileDocs tender={tender} />}
      {tab === 'bidders' && <FileBidders tender={tender} />}
    </div>
  );
}
