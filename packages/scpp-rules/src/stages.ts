/**
 * The eleven canonical tender stages, ported from the approved design handoff
 * (Paths.jsx STAGES — Arabic verbatim) with official English equivalents.
 * Which stages apply to which method is workflow configuration (app-level);
 * the canonical list itself is seed data.
 */
export interface StageDef {
  key: string;
  ar: string;
  en: string;
}

export const STAGES: readonly StageDef[] = [
  { key: 'cost', ar: 'المصادقة على الكلفة', en: 'Cost accreditation' },
  { key: 'approval', ar: 'استحصال الموافقة', en: 'Obtaining approval' },
  { key: 'preq', ar: 'مرحلة التأهيل المسبق', en: 'Pre-qualification' },
  { key: 'announce', ar: 'الاعلان', en: 'Announcement' },
  { key: 'invite', ar: 'ارسال الدعوات', en: 'Sending invitations' },
  { key: 'tech-open', ar: 'فتح فني', en: 'Technical opening' },
  { key: 'tech-analysis', ar: 'تحليل فني', en: 'Technical analysis' },
  { key: 'comm-open', ar: 'فتح تجاري', en: 'Commercial opening' },
  { key: 'comm-analysis', ar: 'تحليل تجاري', en: 'Commercial analysis' },
  { key: 'ratify', ar: 'المصادقة على الاحالة', en: 'Award ratification' },
  { key: 'sign', ar: 'توقيع العقد', en: 'Contract signing' },
] as const;

export function stageByKey(key: string): StageDef | undefined {
  return STAGES.find((s) => s.key === key);
}
