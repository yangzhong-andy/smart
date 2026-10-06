const { PrismaClient } = require('/srv/smart-erp/baxi/current/node_modules/@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.warehouseFundEntry.findMany({
    where: { entryType: 'FULFILLMENT_DEBIT' },
    orderBy: { occurredAt: 'desc' },
    take: 40,
    include: { warehouse: { select: { id: true, code: true, name: true } } },
  });
  const rules = await prisma.warehouseFulfillmentRule.findMany({
    where: { enabled: true },
    orderBy: { effectiveFrom: 'desc' },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      feeTiers: { orderBy: [{ maxWeightKg: 'asc' }, { baseFee: 'asc' }] },
      packagingFeeTiers: { orderBy: [{ maxWeightKg: 'asc' }, { baseFee: 'asc' }] },
    },
  });
  const output = {
    rules: rules.map((r) => ({
      id: r.id,
      warehouse: r.warehouse,
      pricingMode: r.pricingMode,
      currency: r.currency,
      billingUnit: r.billingUnit,
      baseOrderFee: r.baseOrderFee.toString(),
      firstUnitFee: r.firstUnitFee.toString(),
      additionalUnitFee: r.additionalUnitFee.toString(),
      multiSkuFee: r.multiSkuFee.toString(),
      useVolumetricWeight: r.useVolumetricWeight,
      feeTiers: r.feeTiers.map((x) => ({ ...x, baseFee: x.baseFee.toString(), minWeightKg: x.minWeightKg?.toString() ?? null, maxWeightKg: x.maxWeightKg?.toString() ?? null })),
      packagingFeeTiers: r.packagingFeeTiers.map((x) => ({ ...x, baseFee: x.baseFee.toString(), minWeightKg: x.minWeightKg?.toString() ?? null, maxWeightKg: x.maxWeightKg?.toString() ?? null })),
    })),
    entries: entries.map((x) => ({
      id: x.id,
      orderId: x.orderId,
      warehouse: x.warehouse,
      amount: x.amount.toString(),
      currency: x.currency,
      sourceType: x.sourceType,
      sourceId: x.sourceId,
      details: x.details,
      occurredAt: x.occurredAt.toISOString(),
      createdAt: x.createdAt.toISOString(),
    })),
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
