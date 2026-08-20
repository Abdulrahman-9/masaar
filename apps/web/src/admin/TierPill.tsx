import type { ApprovalTier, ApprovalTiers } from '@masaar/scpp-rules';
import { useTranslation } from 'react-i18next';
import { fmtMoney } from '../operator/derive';

/**
 * The approval-ladder pill (client decision ق1): which BODY clears a request of this value.
 *
 * Deliberately NOT a StatusPill — the same reasoning that keeps `.acc-role` out of the status
 * vocabulary. A tier is a standing authority band, not a lifecycle state: it does not progress,
 * it cannot be "late", and painting it with `--status-*` would spend a closed semantic colour on
 * information that is not a status. It therefore reads in the BRAND vocabulary the client named:
 * amber for the joint committee, navy for the parent company, muted paper for the operator's own
 * authority (which opens no gate at all).
 */

/**
 * The band sentence for a tier, as a translation key + its live figures — pure, so the ladder
 * shown in a tooltip, in the explainer and in the operator form is provably the same one the
 * engine judged with (no restated thresholds anywhere).
 */
export function tierBand(tier: ApprovalTier, tiers: ApprovalTiers): { key: string; params: Record<string, string> } {
  if (tier === 'OPERATOR') return { key: 'tier.band.OPERATOR', params: { max: fmtMoney(tiers.operatorMaxUSD) } };
  if (tier === 'JMC') return { key: 'tier.band.JMC', params: { min: fmtMoney(tiers.operatorMaxUSD), max: fmtMoney(tiers.jmcMaxUSD) } };
  return { key: 'tier.band.MDOC', params: { min: fmtMoney(tiers.jmcMaxUSD) } };
}

/**
 * The band as a compact machine expression («≤ $5,000,000», «> $5,000,000 → $10,000,000»),
 * for the dense read-only ladder in the operator form where the prose sentence would crowd the
 * dialog. Latin digits and $ come from fmtMoney; the caller renders it in a mono LTR island.
 */
export function tierRange(tier: ApprovalTier, tiers: ApprovalTiers): string {
  if (tier === 'OPERATOR') return `≤ ${fmtMoney(tiers.operatorMaxUSD)}`;
  if (tier === 'JMC') return `> ${fmtMoney(tiers.operatorMaxUSD)} → ${fmtMoney(tiers.jmcMaxUSD)}`;
  return `> ${fmtMoney(tiers.jmcMaxUSD)}`;
}

/** The ladder top to bottom — one order for every surface that lists it. */
export const TIER_ORDER: ApprovalTier[] = ['OPERATOR', 'JMC', 'MDOC'];

const MOD: Record<ApprovalTier, string> = { OPERATOR: 'operator', JMC: 'jmc', MDOC: 'mdoc' };

export function TierPill({ tier, tiers }: { tier: ApprovalTier; tiers: ApprovalTiers }) {
  const { t } = useTranslation();
  const band = tierBand(tier, tiers);
  return (
    <span className={`ad-tier ad-tier--${MOD[tier]}`} title={t(band.key, band.params)}>
      {t(`tier.pill.${tier}`)}
    </span>
  );
}
