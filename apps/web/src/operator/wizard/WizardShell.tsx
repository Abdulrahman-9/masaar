import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount } from '../derive';
import { Icon } from '../Icon';

export interface WizardCond {
  t: string;
  ok: boolean;
}
export interface WizardStep {
  label: string;
  title: string;
  sub: string;
  help: { t: string; r: string };
  conditions: WizardCond[];
  content: ReactNode;
}
export interface WizardShellProps {
  title: string;
  tenderName: string;
  code: string;
  steps: WizardStep[];
  finalLabel: string;
  finalInstitutional?: boolean;
  /** dispatched once, when the last step is confirmed */
  onFinish: () => void;
  success: { title: string; desc: string; audit: string };
  /** hash to leave to (✕ exit + success primary) */
  doneHash: string;
  /** hash for the ✕ exit / cancel (defaults to doneHash) */
  exitHash?: string;
}

export default function WizardShell({ title, tenderName, code, steps, finalLabel, finalInstitutional, onFinish, success, doneHash, exitHash }: WizardShellProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [done, setDone] = useState(false);

  const go = (hash: string) => () => { window.location.hash = hash; };

  if (done) {
    return (
      <div className="wz">
        <div className="wz-done">
          <div className="wz-done__card">
            <span className="wz-done__mark"><Icon name="check" size={28} strokeWidth={2.25} /></span>
            <div className="wz-done__t">{success.title}</div>
            <div className="wz-done__d">{success.desc}</div>
            <div className="wz-done__audit">{success.audit}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <a className="op-btn-primary" href={doneHash}>{t('wizard.continue')}</a>
              <a className="op-btn-ghost" href="#/operator">{t('wizard.backPortal')}</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cur = steps[step]!;
  const allOk = cur.conditions.every((c) => c.ok);
  const firstUnmet = cur.conditions.find((c) => !c.ok);
  const isLast = step === steps.length - 1;

  const next = () => {
    if (!allOk) return;
    if (isLast) { onFinish(); setDone(true); return; }
    const n = step + 1;
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  };

  return (
    <div className="wz">
      <header className="wz-top">
        <a className="wz-exit" href={exitHash ?? doneHash}>✕ {t('wizard.exit')}</a>
        <div className="wz-crumb">
          <span style={{ whiteSpace: 'nowrap' }}>{tenderName}</span>
          <span className="op-code">{code}</span>
          <span className="wz-crumb__sep">›</span>
          <span className="wz-crumb__title">{title}</span>
          <span className="wz-crumb__sep">›</span>
          <span className="wz-crumb__step">{t('wizard.step', { n: fmtCount(step + 1, lang), c: fmtCount(steps.length, lang) })}</span>
        </div>
        <span className="wz-save"><Icon name="check" size={12} strokeWidth={2} />{t('wizard.autosave')}</span>
      </header>

      <div className="wz-body">
        <div className="wz-side">
          <div className="wz-rail">
            {steps.map((s, i) => {
              const isDone = i < step;
              const on = i === step;
              const reachable = i <= maxStep;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                  <button
                    className={`wz-step${on ? ' wz-step--on' : ''}${isDone ? ' wz-step--done' : ''}`}
                    onClick={() => reachable && setStep(i)}
                    disabled={!reachable}
                    style={{ cursor: reachable ? 'pointer' : 'default' }}
                  >
                    <span className="wz-step__c">{isDone ? '✓' : i + 1}</span>
                    <span className="wz-step__l">{s.label}</span>
                  </button>
                  {i < steps.length - 1 && <span className={`wz-step__conn${isDone ? ' wz-step__conn--done' : ''}`} />}
                </div>
              );
            })}
          </div>
          <div className="wz-why">
            <div className="wz-why__head"><Icon name="shield" size={14} />{t('wizard.why')}</div>
            <div className="wz-why__body">{cur.help.t}</div>
            <span className="wz-why__ref">{cur.help.r}</span>
          </div>
        </div>

        <div className="wz-main">
          <div className="wz-card">
            <div className="wz-card__head">
              <div className="wz-card__title">{cur.title}</div>
              <div className="wz-card__sub">{cur.sub}</div>
            </div>
            <div className="wz-card__body">
              {cur.content}

              <div className="wz-conds">
                <div className="wz-conds__l">{t('wizard.conditions')}</div>
                {cur.conditions.map((c, i) => (
                  <div key={i} className={`wz-cond${c.ok ? ' wz-cond--ok' : ''}`}>
                    <span className="wz-cond__m">{c.ok ? '✓' : '•'}</span>
                    <span className="wz-cond__t">{c.t}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="wz-foot">
              <button className="wz-prev" onClick={() => step > 0 && setStep(step - 1)} disabled={step === 0}>
                <Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />
                {t('wizard.prev')}
              </button>
              <div className="wz-foot__end">
                <div className="wz-foot__row">
                  <button className="op-btn-ghost" onClick={go(exitHash ?? doneHash)}>{t('wizard.saveDraft')}</button>
                  <button
                    className="op-btn-primary"
                    onClick={next}
                    disabled={!allOk}
                  >
                    {isLast ? finalLabel : t('wizard.next')}
                    <Icon name="chevronStart" size={13} strokeWidth={2} className="op-chev-fwd" />
                  </button>
                </div>
                <span className={`wz-gate${allOk ? ' wz-gate--ok' : ''}`}>
                  {allOk ? (isLast && finalInstitutional ? t('wizard.institutionalNote') : '') : t('wizard.remaining', { c: firstUnmet?.t ?? '' })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
