import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { withFreshShopeeToken } from "@/lib/shopee-order-sync";
import { shopeeShopGet, ShopeeApiError } from "@/lib/shopee-open-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const requestedShopId = new URL(request.url).searchParams.get("shopId")?.trim();
  const shops = await prisma.shopeeShopSetting.findMany({
    where: { status: "active", appConfig: { status: "active" } },
    select: { id: true, shopId: true, shopName: true, region: true },
    orderBy: { createdAt: "asc" },
  });
  const shop = requestedShopId ? shops.find((candidate) => candidate.shopId === requestedShopId) : shops[0];
  if (!shop) return NextResponse.json({ error: "没有已授权的 Shopee 店铺" }, { status: 404 });

  try {
    const marker = await withFreshShopeeToken(shop.id, (input) =>
      shopeeShopGet<Record<string, unknown>>(input, "/api/v2/ams/get_performance_data_update_time"),
    );
    return NextResponse.json({
      enabled: true,
      marker,
      shop: { shopId: shop.shopId, shopName: shop.shopName, region: shop.region },
      shops: shops.map(({ id: _id, ...candidate }) => candidate),
    });
  } catch (error) {
    if (error instanceof ShopeeApiError && error.code === "error_api_permission") {
      return NextResponse.json({
        enabled: false,
        reason: "error_api_permission",
        message: "当前 Shopee 应用尚未开通 Affiliate Marketing Solution Management 权限",
        shop: { shopId: shop.shopId, shopName: shop.shopName, region: shop.region },
        shops: shops.map(({ id: _id, ...candidate }) => candidate),
      });
    }
    throw error;
  }
}
