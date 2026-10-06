import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getShopeeTrackingInfo, ShopeeApiError } from "@/lib/shopee-open-api";
import { withFreshShopeeToken } from "@/lib/shopee-order-sync";

export const dynamic = "force-dynamic";

function dateValue(value: unknown) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const shopId = params.get("shopId")?.trim();
  const orderSn = params.get("orderSn")?.trim();
  const packageNumber = params.get("packageNumber")?.trim() || undefined;
  if (!shopId || !orderSn) {
    return NextResponse.json({ error: "缺少 Shopee 店铺或订单号" }, { status: 400 });
  }

  const order = await prisma.shopeeOrder.findUnique({
    where: { shopId_orderSn: { shopId, orderSn } },
    select: { shopSettingId: true },
  });
  if (!order) return NextResponse.json({ error: "未找到该 Shopee 订单" }, { status: 404 });

  try {
    const tracking = await withFreshShopeeToken(order.shopSettingId, (credentials) => getShopeeTrackingInfo({
      ...credentials,
      orderSn,
      packageNumber,
    }));
    const timeline = (Array.isArray(tracking.tracking_info) ? tracking.tracking_info : [])
      .map((event) => ({
        updateTime: dateValue(event.update_time),
        description: typeof event.description === "string" ? event.description : null,
        logisticsStatus: typeof event.logistics_status === "string" ? event.logistics_status : null,
      }))
      .sort((left, right) => (right.updateTime?.getTime() || 0) - (left.updateTime?.getTime() || 0));

    return NextResponse.json({
      orderSn: tracking.order_sn || orderSn,
      packageNumber: tracking.package_number || packageNumber || null,
      logisticsStatus: tracking.logistics_status || null,
      timeline,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopee 物流轨迹查询失败";
    const status = error instanceof ShopeeApiError && error.status >= 400 && error.status < 500 ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
