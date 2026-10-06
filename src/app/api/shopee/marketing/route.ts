import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { withFreshShopeeToken } from "@/lib/shopee-order-sync";
import { shopeeShopGet, type ShopeeShopRequestInput } from "@/lib/shopee-open-api";

export const dynamic = "force-dynamic";

type PromotionList = { more?: boolean; discount_list?: Record<string, unknown>[]; voucher_list?: Record<string, unknown>[] };

async function fetchPromotionPages(
  input: ShopeeShopRequestInput,
  path: string,
  listKey: "discount_list" | "voucher_list",
) {
  const rows: Record<string, unknown>[] = [];
  for (let pageNo = 1; pageNo <= 10; pageNo += 1) {
    const response = await shopeeShopGet<PromotionList>(input, path, {
      page_no: pageNo,
      page_size: 100,
      ...(listKey === "discount_list" ? { discount_status: "all" } : { status: "all" }),
    });
    rows.push(...(response[listKey] || []));
    if (!response.more) break;
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const requestedShopId = new URL(request.url).searchParams.get("shopId")?.trim();
  const shops = await prisma.shopeeShopSetting.findMany({
    where: { status: "active", appConfig: { status: "active" } },
    select: { id: true, shopId: true, shopName: true, region: true, currency: true },
    orderBy: { createdAt: "asc" },
  });
  const shop = requestedShopId
    ? shops.find((candidate) => candidate.shopId === requestedShopId)
    : shops[0];
  if (!shop) {
    return NextResponse.json({ error: requestedShopId ? "Shopee 店铺不存在或未启用" : "没有已授权的 Shopee 店铺" }, { status: 404 });
  }

  const data = await withFreshShopeeToken(shop.id, async (input) => {
    const [discounts, vouchers] = await Promise.all([
      fetchPromotionPages(input, "/api/v2/discount/get_discount_list", "discount_list"),
      fetchPromotionPages(input, "/api/v2/voucher/get_voucher_list", "voucher_list"),
    ]);
    return { discounts, vouchers };
  });

  return NextResponse.json({
    ...data,
    shop: { shopId: shop.shopId, shopName: shop.shopName, region: shop.region, currency: shop.currency },
    shops: shops.map(({ id: _id, ...candidate }) => candidate),
    fetchedAt: new Date().toISOString(),
  });
}
