import { useEffect, useRef, type ReactNode } from 'react';

export interface KpiTileProps {
  label: ReactNode;
  value: number;
  /** rendered inside the value, e.g. "%" or a unit */
  suffix?: ReactNode;
  /** count up over 600 ms on first reveal (disabled under prefers-reduced-motion) */
  countUp?: boolean;
}

function useCountUp(target: number, enabled: boolean) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!enabled || reduced || typeof IntersectionObserver === 'undefined') {
      el.textContent = String(target);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const DUR = 600;
        const tick = (ts: number) => {
          const p = Math.min((ts - t0) / DUR, 1);
          el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, enabled]);

  return ref;
}

export function KpiTile({ label, value, suffix, countUp = true }: KpiTileProps) {
  const ref = useCountUp(value, countUp);
  return (
    <div className="m-kpi">
      <div className="m-kpi__l">{label}</div>
      <div className="m-kpi__v">
        <span ref={ref}>{countUp ? 0 : value}</span>
        {suffix != null && <small>{suffix}</small>}
      </div>
    </div>
  );
}
