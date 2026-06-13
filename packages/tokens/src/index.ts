/**
 * Masaar design tokens — TypeScript mirror of css/tokens.css
 * (single source of truth: the CSS file, copied from the approved
 * design handoff `colors_and_type.css`).
 */

export const brand = {
  navy900: '#061826',
  navy800: '#0B2540',
  navy700: '#143A5E',
  navy600: '#1F5180',
  navy500: '#2E6BA1',
  navy100: '#DDE7F1',
  navy50: '#EEF3F8',
  amber700: '#8C5A18',
  amber600: '#B5751F',
  amber500: '#C9892C',
  amber400: '#DBA659',
  amber100: '#F4E4C4',
  amber50: '#FAF1DD',
} as const;

export const paper = {
  50: '#FBF9F4',
  100: '#F4F1EA',
  200: '#ECE7DC',
  300: '#D9D3C4',
  400: '#B9B2A1',
  500: '#8E8775',
  600: '#645E50',
  700: '#443F35',
  800: '#2A2620',
  900: '#14110D',
} as const;

export const ink = {
  1: '#0B1320',
  2: '#364254',
  3: '#6B7686',
  4: '#98A1B0',
  onDark: '#F4F1EA',
  onDark2: '#B6BAC3',
} as const;

/** The six platform statuses — one status language across all screens. */
export const status = {
  planned: { fg: '#4B5972', bg: '#E6E8EE' },
  progress: { fg: '#1E6FB3', bg: '#DCEAF7' },
  done: { fg: '#1F7A4D', bg: '#DBEEDF' },
  risk: { fg: '#B5751F', bg: '#FAEFD4' },
  delayed: { fg: '#B23535', bg: '#F8DEDB' },
  blocked: { fg: '#6B4FB5', bg: '#E6DFF7' },
} as const;

export type StatusKey = keyof typeof status;

export const fonts = {
  sansAr: "'IBM Plex Sans Arabic', 'IBM Plex Sans', system-ui, sans-serif",
  sansEn: "'IBM Plex Sans', 'IBM Plex Sans Arabic', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
} as const;

/** Motion system — three durations, two curves. Functional motion only. */
export const motion = {
  durFast: 120,
  durBase: 200,
  durSlow: 320,
  easeOut: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/** Cap meters flip to "risk" at 80% of a cap, "breach" at/past 100%. */
export const CAP_RISK_RATIO = 0.8;
