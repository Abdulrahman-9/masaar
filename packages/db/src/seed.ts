import { PrismaClient } from '@prisma/client';

/**
 * Seed — mirrors apps/web/src/store.tsx seedState() so the API serves the same
 * demo data the frontend prototyped against. Idempotent: clears then inserts.
 *
 * Ids are the client's own stable ids ('op-bec', 'f-ru', 'sc-ru', …) rather than
 * generated cuids, so a row in the database and the same row in the client seed
 * are literally the same record — the only way the two universes stay comparable.
 */
const prisma = new PrismaClient();

/** The three operating companies of the client seed (store.tsx seedState). */
const OPERATORS: { id: string; name: string; nameEn: string }[] = [
  { id: 'op-bec', name: 'شركة نفط البصرة', nameEn: 'Basra Oil Company' },
  { id: 'op-mjn', name: 'شركة نفط ميسان', nameEn: 'Maysan Oil Company' },
  { id: 'op-dqr', name: 'شركة نفط ذي قار', nameEn: 'Dhi Qar Oil Company' },
];

/**
 * The 13 oil fields (spec §1) with the Financial Authority their Service Contract grants
 * (§7.1 — FA lives on the contract, never on the operator). Values, codes and dates mirror
 * store.tsx exactly, so `aboveOwnFA` resolves identically on both sides:
 * t1 (Rumaila 4.2M < 5M) is within authority, t3 (Majnoon 7.8M > 3M) is above it.
 */
const FIELDS: { id: string; name: string; nameEn: string; code: string; operatorId: string; faUSD: number }[] = [
  { id: 'f-ru', name: 'الرميلة', nameEn: 'Rumaila', code: 'RU', operatorId: 'op-bec', faUSD: 5_000_000 },
  { id: 'f-wq1', name: 'غرب القرنة 1', nameEn: 'West Qurna 1', code: 'WQ1', operatorId: 'op-bec', faUSD: 5_000_000 },
  { id: 'f-wq2', name: 'غرب القرنة 2', nameEn: 'West Qurna 2', code: 'WQ2', operatorId: 'op-bec', faUSD: 5_000_000 },
  { id: 'f-zb', name: 'الزبير', nameEn: 'Zubair', code: 'ZB', operatorId: 'op-bec', faUSD: 5_000_000 },
  { id: 'f-lh', name: 'اللحيس', nameEn: 'Luhais', code: 'LH', operatorId: 'op-bec', faUSD: 4_000_000 },
  { id: 'f-tb', name: 'طوبة', nameEn: 'Tuba', code: 'TB', operatorId: 'op-bec', faUSD: 3_500_000 },
  { id: 'f-mj', name: 'مجنون', nameEn: 'Majnoon', code: 'MJ', operatorId: 'op-mjn', faUSD: 3_000_000 },
  { id: 'f-hf', name: 'الحلفاية', nameEn: 'Halfaya', code: 'HF', operatorId: 'op-mjn', faUSD: 3_000_000 },
  { id: 'f-bz', name: 'البزركان', nameEn: 'Buzurgan', code: 'BZ', operatorId: 'op-mjn', faUSD: 2_500_000 },
  { id: 'f-ag', name: 'أبو غرب', nameEn: 'Abu Ghurab', code: 'AG', operatorId: 'op-mjn', faUSD: 2_000_000 },
  { id: 'f-fk', name: 'الفكة', nameEn: 'Fakka', code: 'FK', operatorId: 'op-mjn', faUSD: 2_000_000 },
  { id: 'f-gh', name: 'الغرّاف', nameEn: 'Gharraf', code: 'GH', operatorId: 'op-dqr', faUSD: 2_000_000 },
  { id: 'f-ns', name: 'الناصرية', nameEn: 'Nasiriyah', code: 'NS', operatorId: 'op-dqr', faUSD: 2_000_000 },
];

/** Service Contract id/code convention of the client seed: `sc-ru` / `SC-RU-24`, 2024→2031. */
const CONTRACT_SIGNED_ON = new Date('2024-01-01');
const CONTRACT_EXPIRES_ON = new Date('2031-01-01');

