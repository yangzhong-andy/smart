export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
 */
export async function GET(request: NextRequest) {
  try {
    const noCache = new URL(request.url).searchParams.get("noCache") === "true";

    const [groupByWarehouse, warehouses, variantAgg] = await Promise.all([
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

    // 业务口径：工厂 + 国内 + 海运在途（来自 ProductVariant） + 海外仓（来自 Stock）
    const businessByLocation = {
      FACTORY: variantProfile.sumAtFactory,
      DOMESTIC: variantProfile.sumAtDomestic,
      TRANSIT: variantProfile.sumInTransit,
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
