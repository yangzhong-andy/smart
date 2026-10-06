import { ContainerStatus, PurchaseContractStatus, WarehouseType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { aggregateInventoryAssetLots, type InventoryAssetLot } from "@/lib/inventory-asset-core";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ACTIVE_TRANSIT_STATUSES = [
  ContainerStatus.LOADING,
  ContainerStatus.IN_TRANSIT,
  ContainerStatus.ARRIVED_PORT,
  ContainerStatus.CUSTOMS_CLEAR,
];

function positive(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

export async function GET(request: NextRequest) {
  try {
    const search = new URL(request.url).searchParams.get("search")?.trim().toLowerCase() || "";

    const [
      variants,
      contractItems,
      inboundParents,
      inboundHeaders,
      outboundItems,
      transitItems,
      overseasStocks,
      unlinkedContractItems,
      unlinkedInboundLines,
      unlinkedInboundHeaders,
      unlinkedTransit,
    ] = await Promise.all([
      prisma.productVariant.findMany({
        select: {
          id: true,
          skuId: true,
          costPrice: true,
          currency: true,
          inTransit: true,
          product: { select: { name: true, mainImage: true } },
        },
      }),
      prisma.purchaseContractItem.findMany({
        where: {
          variantId: { not: null },
          contract: { status: { not: PurchaseContractStatus.CANCELLED } },
        },
        select: {
          id: true,
          variantId: true,
          qty: true,
          pickedQty: true,
          unitPrice: true,
          contract: { select: { contractNumber: true, status: true } },
        },
      }),
      prisma.pendingInbound.findMany({
        where: {
          status: { not: "已取消" },
          items: { some: { variantId: { not: null } } },
        },
        select: {
          inboundNumber: true,
          items: {
            where: { variantId: { not: null } },
            select: { variantId: true, receivedQty: true, unitPrice: true },
          },
        },
      }),
      prisma.pendingInbound.findMany({
        where: {
          status: { not: "已取消" },
          variantId: { not: null },
          items: { none: {} },
        },
        select: { id: true, inboundNumber: true, variantId: true, receivedQty: true },
      }),
      prisma.outboundBatchItem.findMany({
        where: {
          variantId: { not: null },
          outboundBatch: { status: { not: "已取消" } },
        },
        select: { variantId: true, qty: true },
      }),
      prisma.outboundBatchItem.findMany({
        where: {
          variantId: { not: null },
          outboundBatch: {
            status: { not: "已取消" },
            arrivalConfirmedAt: null,
            containerId: { not: null },
            container: { status: { in: ACTIVE_TRANSIT_STATUSES } },
          },
        },
        select: {
          id: true,
          variantId: true,
          qty: true,
          outboundOrderItem: { select: { unitPrice: true } },
          outboundBatch: {
            select: {
              batchNumber: true,
              status: true,
              actualDepartureDate: true,
              container: {
                select: {
                  containerNo: true,
                  status: true,
                  actualDeparture: true,
                  eta: true,
                },
              },
            },
          },
        },
      }),
      prisma.stock.findMany({
        where: { warehouse: { type: WarehouseType.OVERSEAS }, qty: { gt: 0 } },
        select: {
          id: true,
          variantId: true,
          qty: true,
          warehouse: { select: { name: true, code: true } },
        },
      }),
      prisma.purchaseContractItem.findMany({
        where: {
          variantId: null,
          contract: { status: { not: PurchaseContractStatus.CANCELLED } },
        },
        select: { qty: true, pickedQty: true },
      }),
      prisma.pendingInboundItem.aggregate({
        where: { variantId: null, pendingInbound: { status: { not: "已取消" } } },
        _sum: { receivedQty: true },
      }),
      prisma.pendingInbound.aggregate({
        where: { variantId: null, status: { not: "已取消" }, items: { none: {} } },
        _sum: { receivedQty: true },
      }),
      prisma.outboundBatchItem.aggregate({
        where: {
          variantId: null,
          outboundBatch: {
            status: { not: "已取消" },
            arrivalConfirmedAt: null,
            containerId: { not: null },
            container: { status: { in: ACTIVE_TRANSIT_STATUSES } },
          },
        },
        _sum: { qty: true },
      }),
    ]);

    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
    const lots: InventoryAssetLot[] = [];
    const inboundQty = new Map<string, number>();
    const inboundCost = new Map<string, { value: number; quantity: number }>();
    const outboundQty = new Map<string, number>();

    const addInbound = (variantId: string, quantity: number, unitPrice: unknown) => {
      const qty = positive(quantity);
      inboundQty.set(variantId, (inboundQty.get(variantId) || 0) + qty);
      const cost = Number(unitPrice);
      if (qty > 0 && Number.isFinite(cost) && cost > 0) {
        const current = inboundCost.get(variantId) || { value: 0, quantity: 0 };
        current.value += qty * cost;
        current.quantity += qty;
        inboundCost.set(variantId, current);
      }
    };

    for (const item of contractItems) {
      if (!item.variantId) continue;
      const variant = variantMap.get(item.variantId);
      if (!variant) continue;
      const quantity = Math.max(0, item.qty - item.pickedQty);
      lots.push({
        variantId: variant.id,
        skuId: variant.skuId,
        productName: variant.product.name,
        imageUrl: variant.product.mainImage,
        bucket: "FACTORY",
        quantity,
        unitCost: Number(item.unitPrice),
        currency: variant.currency,
        sourceId: item.id,
        sourceLabel: item.contract.contractNumber,
        sourceStatus: item.contract.status,
      });
    }

    for (const parent of inboundParents) {
      for (const item of parent.items) {
        if (item.variantId) addInbound(item.variantId, item.receivedQty, item.unitPrice);
      }
    }
    for (const header of inboundHeaders) {
      if (header.variantId) addInbound(header.variantId, header.receivedQty, null);
    }
    for (const item of outboundItems) {
      if (item.variantId) outboundQty.set(item.variantId, (outboundQty.get(item.variantId) || 0) + positive(item.qty));
    }

    for (const variant of variants) {
      const received = inboundQty.get(variant.id) || 0;
      const shipped = outboundQty.get(variant.id) || 0;
      const quantity = Math.max(0, received - shipped);
      const weighted = inboundCost.get(variant.id);
      lots.push({
        variantId: variant.id,
        skuId: variant.skuId,
        productName: variant.product.name,
        imageUrl: variant.product.mainImage,
        bucket: "DOMESTIC",
        quantity,
        unitCost: weighted?.quantity ? weighted.value / weighted.quantity : Number(variant.costPrice || 0),
        currency: variant.currency,
        sourceId: `domestic-${variant.id}`,
        sourceLabel: `累计入库 ${received.toLocaleString("en-US")} − 累计出库 ${shipped.toLocaleString("en-US")}`,
        sourceStatus: quantity > 0 ? "国内待发" : "已转出",
        issue: shipped > received ? "国内出库累计超过入库累计，请核对历史入库或 SKU 关联" : null,
      });
    }

    for (const item of transitItems) {
      if (!item.variantId) continue;
      const variant = variantMap.get(item.variantId);
      if (!variant) continue;
      const container = item.outboundBatch.container;
      const missingDeparture = container?.status === ContainerStatus.IN_TRANSIT
        && !container.actualDeparture
        && !item.outboundBatch.actualDepartureDate;
      lots.push({
        variantId: variant.id,
        skuId: variant.skuId,
        productName: variant.product.name,
        imageUrl: variant.product.mainImage,
        bucket: "SEA_TRANSIT",
        quantity: item.qty,
        unitCost: Number(item.outboundOrderItem?.unitPrice || variant.costPrice || 0),
        currency: variant.currency,
        sourceId: item.id,
        sourceLabel: `${item.outboundBatch.batchNumber} · ${container?.containerNo || "未填写柜号"}`,
        sourceStatus: container?.status || item.outboundBatch.status,
        issue: missingDeparture ? `柜号 ${container?.containerNo || "-"} 已标记运输中，但未填写实际开船时间` : null,
      });
    }

    for (const stock of overseasStocks) {
      const variant = variantMap.get(stock.variantId);
      if (!variant) continue;
      lots.push({
        variantId: variant.id,
        skuId: variant.skuId,
        productName: variant.product.name,
        imageUrl: variant.product.mainImage,
        bucket: "OVERSEAS",
        quantity: stock.qty,
        unitCost: Number(variant.costPrice || 0),
        currency: variant.currency,
        sourceId: stock.id,
        sourceLabel: `${stock.warehouse.name}（${stock.warehouse.code}）`,
        sourceStatus: "当前库存",
      });
    }

    const aggregated = aggregateInventoryAssetLots(lots);
    const liveTransitByVariant = new Map<string, number>();
    for (const item of transitItems) {
      if (item.variantId) liveTransitByVariant.set(item.variantId, (liveTransitByVariant.get(item.variantId) || 0) + item.qty);
    }
    const staleTransitRows = variants
      .map((variant) => ({
        variantId: variant.id,
        skuId: variant.skuId,
        cachedQuantity: variant.inTransit,
        liveQuantity: liveTransitByVariant.get(variant.id) || 0,
      }))
      .filter((row) => row.cachedQuantity !== row.liveQuantity);

    const rows = search
      ? aggregated.rows.filter((row) => `${row.skuId} ${row.productName}`.toLowerCase().includes(search))
      : aggregated.rows;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      policy: {
        quantitySource: "业务单据实时计算，不使用 ProductVariant 的缓存库存字段",
        factory: "有效采购合同的未提数量",
        domestic: "累计正式入库减累计有效出库",
        seaTransit: "已绑柜、未确认到仓，柜状态为装柜中/运输中/到港/清关",
        overseas: "海外仓 Stock 当前实物余额",
        valuation: "按采购/产品成本暂估；不同币种分开显示，不直接相加",
      },
      summary: aggregated.summary,
      totals: aggregated.totals,
      rows,
      diagnostics: {
        unlinkedFactoryQuantity: unlinkedContractItems.reduce((sum, item) => sum + Math.max(0, item.qty - item.pickedQty), 0),
        unlinkedDomesticInboundQuantity: Number(unlinkedInboundLines._sum.receivedQty || 0) + Number(unlinkedInboundHeaders._sum.receivedQty || 0),
        unlinkedTransitQuantity: Number(unlinkedTransit._sum.qty || 0),
        transitMissingDepartureQuantity: transitItems.reduce((sum, item) => {
          const container = item.outboundBatch.container;
          const missingDeparture = container?.status === ContainerStatus.IN_TRANSIT
            && !container.actualDeparture
            && !item.outboundBatch.actualDepartureDate;
          return sum + (missingDeparture ? item.qty : 0);
        }, 0),
        staleTransitRows,
      },
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("[GET /api/inventory/assets]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "货物资产加载失败" },
      { status: 500 },
    );
  }
}