async function main() {
  // wipe in FK-safe order (children before parents)
  await prisma.auditLog.deleteMany();
  await prisma.guarantee.deleteMany();
  await prisma.liquidatedDamage.deleteMany();
  await prisma.extension.deleteMany();
  await prisma.variationOrder.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.mctCase.deleteMany();
  await prisma.ratification.deleteMany();
  await prisma.bidderMaterialDeclaration.deleteMany();
  await prisma.bidder.deleteMany();
  await prisma.stateCompanyResponse.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.document.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.tender.deleteMany();
  await prisma.vendorEvent.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();
  await prisma.serviceContract.deleteMany();
  await prisma.field.deleteMany();
  await prisma.operator.deleteMany();
  await prisma.holiday.deleteMany();

  // Financial Authority is NOT written here — it is a property of the field's Service
  // Contract (§7.1), created below. An Operator row carries identity only.
  await prisma.operator.createMany({ data: OPERATORS });

  await prisma.field.createMany({
    data: FIELDS.map(({ id, name, nameEn, code, operatorId }) => ({ id, name, nameEn, code, operatorId })),
  });
  await prisma.serviceContract.createMany({
    data: FIELDS.map((f) => ({
      id: `sc-${f.id.slice(2)}`,
      code: `SC-${f.id.slice(2).toUpperCase()}-24`,
      fieldId: f.id,
      financialAuthorityUSD: f.faUSD,
      signedOn: CONTRACT_SIGNED_ON,
      expiresOn: CONTRACT_EXPIRES_ON,
    })),
  });

  // azureOid values match DEMO_IDENTITIES / seedState() in the client, so a session minted
  // against this database resolves to the same account on both sides.
  await prisma.user.createMany({
    data: [
      { azureOid: 'oid-opadmin-01', name: 'م. أحمد عبد الرحمن', email: 'ahmed.abdulrahman@bec.iq', role: 'OPERATOR_ADMIN', operatorId: 'op-bec' },
      { azureOid: 'oid-opuser-01', name: 'كرار محسن', email: 'karrar.mohsin@moc.iq', role: 'OPERATOR_USER', operatorId: 'op-mjn' },
      { azureOid: 'oid-roc-01', name: 'د. سارة الجبوري', email: 'sara.jubouri@roc.iq', role: 'ROC_ADMIN' },
    ],
  });

  await prisma.vendor.createMany({
    data: [
      { name: 'شركة الحفر العراقية', mooListed: true, techScore: 88, financialScore: 76, hseScore: 82 },
      { name: 'Basra Energy Services', mooListed: true, techScore: 79, financialScore: 85, hseScore: 74 },
      { name: 'النور للمقاولات النفطية', mooListed: false, techScore: 62, financialScore: 58, hseScore: 66 },
      {
        name: 'دجلة للخدمات النفطية',
        mooListed: true,
        suspended: true,
        banUntil: new Date('2026-11-01'),
        banReason: 'Refused to sign an awarded contract (14.3)',
        techScore: 71,
        financialScore: 64,
        hseScore: 59,
      },
      // the five Iraqi state companies (Article 25 / §9) — compete under the ordinary 10.4 gates (C8.4)
      { name: 'شركة حفر الآبار النفطية (IDC)', isStateCompany: true, mooListed: true, techScore: 84, financialScore: 80, hseScore: 83 },
      { name: 'شركة مشاريع النفط (SCOP)', isStateCompany: true, mooListed: true, techScore: 86, financialScore: 82, hseScore: 85 },
      { name: 'الشركة العامة للهندسة الكهربائية (HEESCO)', isStateCompany: true, mooListed: true, techScore: 78, financialScore: 75, hseScore: 79 },
      { name: 'شركة النفط الوطنية العراقية للهندسة (OEC)', isStateCompany: true, mooListed: false, techScore: 80, financialScore: 77, hseScore: 81 },
      { name: 'شركة تطوير حقول النفط (PRDC)', isStateCompany: true, mooListed: true, techScore: 82, financialScore: 79, hseScore: 84 },
    ],
  });

  // Tender 1 — public, at technical-analysis. Rumaila (op-bec): 4.2M < its 5M contract FA,
  // so §9 does not trigger even though the scope is DRILLING.
  const t1 = await prisma.tender.create({
    data: {
      code: 'RU-DRL-0212',
      titleAr: 'حفر آبار تقييمية — حقل الرميلة',
      titleEn: 'Appraisal well drilling — Rumaila field',
      budgetCode: 'RU-DRL-77',
      estimatedValueUSD: 4_200_000,
      method: 'PUBLIC',
      scope: 'DRILLING',
      operatorId: 'op-bec',
      fieldId: 'f-ru',
      evaluationStep: 1,
      announcement: {
        create: {
          mode: 'PUBLIC',
          periodDays: 23,
          newspapers: ['الصباح', 'الزمان', 'المدى'],
          lcWebsite: true,
          rocWebsite: true,
          publishedOn: new Date('2026-05-13'),
        },
      },
      bidders: {
        create: [
          { name: 'شركة الحفر العراقية', docsOk: true, bondOk: true, technicalResult: 'PASS' },
          { name: 'النور للمقاولات النفطية', docsOk: true, bondOk: true, technicalResult: 'FAIL' },
          { name: 'Basra Energy Services', docsOk: true, bondOk: true, technicalResult: 'PASS' },
        ],
      },
    },
  });
  const t1Stages = ['cost', 'approval', 'announce', 'tech-open', 'tech-analysis', 'comm-open', 'comm-analysis', 'ratify', 'sign'];
  await prisma.stage.createMany({
    data: t1Stages.map((key, order) => ({ tenderId: t1.id, key, order })),
  });

  // Tender 3 — above FA → MCT case, at ratification. Majnoon belongs to op-mjn (the
  // field/operator invariant the create path enforces), and its 3M contract FA is what
  // 7.8M exceeds — the MCT cycle below is a consequence of that figure, not a decoration.
  const t3 = await prisma.tender.create({
    data: {
      code: 'MJ-EPC-0305',
      titleAr: 'إنشاء محطة عزل مركزية — حقل مجنون',
      titleEn: 'Central degassing station EPC — Majnoon field',
      budgetCode: 'MJ-EPC-04',
      estimatedValueUSD: 7_800_000,
      method: 'PUBLIC',
      // §9 — EPC above authority triggers C8.1/C8.2; a documented SCOP decline makes it a lawful exemption
      scope: 'ENGINEERING_CONSTRUCTION',
      stateResponses: { create: [{ company: 'SCOP', status: 'DECLINED', evidence: 'اعتذار رسمي موثّق من الشركة لارتباط طاقتها بمشروع قائم (كتاب 2026/155)' }] },
      operatorId: 'op-mjn',
      fieldId: 'f-mj',
      evaluationStep: 3,
      mct: {
        create: {
          notifiedOn: new Date('2026-05-24'),
          meetingHeldOn: new Date('2026-06-08'),
          lcEstimateUSD: 7_800_000,
          mctEstimateUSD: 7_500_000,
        },
      },
      bidders: {
        create: [
          { name: 'Gulf EPC Contracting', docsOk: true, bondOk: true, technicalResult: 'PASS', priceUSD: 8_120_000 },
          { name: 'شركة المشاريع النفطية SCOP', docsOk: true, bondOk: true, technicalResult: 'PASS', priceUSD: 8_940_000 },
          { name: 'الفرات للإنشاءات', docsOk: true, bondOk: true, technicalResult: 'FAIL' },
        ],
      },
    },
  });
  await prisma.stage.createMany({
    data: t1Stages.map((key, order) => ({ tenderId: t3.id, key, order })),
  });

  // Post-award contract with live caps
  const contract = await prisma.contract.create({
    data: {
      code: 'RU-CON-0188',
      tenderId: t1.id,
      valueUSD: 12_500_000,
      termDays: 540,
      signedOn: new Date('2026-03-01'),
    },
  });
  await prisma.variationOrder.create({ data: { contractId: contract.id, valueUSD: 1_050_000, approvedOn: new Date('2026-05-01') } });
  await prisma.extension.create({ data: { contractId: contract.id, days: 90, approvedOn: new Date('2026-05-10') } });
  await prisma.liquidatedDamage.create({ data: { contractId: contract.id, valueUSD: 310_000, appliedOn: new Date('2026-06-01') } });
  await prisma.guarantee.createMany({
    data: [
      { contractId: contract.id, kind: 'PERFORMANCE', valueUSD: 650_000, expiresOn: new Date('2026-07-20') },
      { contractId: contract.id, kind: 'ADVANCE', valueUSD: 1_000_000, expiresOn: new Date('2027-01-15') },
    ],
  });

  console.log(
    `Seed complete: ${OPERATORS.length} operators, ${FIELDS.length} fields + service contracts, 3 users, 9 vendors, 2 tenders, 1 contract.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
