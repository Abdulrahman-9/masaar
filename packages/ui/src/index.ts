import './ui.css';

export { CapMeter, type CapMeterProps, type Lang } from './CapMeter';
export { KpiTile, type KpiTileProps } from './KpiTile';
export { PathBadge, type PathBadgeProps } from './PathBadge';
export { StatusPill, type StatusPillProps } from './StatusPill';
export { Stepper, type StepperProps } from './Stepper';
export { useCountUp, COUNT_UP_MS, type CountUpOpts } from './useCountUp';
export { VerdictStrip, type VerdictStripProps } from './VerdictStrip';
export { WdRail, type WdRailProps, type WdRailMarker } from './WdRail';

/** Skin wrapper class names — one system, three skins. */
export const SKINS = {
  ledger: 'm-skin',
  control: 'm-skin m-skin--control',
  blueprint: 'm-skin m-skin--blueprint',
} as const;

export type SkinKey = keyof typeof SKINS;
