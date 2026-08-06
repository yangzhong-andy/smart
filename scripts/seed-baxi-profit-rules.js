'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const TAX_RULES = [
  { shopId: '7494616530852874052', ratePercent: 4, notes: '店铺01（赖强主体）固定营业额税率' },
  { shopId: '7494684798870062816', ratePercent: 3, notes: '店铺02（林曦主体）固定营业额税率' },
];

async function upsertPlatformRule(shopId, effectiveFrom, effectiveTo, rule, tiers) {
  await prisma.$transaction(async (tx) => {
    const saved = await tx.profitShopCostRule.upsert({
      where: {
        platform_shopId_costType_effectiveFrom: {
          platform: 'TIKTOK',
          shopId,
          costType: 'PLATFORM_FULFILLMENT',
          effectiveFrom,
        },
      },
      create: {
        platform: 'TIKTOK',
        shopId,
        costType: 'PLATFORM_FULFILLMENT',
        ratePercent: rule.ratePercent,
        fixedPerUnit: rule.fixedPerUnit,
        currency: 'BRL',
        effectiveFrom,
        effectiveTo,
        notes: rule.notes,
      },
      update: {
        ratePercent: rule.ratePercent,
        fixedPerUnit: rule.fixedPerUnit,
        effectiveTo,
        enabled: true,
        notes: rule.notes,
      },
    });
    await tx.profitPlatformFeeTier.deleteMany({ where: { ruleId: saved.id } });
    if (tiers.length > 0) {
      await tx.profitPlatformFeeTier.createMany({
        data: tiers.map((tier) => ({ ruleId: saved.id, currency: 'BRL', ...tier })),
      });
    }
  });
}

async function main() {
  const effectiveFrom = new Date('2026-06-01T00:00:00.000Z');
  const shopIds = TAX_RULES.map((rule) => rule.shopId);
  const shops = await prisma.tikTokShopSetting.findMany({
    where: { shopId: { in: shopIds } },
    select: { shopId: true },
  });
  if (shops.length !== shopIds.length) throw new Error('3001 shop mapping validation failed');

  for (const rule of TAX_RULES) {
    await prisma.profitShopCostRule.upsert({
      where: {
        platform_shopId_costType_effectiveFrom: {
          platform: 'TIKTOK',
          shopId: rule.shopId,
          costType: 'TAX',
          effectiveFrom,
        },
      },
      create: {
        platform: 'TIKTOK',
        shopId: rule.shopId,
        costType: 'TAX',
        ratePercent: rule.ratePercent,
        effectiveFrom,
        currency: 'BRL',
        notes: rule.notes,
      },
      update: {
        ratePercent: rule.ratePercent,
        effectiveTo: null,
        enabled: true,
        notes: rule.notes,
      },
    });

    await upsertPlatformRule(
      rule.shopId,
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-07-14T00:00:00.000Z'),
      { ratePercent: 6, fixedPerUnit: 0, notes: '调整前：物流 6% + 平台 6% + 每件 R$4' },
      [
        {
          minOrderAmount: null,
          maxOrderAmount: null,
          minInclusive: true,
          maxInclusive: false,
          platformRatePercent: 6,
          perUnitFee: 4,
        },
      ],
    );
    await upsertPlatformRule(
      rule.shopId,
      new Date('2026-07-15T00:00:00.000Z'),
      null,
      { ratePercent: 6, fixedPerUnit: 0, notes: '物流固定 6%；平台自 2026-07-15（巴西时间）按订单金额分档' },
      [
        {
          minOrderAmount: null,
          maxOrderAmount: 50,
          minInclusive: true,
          maxInclusive: false,
          platformRatePercent: 10,
          perUnitFee: 4,
        },
        {
          minOrderAmount: 50,
          maxOrderAmount: null,
          minInclusive: true,
          maxInclusive: false,
          platformRatePercent: 6,
          perUnitFee: 6,
        },
      ],
    );
  }
  console.log(`Seeded ${TAX_RULES.length} tax rules and ${TAX_RULES.length * 2} platform rules for baxi`);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
