import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string | null) {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function nextDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function timeZoneForRegion(region: string | null | undefined) {
  return region === "US" ? "America/Denver" : "America/Sao_Paulo";
}

function startOfDateInTimeZone(value: string, timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  const localMidnightAsUtc = new Date(Date.UTC(year, month - 1, day));
  const offsetAt = (instant: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const displayedAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    return displayedAsUtc - instant.getTime();
  };

  // Calculate the timezone offset twice so the date boundary remains correct on DST changes.
  let instant = new Date(localMidnightAsUtc.getTime() - offsetAt(localMidnightAsUtc));
  instant = new Date(localMidnightAsUtc.getTime() - offsetAt(instant));
  return instant;
}

function orderTimeRange(startDate: string | null, endDate: string | null, timeZone: string) {
  return {
    ...(startDate ? { gte: startOfDateInTimeZone(startDate, timeZone) } : {}),
    ...(endDate ? { lt: startOfDateInTimeZone(nextDate(endDate), timeZone) } : {}),
  };
}

/**
 * GET /api/tiktok/data?type=orders|statements|payments|products|summary|orderDetail
 * 查询已同步的 TikTok 数据
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "summary";
    const shopId = searchParams.get("shopId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const status = searchParams.get("status");
    const keyword = searchParams.get("keyword");
    const sku = searchParams.get("sku");
    const shippingType = searchParams.get("shippingType");
    const orderStartDate = searchParams.get("orderStartDate");
    const orderEndDate = searchParams.get("orderEndDate");
    const skip = (page - 1) * pageSize;

    if (type === "orders" && (
      (orderStartDate && !isValidDate(orderStartDate))
      || (orderEndDate && !isValidDate(orderEndDate))
      || (orderStartDate && orderEndDate && orderStartDate > orderEndDate)
    )) {
      return NextResponse.json({ error: "Invalid order date range" }, { status: 400 });
    }

    const where: any = {};
    if (shopId) where.shopId = shopId;
    if (status) where.status = status;
    if (keyword && type === "orders") {
      where.OR = [
        { orderId: { contains: keyword, mode: "insensitive" } },
      ];
    }
    if (type === "orders" && sku) {
      where.rawData = {
        ...(where.rawData || {}),
        path: ["line_items"],
        array_contains: [{ seller_sku: sku }],
      };
    }
    if (type === "orders" && shippingType) {
      where.AND = [
        ...(where.AND || []),
        { rawData: { path: ["shipping_type"], equals: shippingType } },
      ];
    }
    if (type === "orders" && (orderStartDate || orderEndDate)) {
      const dateShops = await prisma.tikTokShopSetting.findMany({
        where: shopId ? { shopId } : undefined,
        select: { shopId: true, region: true },
      });
      const shopsByTimeZone = new Map<string, string[]>();
      for (const shop of dateShops) {
        const timeZone = timeZoneForRegion(shop.region);
        shopsByTimeZone.set(timeZone, [...(shopsByTimeZone.get(timeZone) || []), shop.shopId]);
      }
      const dateConditions = [...shopsByTimeZone.entries()].map(([timeZone, shopIds]) => ({
        shopId: { in: shopIds },
        createTime: orderTimeRange(orderStartDate, orderEndDate, timeZone),
      }));
      if (!shopId && dateShops.length > 0) {
        dateConditions.push({
          shopId: { notIn: dateShops.map((shop) => shop.shopId) },
          createTime: orderTimeRange(orderStartDate, orderEndDate, "America/Sao_Paulo"),
        });
      }
      if (dateConditions.length === 1 && shopId) {
        where.createTime = dateConditions[0].createTime;
      } else if (dateConditions.length > 0) {
        where.AND = [
          ...(where.AND || []),
          { OR: dateConditions },
        ];
      } else {
        where.createTime = orderTimeRange(orderStartDate, orderEndDate, "America/Sao_Paulo");
      }
    }

    // 获取所有已授权店铺列表（用于前端筛选）
    if (type === "shops") {
      const shops = await prisma.tikTokShopSetting.findMany({
        where: { status: "active" },
        select: {
          shopId: true,
          shopName: true,
          region: true,
          sellerType: true,
          lastSyncAt: true,
        },
        orderBy: { shopName: "asc" },
      });
      return NextResponse.json({ shops });
    }

    if (type === "orderFilters") {
      const shopCondition = shopId
        ? Prisma.sql`AND o."shopId" = ${shopId}`
        : Prisma.empty;
      const [skuRows, shippingTypeRows] = await Promise.all([
        prisma.$queryRaw<Array<{ value: string }>>(Prisma.sql`
          SELECT DISTINCT item->>'seller_sku' AS value
          FROM "TikTokOrder" o
          CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(o."rawData"->'line_items', '[]'::jsonb)
          ) item
          WHERE NULLIF(item->>'seller_sku', '') IS NOT NULL
          ${shopCondition}
          ORDER BY value
        `),
        prisma.$queryRaw<Array<{ value: string }>>(Prisma.sql`
          SELECT DISTINCT o."rawData"->>'shipping_type' AS value
          FROM "TikTokOrder" o
          WHERE NULLIF(o."rawData"->>'shipping_type', '') IS NOT NULL
          ${shopCondition}
          ORDER BY value
        `),
      ]);
      return NextResponse.json({
        skus: skuRows.map(row => row.value),
        shippingTypes: shippingTypeRows.map(row => row.value),
      });
    }

    if (type === "summary") {
      const [orders, statements, payments, products] = await Promise.all([
        prisma.tikTokOrder.count({ where }),
        prisma.tikTokStatement.count({ where }),
        prisma.tikTokPayment.count({ where }),
        prisma.tikTokProduct.count({ where }),
      ]);

      // 结算总额
      const stmts = await prisma.tikTokStatement.findMany({
        where,
        select: { netSalesAmount: true, feeAmount: true, settlementAmount: true, currency: true },
      });
      const totalNetSales = stmts.reduce((sum, s) => sum + parseFloat(s.netSalesAmount || "0"), 0);
      const totalFees = stmts.reduce((sum, s) => sum + parseFloat(s.feeAmount || "0"), 0);
      const totalSettlement = stmts.reduce((sum, s) => sum + parseFloat(s.settlementAmount || "0"), 0);

      // 回款总额
      const pays = await prisma.tikTokPayment.findMany({
        where,
        select: { amount: true, status: true },
      });
      const totalPaid = pays.filter((p) => p.status === "PAID").reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
      const totalProcessing = pays.filter((p) => p.status === "PROCESSING").reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

      // 订单状态分布
      const orderStatuses = await prisma.tikTokOrder.groupBy({
        by: ["status"],
        _count: true,
      });

      // 订单金额统计
      const allOrders = await prisma.tikTokOrder.findMany({
        where,
        select: { totalAmount: true, status: true },
      });
      const completedAmount = allOrders
        .filter((o) => o.status === "COMPLETED")
        .reduce((sum, o) => sum + parseFloat(o.totalAmount || "0"), 0);
      const cancelledCount = allOrders.filter((o) => o.status === "CANCELLED").length;

      return NextResponse.json({
        counts: { orders, statements, payments, products },
        finance: {
          totalNetSales: totalNetSales.toFixed(2),
          totalFees: Math.abs(totalFees).toFixed(2),
          totalSettlement: totalSettlement.toFixed(2),
          totalPaid: totalPaid.toFixed(2),
          totalProcessing: totalProcessing.toFixed(2),
          currency: stmts[0]?.currency || "BRL",
        },
        orders: {
          completedAmount: completedAmount.toFixed(2),
          cancelledCount,
        },
        orderStatuses: orderStatuses.map((s) => ({ status: s.status, count: s._count })),
      });
    }

    if (type === "orders") {
      // 先获取店铺名映射
      const allShops = await prisma.tikTokShopSetting.findMany({
        select: { shopId: true, shopName: true, region: true },
      });
      const shopMap = new Map(allShops.map(s => [s.shopId, s.shopName]));
      const shopRegionMap = new Map(allShops.map(s => [s.shopId, s.region]));

      const [data, total] = await Promise.all([
        prisma.tikTokOrder.findMany({
          where,
          orderBy: { createTime: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.tikTokOrder.count({ where }),
      ]);

      // 从 rawData 提取完整字段
      const enriched = data.map((o) => {
        const raw = o.rawData as any;
        return {
          id: o.id,
          orderId: o.orderId,
          shopId: o.shopId,
          shopName: shopMap.get(o.shopId) || o.shopId,
          shopRegion: shopRegionMap.get(o.shopId) || null,
          status: o.status,
          totalAmount: o.totalAmount,
          currency: raw?.payment?.currency || raw?.currency || "BRL",
          createTime: o.createTime,
          updateTime: o.updateTime,
          // 商品详情
          lineItems: raw?.line_items || [],
          itemSummary: raw?.line_items?.map((li: any) => ({
            name: li.product_name?.substring(0, 40),
            sku: li.seller_sku,
            qty: li.quantity || 1,
            price: li.sale_price,
            image: li.sku_image,
          })),
          // 物流信息
          shippingProvider: raw?.shipping_provider,
          trackingNumber: raw?.tracking_number,
          rtsTime: raw?.rts_time ? new Date(raw.rts_time * 1000) : null,
          deliveryTime: raw?.delivery_time ? new Date(raw.delivery_time * 1000) : null,
          deliveryType: raw?.delivery_type,
          shippingType: raw?.shipping_type,
          deliveryOptionName: raw?.delivery_option_name,
          // 买家信息（未付款用 cpf_name，已付款用收件人姓名）
          buyerName: (() => {
            const fn = (raw?.recipient_address?.first_name || "").trim();
            const ln = (raw?.recipient_address?.last_name || "").trim();
            // 先拼接收件人姓名
            let full = [fn, ln].filter(Boolean).join(" ");
            // 如果拼接后是重复的，去重
            if (full) {
              const half = full.substring(0, Math.floor(full.length / 2)).trim();
              if (half && full === half + " " + half) return half;
            }
            // 已付款且有收件人姓名
            if (full) return full;
            // 未付款或其他情况，用 cpf_name
            return raw?.cpf_name || "";
          })(),
          buyerAddress: raw?.recipient_address?.full_address?.substring(0, 60),
          paymentMethod: raw?.payment_method_name,
          // 支付明细
          payment: raw?.payment,
          isSampleOrder: raw?.is_sample_order === true,
        };
      });

      return NextResponse.json({ data: enriched, total, page, pageSize });
    }

    if (type === "statements") {
      const allShops = await prisma.tikTokShopSetting.findMany({ select: { shopId: true, shopName: true } });
      const shopMap = new Map(allShops.map(s => [s.shopId, s.shopName]));
      const [data, total] = await Promise.all([
        prisma.tikTokStatement.findMany({
          where,
          orderBy: { statementTime: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.tikTokStatement.count({ where }),
      ]);
      const enriched = data.map(s => ({ ...s, shopName: shopMap.get(s.shopId) || s.shopId }));
      return NextResponse.json({ data: enriched, total, page, pageSize });
    }

    if (type === "payments") {
      const allShops = await prisma.tikTokShopSetting.findMany({ select: { shopId: true, shopName: true } });
      const shopMap = new Map(allShops.map(s => [s.shopId, s.shopName]));
      const [data, total] = await Promise.all([
        prisma.tikTokPayment.findMany({
          where,
          orderBy: { createTime: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.tikTokPayment.count({ where }),
      ]);
      const enriched = data.map(p => ({ ...p, shopName: shopMap.get(p.shopId) || p.shopId }));
      return NextResponse.json({ data: enriched, total, page, pageSize });
    }

    if (type === "products") {
      const [data, total] = await Promise.all([
        prisma.tikTokProduct.findMany({
          where,
          orderBy: { createTime: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.tikTokProduct.count({ where }),
      ]);
      return NextResponse.json({ data, total, page, pageSize });
    }

    return NextResponse.json({ error: "未知类型" }, { status: 400 });
  } catch (error: any) {
    console.error("[TikTok Data] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
