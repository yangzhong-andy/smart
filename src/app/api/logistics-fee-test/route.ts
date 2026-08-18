import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { calculateWarehouseFulfillmentFee } from "@/lib/warehouse-fulfillment-fees";

export const dynamic = "force-dynamic";

const finite = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function asRule(rule: any) {
  if (!rule) return null;
  return {
    ...rule,
    baseOrderFee: finite(rule.baseOrderFee),
    firstUnitFee: finite(rule.firstUnitFee),
    additionalUnitFee: finite(rule.additionalUnitFee),
    multiSkuFee: finite(rule.multiSkuFee),
    volumetricDivisor: Math.max(1, Math.round(finite(rule.volumetricDivisor, 6000))),
    overweightThresholdKg: rule.overweightThresholdKg == null ? null : finite(rule.overweightThresholdKg),
    overweightFeePerKg: finite(rule.overweightFeePerKg),
    useVolumetricWeight: Boolean(rule.useVolumetricWeight),
    oversizeThresholdCm: rule.oversizeThresholdCm == null ? null : finite(rule.oversizeThresholdCm),
    oversizeFee: finite(rule.oversizeFee),
    feeTiers: (rule.feeTiers || []).map((tier: any) => ({
      minWeightKg: tier.minWeightKg == null ? null : finite(tier.minWeightKg),
      maxWeightKg: tier.maxWeightKg == null ? null : finite(tier.maxWeightKg),
      minInclusive: Boolean(tier.minInclusive),
      maxInclusive: tier.maxInclusive !== false,
      maxLengthCm: tier.maxLengthCm == null ? null : finite(tier.maxLengthCm),
      maxWidthCm: tier.maxWidthCm == null ? null : finite(tier.maxWidthCm),
      maxHeightCm: tier.maxHeightCm == null ? null : finite(tier.maxHeightCm),
      baseFee: finite(tier.baseFee),
    })),
    packagingFeeTiers: (rule.packagingFeeTiers || []).map((tier: any) => ({
      minWeightKg: tier.minWeightKg == null ? null : finite(tier.minWeightKg),
      maxWeightKg: tier.maxWeightKg == null ? null : finite(tier.maxWeightKg),
      minInclusive: Boolean(tier.minInclusive),
      maxInclusive: tier.maxInclusive !== false,
      baseFee: finite(tier.baseFee),
    })),
  };
}

async function getCurrentRule(warehouseId: string) {
  const today = new Date();
  const rules = await prisma.warehouseFulfillmentRule.findMany({
    where: {
      warehouseId,
      enabled: true,
      effectiveFrom: { lte: today },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
    },
    include: {
      warehouse: { select: { id: true, name: true, code: true, type: true } },
      feeTiers: { orderBy: [{ maxWeightKg: "asc" }, { baseFee: "asc" }] },
      packagingFeeTiers: { orderBy: [{ maxWeightKg: "asc" }, { baseFee: "asc" }] },
    },
    orderBy: [{ shopId: "asc" }, { effectiveFrom: "desc" }],
  });
  // The tester is warehouse-level. Prefer the generic rule; if only a
  // shop-specific rule exists, use the newest one and label it in the UI.
  return rules.find((rule) => !rule.shopId) || rules[0] || null;
}

