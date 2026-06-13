import { PrismaClient } from '@prisma/client';

/**
 * Seed — mirrors apps/web/src/store.tsx seedState() so the API serves the same
 * demo data the frontend prototyped against. Idempotent: clears then inserts.
 */
const prisma = new PrismaClient();

async function main() {
  // wipe in FK-safe order
  await prisma.auditLog.deleteMany();
  await prisma.guarantee.deleteMany();
  await prisma.liquidatedDamage.deleteMany();
  await prisma.extension.deleteMany();
  await prisma.variationOrder.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.mctCase.deleteMany();
  await prisma.bidder.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.document.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.tender.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();
  await prisma.operator.deleteMany();
  await prisma.holiday.deleteMany();

  const basra = await prisma.operator.create({
    data: { name: 'Basra Energy Company', nameEn: 'Basra Energy Company', financialAuthorityUSD: 5_000_000 },
  });

  await prisma.user.createMany({
    data: [
      { azureOid: 'oid-op-1', name: 'م. أحمد عبد الرحمن', email: 'op@basra.example', role: 'OPERATOR_ADMIN', operatorId: basra.id },
      { azureOid: 'oid-roc-1', name: 'د. سارة الجبوري', email: 'roc@roc.example', role: 'ROC_ADMIN' },
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
    ],
  });

  // Tender 1 — public, at technical-analysis
  const t1 = await prisma.tender.create({
    data: {
      code: 'RU-DRL-0212',
      titleAr: 'حفر آبار تقييمية — حقل الرميلة',
      titleEn: 'Appraisal well drilling — Rumaila field',
      budgetCode: 'RU-DRL-77',
      estimatedValueUSD: 4_200_000,
      method: 'PUBLIC',
      operatorId: basra.id,
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

  // Tender 3 — above FA → MCT case, at ratification
  const t3 = await prisma.tender.create({
    data: {
      code: 'MJ-EPC-0305',
      titleAr: 'إنشاء محطة عزل مركزية — حقل مجنون',
      titleEn: 'Central degassing station EPC — Majnoon field',
      budgetCode: 'MJ-EPC-04',
      estimatedValueUSD: 7_800_000,
      method: 'PUBLIC',
      operatorId: basra.id,
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

  console.log('Seed complete: 1 operator, 2 users, 4 vendors, 2 tenders, 1 contract.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
