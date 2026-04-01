export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { ContainerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncProductVariantInventory } from "@/lib/inventory-sync";

const LOCATION_LABELS: Record<string, string> = {
  FACTORY: "工厂",
  DOMESTIC: "国内仓",
  TRANSIT: "海运在途",
  OVERSEAS: "海外仓",
  UNKNOWN: "未匹配仓库",
};

/**
 * GET 库存对账聚合（服务端汇总，不截断条数）
 * - 主口径：Stock 表按仓库 location 汇总（工厂/国内/在途/海外）
 * - 参考口径：ProductVariant 上 atFactory/atDomestic/inTransit 合计（与仓库存可能不完全一致）
 * - 业务口径（用于展示）：
 *   - 工厂库存 = 合同总数 - 拿货数量（按合同明细求剩余）
 *   - 国内库存 = 拿货单已入库 - 已出库（按入库明细 receivedQty 与出库批次明细 qty 求差）
 *   - 海运在途 = 已绑柜子的出库批次明细 qty 合计（柜状态：装柜中/已装柜待开船、在途）
 */
export async function GET(request: NextRequest) {
  try {
    const noCache = new URL(request.url).searchParams.get("noCache") === "true";

    const [
      groupByWarehouse,
      warehouses,
      variantAgg,
      contractItems,
      inboundReceivedAgg,
      outboundBatchAgg,
      seaTransitFromContainerAgg,
    ] = await Promise.all([
      prisma.stock.groupBy({
        by: ["warehouseId"],
        _sum: { qty: true, reservedQty: true },
        _count: { _all: true },
      }),
      prisma.warehouse.findMany({
        select: {
          id: true,
          code: true,
          name: true,
          location: true,
          type: true,
          isActive: true,
        },
      }),
      prisma.productVariant.aggregate({
        _sum: {
          atFactory: true,
          atDomestic: true,
          inTransit: true,
          stockQuantity: true,
        },
      }),
      prisma.purchaseContractItem.findMany({
        select: {
          qty: true,
          pickedQty: true,
        },
      }),
      prisma.pendingInboundItem.aggregate({
        _sum: { receivedQty: true },
      }),
      prisma.outboundBatchItem.aggregate({
        where: {
          outboundBatch: {
            status: { not: "已取消" },
          },
        },
        _sum: { qty: true },
      }),
      prisma.outboundBatchItem.aggregate({
        where: {
          outboundBatch: {
            containerId: { not: null },
            status: { not: "已取消" },
            container: {
              status: {
                in: [ContainerStatus.LOADING, ContainerStatus.IN_TRANSIT],
              },
            },
          },
        },
        _sum: { qty: true },
      }),
    ]);

    const whMap = new Map(warehouses.map((w) => [w.id, w]));

    type LocBucket = {
      qty: number;
      reservedQty: number;
      skuLines: number;
      warehouseIds: string[];
    };
    const emptyBucket = (): LocBucket => ({
      qty: 0,
      reservedQty: 0,
      skuLines: 0,
      warehouseIds: [],
    });

    const byLocation: Record<string, LocBucket> = {
      FACTORY: emptyBucket(),
      DOMESTIC: emptyBucket(),
      TRANSIT: emptyBucket(),
      OVERSEAS: emptyBucket(),
      UNKNOWN: emptyBucket(),
    };

    const byWarehouse: Array<{
      warehouseId: string;
      warehouseCode: string;
      warehouseName: string;
      location: string;
      locationLabel: string;
      qty: number;
      reservedQty: number;
      skuLineCount: number;
      isActive: boolean;
    }> = [];

    let grandTotalQty = 0;
    let grandReservedQty = 0;

    for (const row of groupByWarehouse) {
      const w = whMap.get(row.warehouseId);
      const qty = Number(row._sum.qty ?? 0);
      const reserved = Number(row._sum.reservedQty ?? 0);
      const lines = row._count._all ?? 0;
      grandTotalQty += qty;
      grandReservedQty += reserved;

      const rawLoc = w?.location != null ? String(w.location) : "UNKNOWN";
      const loc =
        rawLoc in byLocation && rawLoc !== "UNKNOWN" ? rawLoc : "UNKNOWN";

      const bucket = byLocation[loc] ?? byLocation.UNKNOWN;
      bucket.qty += qty;
      bucket.reservedQty += reserved;
      bucket.skuLines += lines;
      if (!bucket.warehouseIds.includes(row.warehouseId)) {
        bucket.warehouseIds.push(row.warehouseId);
      }

      byWarehouse.push({
        warehouseId: row.warehouseId,
        warehouseCode: w?.code ?? "-",
        warehouseName: w?.name ?? "(仓库不存在或已删)",
        location: loc,
        locationLabel: LOCATION_LABELS[loc] ?? loc,
        qty,
        reservedQty: reserved,
        skuLineCount: lines,
        isActive: w?.isActive ?? false,
      });
    }

    byWarehouse.sort((a, b) => b.qty - a.qty);

    const variantProfile = {
      sumAtFactory: Number(variantAgg._sum.atFactory ?? 0),
      sumAtDomestic: Number(variantAgg._sum.atDomestic ?? 0),
      sumInTransit: Number(variantAgg._sum.inTransit ?? 0),
      sumStockQuantityField: Number(variantAgg._sum.stockQuantity ?? 0),
      sumProfileThree:
        Number(variantAgg._sum.atFactory ?? 0) +
        Number(variantAgg._sum.atDomestic ?? 0) +
        Number(variantAgg._sum.inTransit ?? 0),
    };

    const factoryFromContracts = contractItems.reduce((sum, item) => {
      const remain = Number(item.qty ?? 0) - Number(item.pickedQty ?? 0);
      return sum + (remain > 0 ? remain : 0);
    }, 0);
    const inboundReceivedTotal = Number(inboundReceivedAgg._sum.receivedQty ?? 0);
    const outboundTotal = Number(outboundBatchAgg._sum.qty ?? 0);
    const domesticFromInboundMinusOutbound = Math.max(
      0,
      inboundReceivedTotal - outboundTotal
    );
    const seaTransitFromContainer = Number(
      seaTransitFromContainerAgg._sum.qty ?? 0
    );

    // 业务口径：工厂（合同剩余） + 国内（入库减出库） + 海运在途（绑柜且在途/装柜） + 海外仓（来自 Stock）
    const businessByLocation = {
      FACTORY: factoryFromContracts,
      DOMESTIC: domesticFromInboundMinusOutbound,
      TRANSIT: seaTransitFromContainer,
      OVERSEAS: Number(byLocation.OVERSEAS?.qty ?? 0),
    };
    const businessTotalQty =
      businessByLocation.FACTORY +
      businessByLocation.DOMESTIC +
      businessByLocation.TRANSIT +
      businessByLocation.OVERSEAS;

    const payload = {
      generatedAt: new Date().toISOString(),
      grandTotalQty,
      grandReservedQty,
      grandAvailableApprox: Math.max(0, grandTotalQty - grandReservedQty),
      byLocation: Object.fromEntries(
        Object.entries(byLocation).map(([k, v]) => [
          k,
          {
            ...v,
            label: LOCATION_LABELS[k] ?? k,
            warehouseCount: v.warehouseIds.length,
          },
        ])
      ),
      byWarehouse,
      locationLabels: LOCATION_LABELS,
      variantProfile,
      /** 海运在途：与业务口径 TRANSIT 一致，便于对照 */
      seaTransitFromContainer,
      seaTransitContainerStatuses: [ContainerStatus.LOADING, ContainerStatus.IN_TRANSIT],
      businessByLocation,
      businessTotalQty,
    };

    return NextResponse.json(payload, {
      headers: noCache
        ? {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          }
        : undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "对账汇总失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST 全量重算 ProductVariant 库存分布字段
 * 用于一次性修正历史数据：atFactory / atDomestic / inTransit / stockQuantity
 */
export async function POST() {
  try {
    const stockMap = await syncProductVariantInventory();
    const affectedVariantCount = Object.keys(stockMap).length;
    return NextResponse.json({
      success: true,
      affectedVariantCount,
      message: `已重算 ${affectedVariantCount} 个 SKU 的产品档案库存`,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "全量重算失败" },
      { status: 500 }
    );
  }
}
