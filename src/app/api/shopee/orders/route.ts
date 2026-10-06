import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { businessDateUtcRange } from "@/lib/order-business-time";
import { normalizeCountryCode } from "@/lib/profit-schemes";
import { SHOPEE_SETTLEMENT_PUBLIC_SELECT } from "@/lib/shopee-settlements";

export const dynamic = "force-dynamic";

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
  const status = params.get("status")?.trim() || undefined;
  const keyword = params.get("keyword")?.trim() || undefined;
  const sku = params.get("sku")?.trim() || undefined;
  const startDate = params.get("startDate");
  const endDate = params.get("endDate");
  const shops = await prisma.shopeeShopSetting.findMany({
    where: { status: "active" },
    select: {
      shopId: true,
      shopName: true,
      region: true,
      lastSyncAt: true,
      orderSyncCheckpoint: { select: { status: true, lastError: true, lastSuccessfulSyncAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const dateShops = shops.filter((shop) => !shopId || shop.shopId === shopId);
  const dateConditions: Prisma.ShopeeOrderWhereInput[] = startDate || endDate
    ? dateShops.map((shop) => ({
        shopId: shop.shopId,
        createTime: businessDateUtcRange(startDate, endDate, normalizeCountryCode(shop.region)),
      }))
    : [];

  const where: Prisma.ShopeeOrderWhereInput = {
    ...(shopId ? { shopId } : {}),
    ...(status ? { status } : {}),
    ...(startDate || endDate ? {
      AND: [{ OR: dateConditions.length > 0 ? dateConditions : [{ shopId: "__NO_MATCHING_SHOP__" }] }],
    } : {}),
    ...(sku ? { items: { some: { OR: [{ itemSku: { contains: sku, mode: "insensitive" } }, { modelSku: { contains: sku, mode: "insensitive" } }] } } } : {}),
    ...(keyword ? {
      OR: [
        { orderSn: { contains: keyword, mode: "insensitive" } },
        { buyerUsername: { contains: keyword, mode: "insensitive" } },
        { trackingNumber: { contains: keyword, mode: "insensitive" } },
      ],
    } : {}),
  };

  const [orders, total, statusGroups] = await prisma.$transaction([
    prisma.shopeeOrder.findMany({
      where,
      include: {
        items: { orderBy: [{ itemName: "asc" }, { modelName: "asc" }] },
        shopSetting: { select: { shopName: true, region: true } },
        settlement: { select: SHOPEE_SETTLEMENT_PUBLIC_SELECT },
      },
      orderBy: [{ createTime: "desc" }, { orderSn: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.shopeeOrder.count({ where }),
    prisma.shopeeOrder.groupBy({ by: ["status"], where, _count: true, orderBy: { status: "asc" } }),
  ]);

  return NextResponse.json({
    data: orders,
    total,
    page,
    pageSize,
    statusCounts: Object.fromEntries(statusGroups.map((group) => [group.status || "UNKNOWN", group._count])),
    shops,
  });
}
