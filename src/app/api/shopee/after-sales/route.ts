import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { businessDateUtcRange } from "@/lib/order-business-time";
import { normalizeCountryCode } from "@/lib/profit-schemes";

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
  const startDate = params.get("startDate");
  const endDate = params.get("endDate");
  const shops = await prisma.shopeeShopSetting.findMany({ where: { status: "active" }, select: { shopId: true, shopName: true, region: true }, orderBy: { createdAt: "asc" } });
  const dateConditions: Prisma.ShopeeReturnWhereInput[] = startDate || endDate
    ? shops.filter((shop) => !shopId || shop.shopId === shopId).map((shop) => ({ shopId: shop.shopId, sourceCreateTime: businessDateUtcRange(startDate, endDate, normalizeCountryCode(shop.region)) }))
    : [];
  const where: Prisma.ShopeeReturnWhereInput = {
    ...(shopId ? { shopId } : {}),
    ...(status ? { status } : {}),
    ...(startDate || endDate ? { AND: [{ OR: dateConditions.length ? dateConditions : [{ shopId: "__NO_MATCHING_SHOP__" }] }] } : {}),
    ...(keyword ? { OR: [
      { returnSn: { contains: keyword, mode: "insensitive" } },
      { orderSn: { contains: keyword, mode: "insensitive" } },
      { trackingNumber: { contains: keyword, mode: "insensitive" } },
      { buyerUsername: { contains: keyword, mode: "insensitive" } },
      { items: { some: { OR: [
        { itemSku: { contains: keyword, mode: "insensitive" } },
        { modelSku: { contains: keyword, mode: "insensitive" } },
      ] } } },
    ] } : {}),
  };

  const [rows, total, statusGroups, totals] = await prisma.$transaction([
    prisma.shopeeReturn.findMany({
      where,
      include: {
        items: { orderBy: [{ itemName: "asc" }, { modelSku: "asc" }] },
        order: { select: { status: true, totalAmount: true, createTime: true } },
        shopSetting: { select: { shopName: true, region: true } },
      },
      orderBy: [{ sourceUpdateTime: "desc" }, { sourceCreateTime: "desc" }, { returnSn: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.shopeeReturn.count({ where }),
    prisma.shopeeReturn.groupBy({ by: ["status"], where, _count: { _all: true }, orderBy: { status: "asc" } }),
    prisma.shopeeReturn.aggregate({ where, _sum: { refundAmount: true } }),
  ]);

  return NextResponse.json({
    data: rows,
    total,
    page,
    pageSize,
    refundTotal: totals._sum.refundAmount || 0,
    statusCounts: Object.fromEntries(statusGroups.map((group) => [
      group.status || "UNKNOWN",
      typeof group._count === "object" ? group._count?._all || 0 : 0,
    ])),
    shops,
  });
}
