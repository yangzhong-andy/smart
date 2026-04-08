import { ContainerStatus, WarehouseType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * 按 SKU 计算与「库存对账」业务口径一致的分布：
 * - 工厂：合同明细 remaining = max(qty - pickedQty, 0) 按行汇总（与合同/拿货一致，不用 finishedQty）
 * - 国内：入库明细 receivedQty 合计（父单未取消）− 出库批次明细 qty（批次未取消）
 * - 海运在途：已绑柜且柜状态为装柜中/在途的出库批次明细 qty
 */
export async function computeVariantInventorySnapshot(variantId: string) {
  const [contractItems, parentsWithLines, headerOnlyInbounds, outboundAgg, transitAgg] =
    await Promise.all([
      prisma.purchaseContractItem.findMany({
        where: { variantId },
        select: { qty: true, pickedQty: true },
      }),
      prisma.pendingInbound.findMany({
        where: {
          status: { not: "已取消" },
          items: { some: { variantId } },
        },
        include: {
          items: { where: { variantId }, select: { receivedQty: true } },
        },
      }),
      prisma.pendingInbound.findMany({
        where: {
          variantId,
          status: { not: "已取消" },
          items: { none: {} },
        },
        select: { receivedQty: true },
      }),
      prisma.outboundBatchItem.aggregate({
        where: {
          variantId,
          outboundBatch: { status: { not: "已取消" } },
        },
        _sum: { qty: true },
      }),
      prisma.outboundBatchItem.aggregate({
        where: {
          variantId,
          outboundBatch: {
            containerId: { not: null },
            status: { not: "已取消" },
            // 已确认到达海外仓的批次不再算「在途」（与 confirm-arrival 一致）
            arrivalConfirmedAt: null,
            container: {
              status: { in: [ContainerStatus.LOADING, ContainerStatus.IN_TRANSIT] },
            },
          },
        },
        _sum: { qty: true },
      }),
    ]);

  const atFactory = contractItems.reduce(
    (s, i) => s + Math.max(0, Number(i.qty ?? 0) - Number(i.pickedQty ?? 0)),
    0
  );
  let inboundReceived = 0;
  for (const p of parentsWithLines) {
    inboundReceived += p.items.reduce(
      (s, i) => s + Number(i.receivedQty ?? 0),
      0
    );
  }
  inboundReceived += headerOnlyInbounds.reduce(
    (s, p) => s + Number(p.receivedQty ?? 0),
    0
  );
  const outboundTotal = Number(outboundAgg._sum.qty ?? 0);
  const atDomestic = Math.max(0, inboundReceived - outboundTotal);
  const inTransit = Number(transitAgg._sum.qty ?? 0);
  const stockQuantity = atFactory + atDomestic + inTransit;

  return { atFactory, atDomestic, inTransit, stockQuantity };
}

/**
 * 与「单 SKU 快照」可加总一致的全局业务口径（仅统计已关联 ProductVariant 的明细行），
 * 用于库存对账页「业务四段」与产品档案重算后合计对齐。
 */
export async function aggregateBusinessPipelineLinkedToVariants() {
  const [
    contractItemsLinked,
    contractItemsUnlinked,
    inboundLinesAgg,
    inboundHeadersAgg,
    outboundAgg,
    seaTransitAgg,
  ] = await Promise.all([
    prisma.purchaseContractItem.findMany({
      where: { variantId: { not: null } },
      select: { qty: true, pickedQty: true },
    }),
    prisma.purchaseContractItem.findMany({
      where: { variantId: null },
      select: { qty: true, pickedQty: true },
    }),
    prisma.pendingInboundItem.aggregate({
      where: {
        variantId: { not: null },
        pendingInbound: { status: { not: "已取消" } },
      },
      _sum: { receivedQty: true },
    }),
    prisma.pendingInbound.aggregate({
      where: {
        status: { not: "已取消" },
        variantId: { not: null },
        items: { none: {} },
      },
      _sum: { receivedQty: true },
    }),
    prisma.outboundBatchItem.aggregate({
      where: {
        variantId: { not: null },
        outboundBatch: { status: { not: "已取消" } },
      },
      _sum: { qty: true },
    }),
    prisma.outboundBatchItem.aggregate({
      where: {
        variantId: { not: null },
        outboundBatch: {
          containerId: { not: null },
          status: { not: "已取消" },
          arrivalConfirmedAt: null,
          container: {
            status: { in: [ContainerStatus.LOADING, ContainerStatus.IN_TRANSIT] },
          },
        },
      },
      _sum: { qty: true },
    }),
  ]);

  const factoryLinked = contractItemsLinked.reduce((sum, item) => {
    const remain = Number(item.qty ?? 0) - Number(item.pickedQty ?? 0);
    return sum + (remain > 0 ? remain : 0);
  }, 0);
  const factoryRemainUnlinked = contractItemsUnlinked.reduce((sum, item) => {
    const remain = Number(item.qty ?? 0) - Number(item.pickedQty ?? 0);
    return sum + (remain > 0 ? remain : 0);
  }, 0);

  const inboundReceived =
    Number(inboundLinesAgg._sum.receivedQty ?? 0) +
    Number(inboundHeadersAgg._sum.receivedQty ?? 0);
  const outboundTotal = Number(outboundAgg._sum.qty ?? 0);
  const domesticNet = Math.max(0, inboundReceived - outboundTotal);
  const seaTransitFromContainer = Number(seaTransitAgg._sum.qty ?? 0);

  return {
    factoryLinked,
    factoryRemainUnlinked,
    inboundReceived,
    outboundTotal,
    domesticNet,
    seaTransitFromContainer,
  };
}

async function collectVariantIdsForFullSync(): Promise<string[]> {
  const [fromContracts, fromInboundLines, fromInboundHeaders, fromOutbound] =
    await Promise.all([
      prisma.purchaseContractItem.findMany({
        where: { variantId: { not: null } },
        select: { variantId: true },
        distinct: ["variantId"],
      }),
      prisma.pendingInboundItem.findMany({
        where: { variantId: { not: null } },
        select: { variantId: true },
        distinct: ["variantId"],
      }),
      prisma.pendingInbound.findMany({
        where: { variantId: { not: null } },
        select: { variantId: true },
        distinct: ["variantId"],
      }),
      prisma.outboundBatchItem.findMany({
        where: { variantId: { not: null } },
        select: { variantId: true },
        distinct: ["variantId"],
      }),
    ]);
  const set = new Set<string>();
  for (const r of fromContracts) {
    if (r.variantId) set.add(r.variantId);
  }
  for (const r of fromInboundLines) {
    if (r.variantId) set.add(r.variantId);
  }
  for (const r of fromInboundHeaders) {
    if (r.variantId) set.add(r.variantId);
  }
  for (const r of fromOutbound) {
    if (r.variantId) set.add(r.variantId);
  }
  return Array.from(set);
}

/**
 * 将 ProductVariant 的 atFactory / atDomestic / inTransit / stockQuantity
 * 与合同、入库明细、出库批次对齐。
 */
export async function syncProductVariantInventory(variantId?: string) {
  const ids = variantId
    ? [variantId]
    : await collectVariantIdsForFullSync();

  const updates = await Promise.all(
    ids.map(async (vid) => {
      const snap = await computeVariantInventorySnapshot(vid);
      const overseasAgg = await prisma.stock.aggregate({
        where: {
          variantId: vid,
          warehouse: { type: WarehouseType.OVERSEAS },
        },
        _sum: { qty: true },
      });
      const overseas = Number(overseasAgg._sum.qty ?? 0);
      const stockQuantity =
        snap.atFactory + snap.atDomestic + snap.inTransit + overseas;
      return prisma.productVariant.update({
        where: { id: vid },
        data: {
          atFactory: snap.atFactory,
          atDomestic: snap.atDomestic,
          inTransit: snap.inTransit,
          stockQuantity,
        },
      });
    })
  );

  const stockMap: Record<
    string,
    { atFactory: number; atDomestic: number; inTransit: number }
  > = {};
  for (let i = 0; i < ids.length; i++) {
    const vid = ids[i];
    const u = updates[i];
    stockMap[vid] = {
      atFactory: u.atFactory,
      atDomestic: u.atDomestic,
      inTransit: u.inTransit,
    };
  }

  return stockMap;
}
