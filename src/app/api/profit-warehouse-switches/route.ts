import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { extractTikTokWarehouseId } from "@/lib/profit-warehouse-mapping";

export const dynamic = "force-dynamic";

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

function timeZoneForRegion(region: string | null | undefined): string {
  if (region === "US") return "America/Denver";
  if (region === "BR") return "America/Sao_Paulo";
  return "UTC";
}

function startOfDateInTimeZone(value: string, timeZone: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  const localMidnightAsUtc = new Date(Date.UTC(year, month - 1, day));
  const offsetAt = (instant: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    ) - instant.getTime();
  };
  let instant = new Date(localMidnightAsUtc.getTime() - offsetAt(localMidnightAsUtc));
  instant = new Date(localMidnightAsUtc.getTime() - offsetAt(instant));
  return instant;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const [rules, mappings, warehouses, latestOrders] = await Promise.all([
      prisma.profitWarehouseSwitchRule.findMany({
        include: { warehouse: { select: { name: true, code: true } } },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      }),
      prisma.tikTokWarehouseMapping.findMany({
        select: { tiktokWarehouseId: true, tiktokShopId: true, warehouseId: true },
      }),
      prisma.warehouse.findMany({
        where: { type: "OVERSEAS" },
        select: { id: true, name: true, code: true },
      }),
      prisma.tikTokOrder.findMany({
        where: { createTime: { not: null } },
        select: { shopId: true, createTime: true, rawData: true },
        orderBy: { createTime: "desc" },
        take: 1000,
      }),
    ]);
    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    const latestByShopWarehouse = new Map<string, { shopId: string; externalWarehouseId: string; latestOrderTime: string }>();
    for (const order of latestOrders) {
      const externalWarehouseId = extractTikTokWarehouseId(order.rawData);
      if (!externalWarehouseId || !order.createTime) continue;
      const key = `${order.shopId}\u0000${externalWarehouseId}`;
      if (!latestByShopWarehouse.has(key)) {
        latestByShopWarehouse.set(key, {
          shopId: order.shopId,
          externalWarehouseId,
          latestOrderTime: order.createTime.toISOString(),
        });
      }
    }

    return NextResponse.json({
      rules: rules.map((rule) => ({
        ...rule,
        effectiveFrom: rule.effectiveFrom.toISOString(),
      })),
      mappings: mappings.map((mapping) => ({
        ...mapping,
        warehouseName: warehouseById.get(mapping.warehouseId)?.name || mapping.warehouseId,
      })),
      latestWarehouseIds: [...latestByShopWarehouse.values()],
    });
  } catch (error: any) {
    console.error("[Profit Warehouse Switches]", error);
    return NextResponse.json({ error: error?.message || "仓库切换记录读取失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const platform = String(body?.platform || "TIKTOK").trim().toUpperCase();
    const shopId = String(body?.shopId || "").trim();
    const warehouseId = String(body?.warehouseId || "").trim();
    const effectiveOrderId = String(body?.effectiveOrderId || "").trim();
    const effectiveDate = String(body?.effectiveDate || "").trim();
    const externalWarehouseId = "*";
    if (!shopId || !warehouseId || (!effectiveOrderId && !effectiveDate)) {
      return NextResponse.json({ error: "请选择店铺、目标仓库，并填写首笔订单号或生效日期" }, { status: 400 });
    }

    const [shop, warehouse, boundaryOrder] = await Promise.all([
      prisma.tikTokShopSetting.findUnique({ where: { shopId }, select: { shopId: true, region: true } }),
      prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, type: true } }),
      effectiveOrderId
        ? prisma.tikTokOrder.findUnique({
            where: { orderId: effectiveOrderId },
            select: { orderId: true, shopId: true, createTime: true, rawData: true },
          })
        : Promise.resolve(null),
    ]);
    if (!shop) return NextResponse.json({ error: "店铺不存在" }, { status: 400 });
    if (!warehouse || warehouse.type !== "OVERSEAS") return NextResponse.json({ error: "目标海外仓不存在" }, { status: 400 });

    let effectiveFrom: Date;
    if (effectiveOrderId) {
      if (!boundaryOrder || !boundaryOrder.createTime) return NextResponse.json({ error: "首笔新仓订单不存在或缺少下单时间" }, { status: 400 });
      if (boundaryOrder.shopId !== shopId) return NextResponse.json({ error: "首笔新仓订单不属于所选店铺" }, { status: 400 });
      effectiveFrom = boundaryOrder.createTime;
    } else {
      if (!VALID_DATE.test(effectiveDate)) return NextResponse.json({ error: "生效日期格式无效" }, { status: 400 });
      effectiveFrom = startOfDateInTimeZone(effectiveDate, timeZoneForRegion(shop.region));
    }

    const data = {
      region: shop.region,
      warehouseId,
      effectiveOrderId: effectiveOrderId || null,
      notes: String(body?.notes || "").trim() || null,
    };
    const rule = await prisma.profitWarehouseSwitchRule.upsert({
      where: {
        platform_shopId_externalWarehouseId_effectiveFrom: {
          platform,
          shopId,
          externalWarehouseId,
          effectiveFrom,
        },
      },
      create: {
        platform,
        shopId,
        externalWarehouseId,
        effectiveFrom,
        ...data,
      },
      update: data,
    });
    return NextResponse.json({ success: true, id: rule.id, externalWarehouseId, effectiveFrom: effectiveFrom.toISOString() });
  } catch (error: any) {
    console.error("[Profit Warehouse Switches]", error);
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003"
      ? "该仓库仍被其他记录使用"
      : error?.message || "仓库切换记录保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    const id = request.nextUrl.searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "缺少切换记录 ID" }, { status: 400 });
    await prisma.profitWarehouseSwitchRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Profit Warehouse Switches]", error);
    return NextResponse.json({ error: error?.message || "仓库切换记录删除失败" }, { status: 500 });
  }
}
