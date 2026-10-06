import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  PLATFORM_ORDER_CAPABILITIES,
  normalizeCommercePlatform,
} from "@/lib/platform-orders/contract";
import { getPlatformOrderAdapter } from "@/lib/platform-orders/registry";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const query = String(request.nextUrl.searchParams.get("q") || "").trim();
    const requestedPlatform = request.nextUrl.searchParams.get("platform") || "TIKTOK";
    const platform = normalizeCommercePlatform(requestedPlatform);
    const selectedCountry = String(request.nextUrl.searchParams.get("countryCode") || "").trim();
    const selectedShopId = String(request.nextUrl.searchParams.get("shopId") || "").trim();
    if (!platform) {
      return NextResponse.json({ error: "订单平台无效" }, { status: 400 });
    }
    if (query.length < 4) {
      return NextResponse.json({ error: "订单号至少输入 4 位" }, { status: 400 });
    }
    if (query.length > 64 || !/^[A-Za-z0-9_-]+$/.test(query)) {
      return NextResponse.json({ error: "订单号格式无效" }, { status: 400 });
    }

    const adapter = getPlatformOrderAdapter(platform);
    if (!adapter) {
      return NextResponse.json({
        error: `${PLATFORM_ORDER_CAPABILITIES[platform].label} 订单接口尚未接入`,
        platform,
      }, { status: 409 });
    }
    const orders = await adapter.searchOrders({
      query,
      externalShopId: selectedShopId || undefined,
      countryCode: selectedCountry || undefined,
      limit: 21,
    });
    const results = orders.slice(0, 20).sort((left, right) => {
      if (left.orderId === query && right.orderId !== query) return -1;
      if (right.orderId === query && left.orderId !== query) return 1;
      return String(right.createTime || "").localeCompare(String(left.createTime || ""));
    });

    return NextResponse.json({ platform, results, hasMore: orders.length > 20 });
  } catch (error: any) {
    console.error("[Profit Order Search]", error);
    return NextResponse.json({ error: error?.message || "订单搜索失败" }, { status: 500 });
  }
}
