// @vitest-environment jsdom
import { awardVerdict, variationOrdersCap } from '@masaar/scpp-rules';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CapMeter, PathBadge, StatusPill, Stepper, VerdictStrip, WdRail } from '@masaar/ui';

afterEach(cleanup);

describe('StatusPill', () => {
  it('renders the status modifier class and label', () => {
    const { container } = render(<StatusPill status="delayed">حيود</StatusPill>);
    const pill = container.querySelector('.m-pill');
    expect(pill?.className).toContain('m-pill--delayed');
    expect(pill?.textContent).toBe('حيود');
  });
});

describe('CapMeter', () => {
  it('reflects the engine status — breach, bilingual verdict', () => {
    const result = variationOrdersCap(1_100_000, 10_000_000); // 11% > 10% cap
    const en = render(<CapMeter result={result} lang="en" />);
    expect(en.container.querySelector('.m-meter--breach')).not.toBeNull();
    expect(en.container.querySelector('.m-meter__verdict')?.textContent).toBe('Cap breached');
    expect(en.container.querySelector('.m-clause')?.textContent).toBe('SCPP 18.1');
    cleanup();
    const ar = render(<CapMeter result={result} lang="ar" />);
    expect(ar.container.querySelector('.m-meter__verdict')?.textContent).toBe('خرق السقف');
  });

  it('caps the fill width at 100%', () => {
    const result = variationOrdersCap(2_000_000, 10_000_000); // 20% on a 10% cap
    const { container } = render(<CapMeter result={result} lang="en" />);
    expect((container.querySelector('.m-meter__fill') as HTMLElement).style.width).toBe('100%');
  });
});

describe('VerdictStrip', () => {
  it('negotiate verdict shows clause 13.3 and the engine text', () => {
    const v = awardVerdict(5_200_000, 4_200_000);
    const { container } = render(<VerdictStrip verdict={v} lang="en" />);
    expect(container.querySelector('.m-verdict--negotiate')).not.toBeNull();
    expect(container.querySelector('.m-clause')?.textContent).toBe('SCPP 13.3');
    expect(container.textContent).toContain('+23.8%');
    expect(container.textContent).toContain('negotiate');
  });
});

describe('WdRail', () => {
  it.each([
    [8, 'm-rail--ok'],
    [16, 'm-rail--warn'],
    [23, 'm-rail--late'],
  ] as const)('elapsed %d WD → %s', (elapsed, cls) => {
    const { container } = render(<WdRail elapsed={elapsed} />);
    expect(container.querySelector(`.${cls}`)).not.toBeNull();
    expect(container.querySelector('.m-rail__day')?.textContent).toBe(`DAY ${elapsed} / 24 WD`);
  });
});

describe('Stepper', () => {
  it('marks done/current and fires onSelect', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Stepper steps={['فتح فني', 'تحليل فني', 'فتح تجاري', 'تحليل تجاري']} current={1} onSelect={onSelect} />,
    );
    const steps = container.querySelectorAll('.m-step');
    expect(steps[0]?.className).toContain('m-step--done');
    expect(steps[1]?.className).toContain('m-step--now');
    expect(steps[1]?.getAttribute('aria-current')).toBe('step');
    fireEvent.click(steps[3]!);
    expect(onSelect).toHaveBeenCalledWith(3);
  });
});

describe('PathBadge', () => {
  it('renders the canonical method name in both languages', () => {
    const ar = render(<PathBadge id={7} lang="ar" />);
    expect(ar.container.textContent).toContain('المناقصة العامة');
    cleanup();
    const en = render(<PathBadge id={7} lang="en" showClause />);
    expect(en.container.textContent).toContain('Public Tender');
    expect(en.container.querySelector('.m-clause')?.textContent).toBe('SCPP 11.1');
  });

  it('renders nothing for an unknown id', () => {
    const { container } = render(<PathBadge id={99} lang="ar" />);
    expect(container.innerHTML).toBe('');
  });
});
