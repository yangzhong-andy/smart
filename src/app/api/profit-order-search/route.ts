import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { defaultTimeZone, normalizeCountryCode } from "@/lib/profit-schemes";

export const dynamic = "force-dynamic";

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const query = String(request.nextUrl.searchParams.get("q") || "").trim();
    const selectedCountry = String(request.nextUrl.searchParams.get("countryCode") || "").trim();
    const selectedShopId = String(request.nextUrl.searchParams.get("shopId") || "").trim();
    if (query.length < 4) {
      return NextResponse.json({ error: "订单号至少输入 4 位" }, { status: 400 });
    }
    if (query.length > 64 || !/^[A-Za-z0-9_-]+$/.test(query)) {
      return NextResponse.json({ error: "订单号格式无效" }, { status: 400 });
    }

    const allShops = await prisma.tikTokShopSetting.findMany({
      select: { shopId: true, shopName: true, region: true },
    });
    const shops = allShops.filter((shop) => (
      (!selectedShopId || shop.shopId === selectedShopId)
      && (!selectedCountry || normalizeCountryCode(shop.region) === normalizeCountryCode(selectedCountry))
    ));
    const shopIds = shops.map((shop) => shop.shopId);
    if (shopIds.length === 0) return NextResponse.json({ results: [], hasMore: false });

    const orders = await prisma.tikTokOrder.findMany({
      where: {
        shopId: { in: shopIds },
        orderId: { contains: query },
      },
      select: {
        orderId: true,
        shopId: true,
        createTime: true,
        status: true,
        orderStatus: true,
        currency: true,
      },
      orderBy: [{ createTime: "desc" }, { orderId: "desc" }],
      take: 21,
    });
    const shopById = new Map(shops.map((shop) => [shop.shopId, shop]));
    const results = orders.slice(0, 20).map((order) => {
      const shop = shopById.get(order.shopId);
      const countryCode = normalizeCountryCode(shop?.region);
      const timeZone = defaultTimeZone(countryCode);
      return {
        orderId: order.orderId,
        shopId: order.shopId,
        shopName: shop?.shopName || order.shopId,
        countryCode,
        businessDate: order.createTime ? dateInTimeZone(order.createTime, timeZone) : null,
        createTime: order.createTime?.toISOString() || null,
        status: order.status || order.orderStatus || "UNKNOWN",
        currency: order.currency || null,
      };
    }).sort((left, right) => {
      if (left.orderId === query && right.orderId !== query) return -1;
      if (right.orderId === query && left.orderId !== query) return 1;
      return String(right.createTime || "").localeCompare(String(left.createTime || ""));
    });

    return NextResponse.json({ results, hasMore: orders.length > 20 });
  } catch (error: any) {
    console.error("[Profit Order Search]", error);
    return NextResponse.json({ error: error?.message || "订单搜索失败" }, { status: 500 });
  }
}