async function loadContext() {
  const [warehouses, variants] = await Promise.all([
    prisma.warehouse.findMany({
      where: { type: "OVERSEAS", isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.productVariant.findMany({
      select: {
        id: true,
        skuId: true,
        weightKg: true,
        lengthCm: true,
        widthCm: true,
        heightCm: true,
        product: { select: { name: true } },
      },
      orderBy: { skuId: "asc" },
    }),
  ]);
  return {
    warehouses,
    variants: variants.map((variant) => ({
      id: variant.id,
      skuId: variant.skuId,
      productName: variant.product.name,
      weightKg: variant.weightKg == null ? null : Number(variant.weightKg),
      lengthCm: variant.lengthCm == null ? null : Number(variant.lengthCm),
      widthCm: variant.widthCm == null ? null : Number(variant.widthCm),
      heightCm: variant.heightCm == null ? null : Number(variant.heightCm),
    })),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const context = await loadContext();
    const warehouseRules = await Promise.all(context.warehouses.map(async (warehouse) => {
      const rule = await getCurrentRule(warehouse.id);
      return [warehouse.id, rule ? {
        id: rule.id,
        pricingMode: rule.pricingMode,
        billingUnit: rule.billingUnit,
        currency: rule.currency,
        volumetricDivisor: rule.volumetricDivisor,
        useVolumetricWeight: rule.useVolumetricWeight,
        shopSpecific: Boolean(rule.shopId),
      } : null] as const;
    }));
    return NextResponse.json({ ...context, warehouseRules: Object.fromEntries(warehouseRules) });
  } catch (error: any) {
    console.error("[Logistics fee test GET]", error);
    return NextResponse.json({ error: error?.message || "物流费用测试数据读取失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const warehouseId = String(body?.warehouseId || "").trim();
    const rawItems = Array.isArray(body?.items) ? body.items : [];
    if (!warehouseId || rawItems.length === 0) {
      return NextResponse.json({ error: "请选择仓库并至少添加一个 SKU" }, { status: 400 });
    }
    const requested = rawItems.map((item: any) => ({
      variantId: String(item?.variantId || "").trim(),
      quantity: Math.max(1, Math.floor(finite(item?.quantity, 1))),
    })).filter((item: { variantId: string; quantity: number }) => item.variantId);
    if (requested.length === 0) return NextResponse.json({ error: "SKU 或数量无效" }, { status: 400 });

    const [warehouse, ruleRaw, variants] = await Promise.all([
      prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, code: true, name: true, type: true } }),
      getCurrentRule(warehouseId),
      prisma.productVariant.findMany({
        where: { id: { in: requested.map((item: { variantId: string }) => item.variantId) } },
        select: { id: true, skuId: true, weightKg: true, lengthCm: true, widthCm: true, heightCm: true, product: { select: { name: true } } },
      }),
    ]);
    if (!warehouse || warehouse.type !== "OVERSEAS") return NextResponse.json({ error: "海外仓不存在" }, { status: 400 });
    if (!ruleRaw) return NextResponse.json({ error: "该仓库没有当前生效的费用规则" }, { status: 400 });
    const rule = asRule(ruleRaw);
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const missing = requested.filter((item: { variantId: string }) => !variantById.has(item.variantId));
    if (missing.length > 0) return NextResponse.json({ error: "部分 SKU 不存在，请重新选择" }, { status: 400 });

    const rows = requested.map((item: { variantId: string; quantity: number }) => {
      const variant = variantById.get(item.variantId)!;
      const weight = finite(variant.weightKg);
      const length = finite(variant.lengthCm);
      const width = finite(variant.widthCm);
      const height = finite(variant.heightCm);
      return {
        variantId: variant.id,
        skuId: variant.skuId,
        productName: variant.product.name,
        quantity: item.quantity,
        weightKg: weight,
        lengthCm: length,
        widthCm: width,
        heightCm: height,
        volumeCm3: length * width * height * item.quantity,
        volumeWeightKg: (length * width * height * item.quantity) / rule.volumetricDivisor,
      };
    });
    const totalUnits = rows.reduce((sum: number, row: { quantity: number }) => sum + row.quantity, 0);
    const totalWeightKg = rows.reduce((sum: number, row: { weightKg: number; quantity: number }) => sum + row.weightKg * row.quantity, 0);
    const totalVolumeCm3 = rows.reduce((sum: number, row: { volumeCm3: number }) => sum + row.volumeCm3, 0);
    const totalVolumeWeightKg = totalVolumeCm3 / rule.volumetricDivisor;
    const chargeableWeightKg = rule.useVolumetricWeight ? Math.max(totalWeightKg, totalVolumeWeightKg) : totalWeightKg;
    const packageDimensions = [
      ...rows.map((row: { lengthCm: number }) => row.lengthCm),
      ...rows.map((row: { widthCm: number }) => row.widthCm),
      ...rows.map((row: { heightCm: number }) => row.heightCm),
    ].sort((left, right) => right - left).slice(0, 3);
    while (packageDimensions.length < 3) packageDimensions.push(0);
    const distinctSkuCount = new Set(rows.map((row: { skuId: string }) => row.skuId)).size;
    const fee = calculateWarehouseFulfillmentFee({
      pricingMode: rule.pricingMode === "WEIGHT_TIER" || rule.pricingMode === "PACKAGE_TIER" ? rule.pricingMode : "FLAT_UNIT",
      billedUnits: rule.billingUnit === "INTERNAL_COMPONENT" ? totalUnits : totalUnits,
      chargeableWeightKg,
      packageLengthCm: packageDimensions[0],
      packageWidthCm: packageDimensions[1],
      packageHeightCm: packageDimensions[2],
      baseOrderFee: rule.baseOrderFee,
      firstUnitFee: rule.firstUnitFee,
      additionalUnitFee: rule.additionalUnitFee,
      multiSkuFee: rule.multiSkuFee,
      distinctSkuCount,
      overweightThresholdKg: rule.overweightThresholdKg,
      overweightFeePerKg: rule.overweightFeePerKg,
      feeTiers: rule.feeTiers,
      packagingFeeTiers: rule.packagingFeeTiers,
      oversizeThresholdCm: rule.oversizeThresholdCm,
      oversizeFee: rule.oversizeFee,
    });
    return NextResponse.json({
      warehouse: { id: warehouse.id, name: warehouse.name, code: warehouse.code },
      rule: { id: rule.id, pricingMode: rule.pricingMode, billingUnit: rule.billingUnit, currency: rule.currency, volumetricDivisor: rule.volumetricDivisor, useVolumetricWeight: rule.useVolumetricWeight, shopSpecific: Boolean(ruleRaw.shopId) },
      items: rows,
      totals: { totalUnits, distinctSkuCount, totalWeightKg, totalVolumeCm3, totalVolumeWeightKg, chargeableWeightKg, packageDimensions },
      fee: { total: fee.fee, operational: fee.operationalFee || 0, packaging: fee.packagingFee || 0, oversize: fee.oversizeFee || 0, tier: fee.tier ? { minWeightKg: fee.tier.minWeightKg, maxWeightKg: fee.tier.maxWeightKg, baseFee: fee.tier.baseFee } : null, covered: fee.covered },
      note: "模拟计算结果，不会写入订单、库存、账单或财务流水。包裹三边按所选 SKU 最大单品尺寸估算；如仓库按实际外箱尺寸计费，请以仓库账单复核。",
    });
  } catch (error: any) {
    console.error("[Logistics fee test POST]", error);
    return NextResponse.json({ error: error?.message || "物流费用测试失败" }, { status: 500 });
  }
}
