import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const SHOP_IDS = ["7494616530852874052", "7494684798870062816"];
const WAREHOUSES = {
  globe: "7637024275811534612",
  panlian: "7646520528866346773",
};

type WarehouseTier = {
  minWeightKg: number | null;
  maxWeightKg: number | null;
  minInclusive: boolean;
  maxInclusive: boolean;
  maxLengthCm: number | null;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
  baseFee: number;
};

const globeTiers = [
  [0, 1, 2.5], [1, 3, 3.5], [3, 5, 6], [5, 10, 8], [10, 20, 14],
  [20, 30, 20], [30, 40, 30], [40, 50, 33], [50, 60, 40], [60, 70, 47],
].map(([minWeightKg, maxWeightKg, baseFee]) => ({
  minWeightKg,
  maxWeightKg,
  minInclusive: false,
  maxInclusive: true,
  maxLengthCm: null,
  maxWidthCm: null,
  maxHeightCm: null,
  baseFee,
}));

const panlianTiers = [
  [0, 0.5, 15, 10, 3, 2.5], [0.5, 1, null, null, null, 3],
  [1, 2, null, null, null, 3.5], [2, 3, null, null, null, 4],
].map(([minWeightKg, maxWeightKg, maxLengthCm, maxWidthCm, maxHeightCm, baseFee]) => ({
  minWeightKg,
  maxWeightKg,
  minInclusive: false,
  maxInclusive: true,
  maxLengthCm,
  maxWidthCm,
  maxHeightCm,
  baseFee,
}));

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

async function upsertPlatformRule(
  db: Prisma.TransactionClient,
  shopId: string,
  effectiveFrom: string,
  effectiveTo: string | null,
  tiers: Array<{ minOrderAmount: number | null; maxOrderAmount: number | null; minInclusive: boolean; maxInclusive: boolean; platformRatePercent: number; perUnitFee: number; currency: string }>,
  notes: string,
) {
  const saved = await db.profitShopCostRule.upsert({
    where: {
      platform_shopId_costType_effectiveFrom: {
        platform: "TIKTOK",
        shopId,
        costType: "PLATFORM_FULFILLMENT",
        effectiveFrom: date(effectiveFrom),
      },
    },
    create: {
      platform: "TIKTOK",
      shopId,
      costType: "PLATFORM_FULFILLMENT",
      ratePercent: 6,
      fixedPerOrder: 0,
      fixedPerUnit: 0,
      currency: "BRL",
      effectiveFrom: date(effectiveFrom),
      effectiveTo: effectiveTo ? date(effectiveTo) : null,
      enabled: true,
      notes,
    },
    update: {
      ratePercent: 6,
      fixedPerOrder: 0,
      fixedPerUnit: 0,
      currency: "BRL",
      effectiveTo: effectiveTo ? date(effectiveTo) : null,
      enabled: true,
      notes,
    },
  });
  await db.profitPlatformFeeTier.deleteMany({ where: { ruleId: saved.id } });
  await db.profitPlatformFeeTier.createMany({
    data: tiers.map((tier) => ({ ruleId: saved.id, ...tier })),
  });
}

async function upsertWarehouseRule(
  db: Prisma.TransactionClient,
  tiktokWarehouseId: string,
  effectiveFrom: string,
  data: {
    pricingMode: "WEIGHT_TIER" | "PACKAGE_TIER";
    billingUnit?: "SELLER_UNIT" | "INTERNAL_COMPONENT";
    baseOrderFee: number;
    additionalUnitFee: number;
    overweightThresholdKg: number | null;
    overweightFeePerKg: number;
    notes: string;
    feeTiers: WarehouseTier[];
  },
) {
  const mapping = await db.tikTokWarehouseMapping.findFirst({
    where: { tiktokWarehouseId },
    select: { warehouseId: true },
  });
  if (!mapping) throw new Error(`Missing TikTok warehouse mapping: ${tiktokWarehouseId}`);

  const existing = await db.warehouseFulfillmentRule.findFirst({
    where: { warehouseId: mapping.warehouseId, shopId: null, effectiveFrom: date(effectiveFrom) },
    orderBy: { createdAt: "asc" },
  });
  const ruleData = {
    warehouseId: mapping.warehouseId,
    shopId: null,
    pricingMode: data.pricingMode,
    billingUnit: data.billingUnit || "SELLER_UNIT",
    baseOrderFee: data.baseOrderFee,
    firstUnitFee: 0,
    additionalUnitFee: data.additionalUnitFee,
    volumetricDivisor: 6000,
    overweightThresholdKg: data.overweightThresholdKg,
    overweightFeePerKg: data.overweightFeePerKg,
    currency: "BRL",
    effectiveFrom: date(effectiveFrom),
    effectiveTo: null,
    enabled: true,
    notes: data.notes,
  };
  const saved = existing
    ? await db.warehouseFulfillmentRule.update({ where: { id: existing.id }, data: ruleData })
    : await db.warehouseFulfillmentRule.create({ data: ruleData });
  await db.warehouseFulfillmentFeeTier.deleteMany({ where: { ruleId: saved.id } });
  await db.warehouseFulfillmentFeeTier.createMany({
    data: data.feeTiers.map((tier) => ({ ruleId: saved.id, ...tier })),
  });
}

