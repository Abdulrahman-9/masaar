import { stageByKey } from '@masaar/scpp-rules';
import { PathBadge, StatusPill } from '@masaar/ui';
import { useTranslation } from 'react-i18next';
import { currentStage, stageStatus, todayIso, totalDeviationDays, useStore, type Tender } from '../store';

function TenderCard({ t }: { t: Tender }) {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const today = todayIso();
  const stage = currentStage(t);
  const stageDef = stage ? stageByKey(stage.key) : undefined;
  const deviation = totalDeviationDays(t);
  const done = t.stages.filter((s) => s.actualTo).length;

  return (
    <a className="tcard" href={`#/operator/t/${t.id}`}>
      <div className="tcard__head">
        <span className="mono tcard__code">{t.code}</span>
        <PathBadge id={t.methodId} lang={lang} />
      </div>
      <div className="tcard__title">{t.title[lang]}</div>
      <div className="tcard__meta">
        <span>
          {tr('operator.value')}: <span className="mono">${t.estimatedValueUSD.toLocaleString('en-US')}</span>
        </span>
        <span>
          {tr('operator.progress')}: <span className="mono">{done}/{t.stages.length}</span>
        </span>
      </div>
      <div className="tcard__foot">
        {stage && stageDef ? (
          <StatusPill status={stageStatus(stage, today) === 'delayed' ? 'delayed' : 'progress'}>
            {stageDef[lang]}
          </StatusPill>
        ) : (
          <StatusPill status="done">{tr('operator.allDone')}</StatusPill>
        )}
        {deviation > 0 && (
          <StatusPill status="delayed">
            {tr('operator.deviationDays')} <span className="mono">+{deviation}</span>
          </StatusPill>
        )}
      </div>
    </a>
  );
}

export default function Dashboard() {
  const { t: tr } = useTranslation();
  const { state } = useStore();

  return (
    <>
      <div className="page-head">
        <h1>{tr('operator.title')}</h1>
        <a className="btn btn--primary" href="#/operator/new">
          {tr('operator.newRequest')}
        </a>
      </div>
      <div className="tcards">
        {state.tenders.map((t) => (
          <TenderCard key={t.id} t={t} />
        ))}
      </div>
    </>
  );
}
