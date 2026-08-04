import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/analytics?days=30&shopId=xxx
 * 订单分析聚合数据
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");
    const shopId = searchParams.get("shopId");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const now = new Date();

    // 构建时间筛选
    const timeFilter: any = {};
    if (startDateParam && endDateParam) {
      timeFilter.gte = new Date(startDateParam + "T03:00:00Z"); // 巴西0点=UTC3点
      const endDate = new Date(endDateParam + "T03:00:00Z");
      endDate.setDate(endDate.getDate() + 1); // 结束日期+1天，包含整天
      timeFilter.lt = endDate;
    } else {
      timeFilter.gte = new Date(now.getTime() - days * 86400000);
    }

    const where: any = { createTime: timeFilter };
    if (shopId) where.shopId = shopId;

    // 获取所有订单（含rawData）
    const orders = await prisma.tikTokOrder.findMany({
      where,
      select: {
        orderId: true, shopId: true, status: true, totalAmount: true,
        createTime: true, updateTime: true, rawData: true,
      },
      orderBy: { createTime: "desc" },
    });

    // 店铺名映射
    const shops = await prisma.tikTokShopSetting.findMany({ select: { shopId: true, shopName: true } });
    const shopMap = new Map(shops.map(s => [s.shopId, s.shopName]));

    // ===== 1. 核心指标 =====
    let totalSales = 0;
    let validOrders = 0;
    let cancelledOrders = 0;
    let unpaidOrders = 0;
    let sampleOrders = 0;
    let totalItems = 0;

    for (const o of orders) {
      const raw = o.rawData as any;
      const isSample = raw?.is_sample_order === true;
      const amt = parseFloat(o.totalAmount || "0");
      if (o.status === "CANCELLED") {
        cancelledOrders++;
      } else if (o.status === "UNPAID") {
        unpaidOrders++;
      } else if (isSample) {
        sampleOrders++; // 免费样品单独统计，不计入有效订单
      } else {
        totalSales += amt;
        validOrders++;
        totalItems += raw?.line_items?.length || 0;
      }
    }

    const cancelRate = orders.length > 0 ? (cancelledOrders / orders.length) * 100 : 0;

    // ===== 2. 每日趋势 =====
    const dailyMap = new Map<string, { orders: number; sales: number; cancelled: number }>();
    for (const o of orders) {
      if (!o.createTime) continue;
      const raw = o.rawData as any;
      const isSample = raw?.is_sample_order === true;
      const dateKey = o.createTime.toISOString().split("T")[0];
      if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, { orders: 0, sales: 0, cancelled: 0 });
      const d = dailyMap.get(dateKey)!;
      const amt = parseFloat(o.totalAmount || "0");
      if (o.status === "CANCELLED") {
        d.cancelled++;
      } else if (o.status !== "UNPAID" && !isSample) {
        d.orders++;
        d.sales += amt;
      }
    }
    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, v]) => ({ date, ...v, sales: parseFloat(v.sales.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ===== 3. 订单状态分布 =====
    const statusMap = new Map<string, number>();
    for (const o of orders) {
      statusMap.set(o.status || "UNKNOWN", (statusMap.get(o.status || "UNKNOWN") || 0) + 1);
    }

    // ===== 4. 订单漏斗 =====
    const funnel = {
      total: orders.length,
      paid: orders.filter(o => o.status !== "UNPAID").length,
      shipped: orders.filter(o => ["IN_TRANSIT", "DELIVERED", "COMPLETED"].includes(o.status || "")).length,
      delivered: orders.filter(o => ["DELIVERED", "COMPLETED"].includes(o.status || "")).length,
      completed: orders.filter(o => o.status === "COMPLETED").length,
    };

    // ===== 5. 商品销量排行 =====
    const productMap = new Map<string, { sku: string; name: string; qty: number; sales: number; image?: string }>();
    for (const o of orders) {
      if (o.status === "CANCELLED" || o.status === "UNPAID") continue;
      const raw = o.rawData as any;
      for (const item of raw?.line_items || []) {
        const sku = item.seller_sku || "unknown";
        if (!productMap.has(sku)) {
          productMap.set(sku, { sku, name: item.product_name?.substring(0, 50) || sku, qty: 0, sales: 0, image: item.sku_image });
        }
        const p = productMap.get(sku)!;
        p.qty += 1;
        p.sales += parseFloat(item.sale_price || "0");
      }
    }
    const productRanking = Array.from(productMap.values())
      .map(p => ({ ...p, sales: parseFloat(p.sales.toFixed(2)) }))
      .sort((a, b) => b.qty - a.qty);

    // ===== 6. 支付方式分布 =====
    const paymentMap = new Map<string, number>();
    for (const o of orders) {
      const raw = o.rawData as any;
      const method = raw?.payment_method_name;
      if (method && o.status !== "UNPAID") {
        paymentMap.set(method, (paymentMap.get(method) || 0) + 1);
      }
    }
    const paymentMethods = Array.from(paymentMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // ===== 7. 取消原因 =====
    const cancelReasonMap = new Map<string, number>();
    for (const o of orders) {
      if (o.status !== "CANCELLED") continue;
      const raw = o.rawData as any;
      const reason = raw?.cancel_reason || "未知原因";
      cancelReasonMap.set(reason, (cancelReasonMap.get(reason) || 0) + 1);
    }
    const cancelReasons = Array.from(cancelReasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // ===== 8. 物流商分布 =====
    const shippingMap = new Map<string, number>();
    for (const o of orders) {
      const raw = o.rawData as any;
      const provider = raw?.shipping_provider;
      if (provider) {
        shippingMap.set(provider, (shippingMap.get(provider) || 0) + 1);
      }
    }
    const shippingProviders = Array.from(shippingMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // ===== 9. 店铺对比 =====
    const shopStatsMap = new Map<string, { shopName: string; orders: number; sales: number; cancelled: number }>();
    for (const o of orders) {
      const sn = shopMap.get(o.shopId) || o.shopId;
      if (!shopStatsMap.has(o.shopId)) {
        shopStatsMap.set(o.shopId, { shopName: sn, orders: 0, sales: 0, cancelled: 0 });
      }
      const s = shopStatsMap.get(o.shopId)!;
      if (o.status === "CANCELLED") {
        s.cancelled++;
      } else if (o.status !== "UNPAID") {
        s.orders++;
        s.sales += parseFloat(o.totalAmount || "0");
      }
    }
    const shopComparison = Array.from(shopStatsMap.values()).map(s => ({
      ...s, sales: parseFloat(s.sales.toFixed(2)),
      avgPrice: s.orders > 0 ? parseFloat((s.sales / s.orders).toFixed(2)) : 0,
    }));

    // ===== 10. 发货时效 =====
    let totalShipHours = 0;
    let shipCount = 0;
    for (const o of orders) {
      const raw = o.rawData as any;
      if (raw?.rts_time && raw?.create_time) {
        const hours = (raw.rts_time - raw.create_time) / 3600;
        if (hours > 0 && hours < 720) { // 排除异常值（超过30天）
          totalShipHours += hours;
          shipCount++;
        }
      }
    }
    const avgShipHours = shipCount > 0 ? totalShipHours / shipCount : 0;

    // ===== 11. 今日数据 =====
    let todaySales = 0;
    let todayOrders = 0;
    let todayItems = 0;
    let todayCancelled = 0;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    for (const o of orders) {
      if (!o.createTime || o.createTime < todayStart) continue;
      const raw = o.rawData as any;
      const isSample = raw?.is_sample_order === true;
      if (o.status === "CANCELLED") {
        todayCancelled++;
      } else if (o.status !== "UNPAID" && !isSample) {
        todaySales += parseFloat(o.totalAmount || "0");
        todayOrders++;
        todayItems += raw?.line_items?.length || 0;
      }
    }

    return NextResponse.json({
      summary: {
        totalSales: parseFloat(totalSales.toFixed(2)),
        validOrders,
        cancelledOrders,
        unpaidOrders,
        sampleOrders,
        totalOrders: orders.length,
        totalItems,
        avgPrice: validOrders > 0 ? parseFloat((totalSales / validOrders).toFixed(2)) : 0,
        cancelRate: parseFloat(cancelRate.toFixed(1)),
        avgShipHours: parseFloat(avgShipHours.toFixed(1)),
        currency: "BRL",
      },
      today: {
        sales: parseFloat(todaySales.toFixed(2)),
        orders: todayOrders,
        items: todayItems,
        cancelled: todayCancelled,
        avgPrice: todayOrders > 0 ? parseFloat((todaySales / todayOrders).toFixed(2)) : 0,
      },
      dailyTrend,
      statusDistribution: Array.from(statusMap.entries()).map(([name, count]) => ({ name, count })),
      funnel,
      productRanking,
      paymentMethods,
      cancelReasons,
      shippingProviders,
      shopComparison,
    });
  } catch (error: any) {
    console.error("[TikTok Analytics] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