async function main() {
  const [shops, mappings] = await Promise.all([
    prisma.tikTokShopSetting.findMany({ where: { shopId: { in: SHOP_IDS } }, select: { shopId: true, shopName: true } }),
    prisma.tikTokWarehouseMapping.findMany({ where: { tiktokWarehouseId: { in: Object.values(WAREHOUSES) } }, select: { tiktokWarehouseId: true, warehouseId: true } }),
  ]);
  if (shops.length !== SHOP_IDS.length || mappings.length !== Object.keys(WAREHOUSES).length) {
    throw new Error("3001 shop or warehouse mapping verification failed");
  }

  const preview = {
    shops: shops.map((shop) => shop.shopName),
    platformRules: ["2026-06-01 to 2026-07-14: platform 6% + R$4/unit, fulfillment 6%", "2026-07-15 onward: <R$50 platform 10% + R$4/unit; >=R$50 platform 6% + R$6/unit; fulfillment 6%"],
    warehouseRules: ["环球盛通 from 2026-06-05", "磐联云仓 from 2026-06-03"],
  };
  console.log(JSON.stringify(preview));
  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to write these 3001 rules.");
    return;
  }

  await prisma.$transaction(async (db) => {
    for (const shopId of SHOP_IDS) {
      await upsertPlatformRule(db, shopId, "2026-06-01", "2026-07-14", [{
        minOrderAmount: null,
        maxOrderAmount: null,
        minInclusive: true,
        maxInclusive: false,
        platformRatePercent: 6,
        perUnitFee: 4,
        currency: "BRL",
      }], "2026-07-15 前：履约 6%，平台 6% + R$4/件");
      await upsertPlatformRule(db, shopId, "2026-07-15", null, [
        { minOrderAmount: null, maxOrderAmount: 50, minInclusive: true, maxInclusive: false, platformRatePercent: 10, perUnitFee: 4, currency: "BRL" },
        { minOrderAmount: 50, maxOrderAmount: null, minInclusive: true, maxInclusive: false, platformRatePercent: 6, perUnitFee: 6, currency: "BRL" },
      ], "2026-07-15 起：按商品单件售价；履约 6%，平台按价格档位 + 每件固定费");
    }

    await upsertWarehouseRule(db, WAREHOUSES.globe, "2026-06-05", {
      pricingMode: "WEIGHT_TIER",
      baseOrderFee: 1,
      additionalUnitFee: 0.5,
      overweightThresholdKg: 70,
      overweightFeePerKg: 0.1,
      feeTiers: globeTiers,
      notes: "环球盛通：计费重取实重和体积重较大值，体积除数 6000；包材 R$1/单，第二件起 R$0.5/件。",
    });
    await upsertWarehouseRule(db, WAREHOUSES.panlian, "2026-06-03", {
      pricingMode: "WEIGHT_TIER",
      billingUnit: "INTERNAL_COMPONENT",
      baseOrderFee: 0,
      additionalUnitFee: 0.5,
      overweightThresholdKg: null,
      overweightFeePerKg: 0,
      feeTiers: panlianTiers,
      notes: "磐联云仓：一件代发按实际重量计费，0<x<=0.5kg 为 R$2.5/票；超 70kg 另议；不收包材费。",
    });
  });
  console.log("3001 profit rules written successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
