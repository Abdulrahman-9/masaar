import type { StatusKey } from '@masaar/tokens';
import type { ReactNode } from 'react';

export interface StatusPillProps {
  status: StatusKey;
  children: ReactNode;
}

/** One status language across the whole platform: dot + label + tinted background. */
export function StatusPill({ status, children }: StatusPillProps) {
  return <span className={`m-pill m-pill--${status}`}>{children}</span>;
}
