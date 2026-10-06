import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { tiktokAffiliateCommissionCost } from "@/lib/profit-affiliate-commissions";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 24 * 60 * 60 * 1000;

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateBoundary(value: string, end = false) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

/** Read-only operational reporting for official SKU-level creator attribution. */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId") || "";
    const creator = searchParams.get("creator")?.trim() || "";
    const orderId = searchParams.get("orderId")?.trim() || "";
    const startDate = searchParams.get("startDate") || new Date(Date.now() - 29 * DAY).toISOString().slice(0, 10);
    const endDate = searchParams.get("endDate") || new Date().toISOString().slice(0, 10);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 30)));
    if (!DATE.test(startDate) || !DATE.test(endDate) || startDate > endDate) {
      return NextResponse.json({ error: "日期格式无效" }, { status: 400 });
    }
    if (dateBoundary(endDate, true).getTime() - dateBoundary(startDate).getTime() > 90 * DAY) {
      return NextResponse.json({ error: "查询时间范围不能超过 90 天" }, { status: 400 });
    }

    const [shops, orders] = await Promise.all([
      prisma.tikTokShopSetting.findMany({
        where: { status: "active" },
        select: { shopId: true, shopName: true, region: true },
        orderBy: { shopName: "asc" },
      }),
      prisma.tikTokOrder.findMany({
        where: {
          ...(shopId ? { shopId } : {}),
          createTime: { gte: dateBoundary(startDate), lt: dateBoundary(endDate, true) },
          ...(orderId ? { orderId: { contains: orderId } } : {}),
        },
        select: { orderId: true, shopId: true, createTime: true, status: true },
      }),
    ]);
    const orderById = new Map(orders.map((order) => [order.orderId, order]));
    const orderIds = orders.map((order) => order.orderId);
    const attributionWhere = {
      platform: "TIKTOK",
      ...(shopId ? { shopId } : {}),
      orderId: { in: orderIds.length ? orderIds : ["__NO_CREATOR_ORDER__"] },
      ...(creator ? { creatorUsername: { contains: creator, mode: "insensitive" as const } } : {}),
    };
    const attributions = await prisma.creatorOrderAttribution.findMany({
      where: attributionWhere,
      select: {
        id: true, shopId: true, orderId: true, externalSkuId: true,
        creatorUsername: true, creatorUserId: true, creatorNickname: true,
        collaborationType: true, settlementStatus: true, quantity: true,
        currency: true, unitPrice: true, source: true, syncedAt: true,
      },
      orderBy: [{ syncedAt: "desc" }],
    });
    const total = attributions.length;
    const pageAttributions = attributions.slice((page - 1) * pageSize, page * pageSize);
    /*
     * The maximum report window is 90 days. Read only small attribution columns
     * once so totals and order-level commission allocation use the same complete
     * population instead of incorrectly calculating cards from one page.
     */
    const allMatchedOrderIds = [...new Set(attributions.map((row) => row.orderId))];
    const settlementRows = allMatchedOrderIds.length
      ? await prisma.platformSettlementTransaction.findMany({
          where: { platform: "TIKTOK", orderId: { in: allMatchedOrderIds } },
          select: { orderId: true, rawData: true },
        })
      : [];
    // Commission is read from settlement rows, not estimated from creator orders.
    const commissionByOrder = new Map<string, number>();
    for (const row of settlementRows) {
      commissionByOrder.set(row.orderId, (commissionByOrder.get(row.orderId) || 0) + tiktokAffiliateCommissionCost(row.rawData).total);
    }
    const grossByOrder = new Map<string, number>();
    for (const row of attributions) {
      grossByOrder.set(row.orderId, (grossByOrder.get(row.orderId) || 0) + numberValue(row.unitPrice) * (row.quantity || 0));
    }
    const shopMap = new Map(shops.map((shop) => [shop.shopId, shop]));
    const lines = pageAttributions.map((row) => {
      const gross = numberValue(row.unitPrice) * (row.quantity || 0);
      const totalGross = grossByOrder.get(row.orderId) || 0;
      const exactCommission = commissionByOrder.get(row.orderId) || 0;
      return {
        id: row.id,
        shopId: row.shopId,
        shopName: shopMap.get(row.shopId)?.shopName || row.shopId,
        orderId: row.orderId,
        orderTime: orderById.get(row.orderId)?.createTime || null,
        orderStatus: orderById.get(row.orderId)?.status || null,
        creatorUsername: row.creatorUsername,
        creatorNickname: row.creatorNickname,
        creatorUserId: row.creatorUserId,
        externalSkuId: row.externalSkuId,
        quantity: row.quantity || 0,
        currency: row.currency || "",
        unitPrice: numberValue(row.unitPrice),
        gross,
        settlementStatus: row.settlementStatus,
        collaborationType: row.collaborationType,
        source: row.source,
        syncedAt: row.syncedAt,
        settlementCommission: totalGross > 0 ? exactCommission * gross / totalGross : 0,
        commissionAllocation: totalGross > 0 ? "按本订单达人 SKU GMV 比例分摊" : "无可分摊 GMV",
      };
    });
    const summary = new Map<string, { shopId: string; shopName: string; creatorUsername: string; creatorNickname: string | null; orderIds: Set<string>; skuLines: number; quantity: number; gross: number; commission: number; currency: string }>();
    for (const row of attributions) {
      const gross = numberValue(row.unitPrice) * (row.quantity || 0);
      const totalGross = grossByOrder.get(row.orderId) || 0;
      const exactCommission = commissionByOrder.get(row.orderId) || 0;
      const shop = shopMap.get(row.shopId);
      const key = `${row.shopId}:${row.creatorUsername}:${row.currency || ""}`;
      const current = summary.get(key) || { creatorUsername: row.creatorUsername, creatorNickname: row.creatorNickname, shopId: row.shopId, shopName: shop?.shopName || row.shopId, orderIds: new Set<string>(), skuLines: 0, quantity: 0, gross: 0, commission: 0, currency: row.currency || "" };
      current.orderIds.add(row.orderId);
      current.skuLines += 1;
      current.quantity += row.quantity || 0;
      current.gross += gross;
      current.commission += totalGross > 0 ? exactCommission * gross / totalGross : 0;
      summary.set(key, current);
    }
    return NextResponse.json({
      shops,
      filters: { startDate, endDate, shopId, creator, orderId },
      summary: [...summary.values()].map((value) => ({ ...value, orders: value.orderIds.size, orderIds: undefined })),
      lines,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      note: "订单归因来自官方联盟订单 API；达人佣金来自平台结算单，同一订单多人时按达人 SKU GMV 分摊展示。",
    });
  } catch (error: any) {
    console.error("[Creator center] report error:", error);
    return NextResponse.json({ error: error?.message || "达人中心数据加载失败" }, { status: 500 });
  }
}
