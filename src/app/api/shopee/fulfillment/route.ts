import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { parseShopeePackages } from "@/lib/shopee-fulfillment";
import { businessDateUtcRange } from "@/lib/order-business-time";
import { normalizeCountryCode } from "@/lib/profit-schemes";

export const dynamic = "force-dynamic";

const STAGE_STATUSES: Record<string, string[]> = {
  pending: ["READY_TO_SHIP", "PROCESSED"],
  shipping: ["SHIPPED", "TO_CONFIRM_RECEIVE"],
  completed: ["COMPLETED"],
  cancelled: ["CANCELLED", "IN_CANCEL"],
};

function positiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const page = positiveInt(params.get("page"), 1, 100_000);
  const pageSize = positiveInt(params.get("pageSize"), 20, 100);
  const shopId = params.get("shopId")?.trim() || undefined;
  const stage = params.get("stage")?.trim() || undefined;
  const keyword = params.get("keyword")?.trim() || undefined;
  const startDate = params.get("startDate");
  const endDate = params.get("endDate");
  const shops = await prisma.shopeeShopSetting.findMany({ where: { status: "active" }, select: { shopId: true, shopName: true, region: true }, orderBy: { createdAt: "asc" } });
  const dateConditions: Prisma.ShopeeOrderWhereInput[] = startDate || endDate
    ? shops.filter((shop) => !shopId || shop.shopId === shopId).map((shop) => ({ shopId: shop.shopId, createTime: businessDateUtcRange(startDate, endDate, normalizeCountryCode(shop.region)) }))
    : [];
  const stageStatuses = stage ? STAGE_STATUSES[stage] : undefined;

  const baseWhere: Prisma.ShopeeOrderWhereInput = {
    ...(shopId ? { shopId } : {}),
    ...(startDate || endDate ? { AND: [{ OR: dateConditions.length ? dateConditions : [{ shopId: "__NO_MATCHING_SHOP__" }] }] } : {}),
    ...(keyword ? {
      OR: [
        { orderSn: { contains: keyword, mode: "insensitive" } },
        { trackingNumber: { contains: keyword, mode: "insensitive" } },
        { shippingCarrier: { contains: keyword, mode: "insensitive" } },
      ],
    } : {}),
  };
  const where: Prisma.ShopeeOrderWhereInput = {
    ...baseWhere,
    ...(stageStatuses ? { status: { in: stageStatuses } } : {}),
  };

  const [orders, total, statusGroups] = await prisma.$transaction([
    prisma.shopeeOrder.findMany({
      where,
      select: {
        id: true,
        shopSettingId: true,
        shopId: true,
        orderSn: true,
        status: true,
        shippingCarrier: true,
        trackingNumber: true,
        createTime: true,
        updateTime: true,
        shipByDate: true,
        syncedAt: true,
        rawData: true,
        items: { select: { quantity: true } },
        shopSetting: { select: { shopName: true, region: true } },
      },
      orderBy: [{ updateTime: "desc" }, { orderSn: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.shopeeOrder.count({ where }),
    prisma.shopeeOrder.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
      orderBy: { status: "asc" },
    }),
  ]);

  const stageCounts = { pending: 0, shipping: 0, completed: 0, cancelled: 0 };
  for (const group of statusGroups) {
    const count = typeof group._count === "object" ? group._count?._all || 0 : 0;
    for (const [key, statuses] of Object.entries(STAGE_STATUSES)) {
      if (group.status && statuses.includes(group.status)) {
        stageCounts[key as keyof typeof stageCounts] += count;
      }
    }
  }

  return NextResponse.json({
    data: orders.map(({ rawData, items, ...order }) => {
      const packages = parseShopeePackages(rawData);
      return {
        ...order,
        itemQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
        packages: packages.length > 0 ? packages : [{
          packageNumber: null,
          trackingNumber: order.trackingNumber,
          shippingCarrier: order.shippingCarrier,
          logisticsStatus: null,
        }],
      };
    }),
    total,
    page,
    pageSize,
    stageCounts,
    shops,
  });
}
