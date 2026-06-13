import { Fragment } from 'react';

export interface StepperProps {
  steps: readonly string[];
  /** index of the current step */
  current: number;
  onSelect?: (index: number) => void;
}

/** Evaluation stepper: done (green ✓) / current (filled) / todo (muted). */
export function Stepper({ steps, current, onSelect }: StepperProps) {
  return (
    <div className="m-stepper">
      {steps.map((label, i) => (
        <Fragment key={label}>
          {i > 0 && <span className="m-stepper__sep" />}
          <button
            type="button"
            className={`m-step${i < current ? ' m-step--done' : i === current ? ' m-step--now' : ''}`}
            aria-current={i === current ? 'step' : undefined}
            onClick={onSelect ? () => onSelect(i) : undefined}
          >
            <span className="m-step__c">{i < current ? '✓' : i + 1}</span>
            <span className="m-step__t">{label}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}
