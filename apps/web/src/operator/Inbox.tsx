import { stageByKey } from '@masaar/scpp-rules';
import { useTranslation } from 'react-i18next';
import { calendarOf, todayIso, useStore } from '../store';
import { deriveTasks, fmtCount, fmtDate, groupTasks, STAGE_CLAUSE, STAGE_ICON, type DerivedTask, type TaskGroup } from './derive';
import { Icon } from './Icon';

const GROUPS: TaskGroup[] = ['late', 'today', 'week'];

function dueLabel(task: DerivedTask, lang: 'ar' | 'en', t: ReturnType<typeof useTranslation>['t']): string {
  if (task.group === 'late') return t('dev.overdueWd', { n: fmtCount(Math.abs(task.dueWd), lang) });
  if (task.group === 'today') return t('dev.dueToday');
  return t('dev.dueWd', { n: fmtCount(task.dueWd, lang) });
}

export default function Inbox() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);

  const tasks = deriveTasks(state, today, cal);
  const grouped = groupTasks(tasks);
  const tenderCount = new Set(tasks.map((x) => x.tender.id)).size;

  // fmtDate: Arabic month/weekday names, guaranteed Latin digits (client decision «كل الأرقام لاتينية»).
  const dateLabel = fmtDate(today, lang);

  return (
    <div className="op-page op-page--inbox">
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('inbox.title')}</h1>
          <div className="op-page__sub">
            {t('inbox.sub', { date: dateLabel, tasks: fmtCount(tasks.length, lang), tenders: fmtCount(tenderCount, lang) })}
          </div>
        </div>
        <div className="op-legend">
          {GROUPS.map((g) => (
            <span key={g} className={`op-legend__i op-legend--${g}`}>
              <span className="op-legend__dot" />
              {t(`inbox.leg.${g}`)} {fmtCount(grouped[g].length, lang)}
            </span>
          ))}
        </div>
      </div>

      <div className="op-guide">
        <Icon name="clock" size={15} />
        <span>{t('inbox.guide')}</span>
      </div>

      {tasks.length === 0 ? (
        <div className="op-empty">{t('inbox.empty')}</div>
      ) : (
        GROUPS.filter((g) => grouped[g].length > 0).map((g) => (
          <section key={g} className={`op-group op-group--${g}`}>
            <div className="op-group__head">
              <span className="op-group__dot" />
              <span className="op-group__title">{t(`inbox.group.${g}`)}</span>
              <span className="op-group__count">{fmtCount(grouped[g].length, lang)}</span>
              <span className="op-group__rule" />
            </div>
            <div className="op-group__list">
              {grouped[g].map((task) => {
                const def = stageByKey(task.stageKey);
                const href = `#/operator/t/${task.tender.id}`;
                return (
                  <a key={task.tender.id} className={`op-task${g === 'late' ? ' op-task--late' : ''}`} href={href}>
                    <span className={`op-task__icon op-task__icon--${g}`}>
                      <Icon name={STAGE_ICON[task.stageKey] ?? 'doc'} size={16} />
                    </span>
                    <span className="op-task__body">
                      <span className="op-task__title">{t(`taskAction.${task.stageKey}`)}</span>
                      <span className="op-task__meta">
                        <span>{task.tender.title[lang]}</span>
                        <span className="op-code">{task.tender.code}</span>
                        <span className="op-task__mdot" />
                        <span>{t('inbox.stageLabel', { stage: def ? def[lang] : task.stageKey })}</span>
                        <span className="op-scpp">SCPP {STAGE_CLAUSE[task.stageKey] ?? ''}</span>
                      </span>
                    </span>
                    <span className={`op-task__due op-task__due--${g}`}>{dueLabel(task, lang, t)}</span>
                    <span className="op-cta">
                      {t('inbox.openStep')}
                      <Icon name="chevronStart" size={13} strokeWidth={2} className="op-chev-fwd" />
                    </span>
                  </a>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
