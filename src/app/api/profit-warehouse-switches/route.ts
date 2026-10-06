import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { extractTikTokWarehouseId } from "@/lib/profit-warehouse-mapping";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

const SWITCH_PLATFORMS = [
  { code: "TIKTOK", label: "TikTok Shop", switchEnabled: true },
  { code: "SHOPEE", label: "Shopee", switchEnabled: true },
  { code: "AMAZON", label: "Amazon", switchEnabled: false },
  { code: "MERCADO_LIVRE", label: "Mercado Livre", switchEnabled: true },
] as const;

async function findShopContext(platform: string, shopId: string) {
  if (platform === "TIKTOK") {
    return prisma.tikTokShopSetting.findUnique({
      where: { shopId },
      select: { shopId: true, region: true },
    });
  }
  if (platform === "SHOPEE") {
    const shop = await prisma.shopeeShopSetting.findFirst({
      where: { shopId },
      select: { shopId: true, region: true },
    });
    return shop;
  }
  if (platform === "MERCADO_LIVRE") {
    const account = await prisma.mercadoLivreAccount.findFirst({
      where: { userId: shopId, status: "active" },
      select: { userId: true, country: true },
    });
    return account ? { shopId: account.userId, region: account.country } : null;
  }
  return null;
}

async function findEarliestOrderTime(platform: string, shopId: string) {
  if (platform === "TIKTOK") {
    const order = await prisma.tikTokOrder.findFirst({
      where: { shopId, createTime: { not: null } },
      select: { createTime: true },
      orderBy: { createTime: "asc" },
    });
    return order?.createTime || null;
  }
  if (platform === "SHOPEE") {
    const order = await prisma.shopeeOrder.findFirst({
      where: { shopId, createTime: { not: null } },
      select: { createTime: true },
      orderBy: { createTime: "asc" },
    });
    return order?.createTime || null;
  }
  if (platform === "MERCADO_LIVRE") {
    const account = await prisma.mercadoLivreAccount.findFirst({
      where: { userId: shopId, status: "active" },
      select: { id: true },
    });
    if (!account) return null;
    const order = await prisma.mercadoLivreOrder.findFirst({
      where: { accountId: account.id, dateCreated: { not: null } },
      select: { dateCreated: true },
      orderBy: { dateCreated: "asc" },
    });
    return order?.dateCreated || null;
  }
  return null;
}

async function findBoundaryOrder(platform: string, shopId: string, orderId: string) {
  if (platform === "TIKTOK") {
    return prisma.tikTokOrder.findUnique({
      where: { orderId },
      select: { orderId: true, shopId: true, createTime: true },
    });
  }
  if (platform === "SHOPEE") {
    const order = await prisma.shopeeOrder.findUnique({
      where: { shopId_orderSn: { shopId, orderSn: orderId } },
      select: { orderSn: true, shopId: true, createTime: true },
    });
    return order ? { orderId: order.orderSn, shopId: order.shopId, createTime: order.createTime } : null;
  }
  if (platform === "MERCADO_LIVRE") {
    const order = await prisma.mercadoLivreOrder.findFirst({
      where: { externalOrderId: orderId, account: { userId: shopId, status: "active" } },
      select: { externalOrderId: true, dateCreated: true, account: { select: { userId: true } } },
    });
    return order ? { orderId: order.externalOrderId, shopId: order.account.userId, createTime: order.dateCreated } : null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const [rules, mappings, warehouses, latestOrders, tikTokShops, shopeeShops, mercadoLivreAccounts] = await Promise.all([
      prisma.profitWarehouseSwitchRule.findMany({
        include: { warehouse: { select: { name: true, code: true } } },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      }),
      prisma.tikTokWarehouseMapping.findMany({
        select: { tiktokWarehouseId: true, tiktokShopId: true, warehouseId: true },
      }),
      prisma.warehouse.findMany({
        where: { type: "OVERSEAS" },
        select: { id: true, name: true, code: true },
      }),
      prisma.tikTokOrder.findMany({
        where: { createTime: { not: null } },
        select: { shopId: true, createTime: true, rawData: true },
        orderBy: { createTime: "desc" },
        take: 1000,
      }),
      prisma.tikTokShopSetting.findMany({
        select: {
          shopId: true,
          shopName: true,
          region: true,
          storeId: true,
          store: { select: { name: true, country: true } },
        },
        orderBy: { shopName: "asc" },
      }),
      prisma.shopeeShopSetting.findMany({
        select: {
          shopId: true,
          shopName: true,
          region: true,
          storeId: true,
          store: { select: { name: true, country: true } },
        },
        orderBy: { shopName: "asc" },
      }),
      prisma.mercadoLivreAccount.findMany({
        where: { status: "active" },
        select: {
          userId: true,
          nickname: true,
          country: true,
          storeId: true,
          store: { select: { name: true, country: true } },
        },
        orderBy: { nickname: "asc" },
      }),
    ]);
    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    const latestByShopWarehouse = new Map<string, { shopId: string; externalWarehouseId: string; latestOrderTime: string }>();
    for (const order of latestOrders) {
      const externalWarehouseId = extractTikTokWarehouseId(order.rawData);
      if (!externalWarehouseId || !order.createTime) continue;
      const key = `${order.shopId}\u0000${externalWarehouseId}`;
      if (!latestByShopWarehouse.has(key)) {
        latestByShopWarehouse.set(key, {
          shopId: order.shopId,
          externalWarehouseId,
          latestOrderTime: order.createTime.toISOString(),
        });
      }
    }

    return NextResponse.json({
      platforms: SWITCH_PLATFORMS,
      shops: [
        ...tikTokShops.map((shop) => ({
          platform: "TIKTOK",
          shopId: shop.shopId,
          shopName: shop.store?.name || shop.shopName,
          countryCode: shop.region || shop.store?.country || "UNSET",
          storeId: shop.storeId,
        })),
        ...shopeeShops.map((shop) => ({
          platform: "SHOPEE",
          shopId: shop.shopId,
          shopName: shop.store?.name || shop.shopName || `Shopee ${shop.shopId}`,
          countryCode: shop.region || shop.store?.country || "UNSET",
          storeId: shop.storeId,
        })),
        ...mercadoLivreAccounts.map((account) => ({
          platform: "MERCADO_LIVRE",
          shopId: account.userId,
          shopName: account.store?.name || account.nickname || `Mercado Livre ${account.userId}`,
          countryCode: account.country || account.store?.country || "UNSET",
          storeId: account.storeId,
        })),
      ],
      rules: rules.map((rule) => ({
        ...rule,
        effectiveFrom: rule.effectiveFrom.toISOString(),
      })),
      mappings: mappings.map((mapping) => ({
        ...mapping,
        warehouseName: warehouseById.get(mapping.warehouseId)?.name || mapping.warehouseId,
      })),
      latestWarehouseIds: [...latestByShopWarehouse.values()],
    });
  } catch (error: any) {
    console.error("[Profit Warehouse Switches]", error);
    return NextResponse.json({ error: error?.message || "仓库切换记录读取失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const platform = String(body?.platform || "TIKTOK").trim().toUpperCase();
    const mode = String(body?.mode || "SWITCH").trim().toUpperCase();
    const shopId = String(body?.shopId || "").trim();
    const warehouseId = String(body?.warehouseId || "").trim();
    const effectiveOrderId = String(body?.effectiveOrderId || "").trim();
    const externalWarehouseId = "*";
    if (!shopId || !warehouseId) {
      return NextResponse.json({ error: "请选择店铺和目标仓库" }, { status: 400 });
    }
    if (mode !== "INITIAL_BINDING" && !effectiveOrderId) {
      return NextResponse.json({ error: "请填写首笔新仓订单号" }, { status: 400 });
    }

    const supportedPlatform = SWITCH_PLATFORMS.find((item) => item.code === platform);
    if (!supportedPlatform) {
      return NextResponse.json({ error: "不支持该平台的仓库切换" }, { status: 400 });
    }

    if (mode === "INITIAL_BINDING") {
      const [shop, warehouse, existingRule, earliestOrderTime] = await Promise.all([
        findShopContext(platform, shopId),
        prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, type: true } }),
        prisma.profitWarehouseSwitchRule.findFirst({ where: { platform, shopId }, select: { id: true } }),
        findEarliestOrderTime(platform, shopId),
      ]);
      if (!shop) return NextResponse.json({ error: "所选平台下没有这个店铺" }, { status: 400 });
      if (!warehouse || warehouse.type !== "OVERSEAS") return NextResponse.json({ error: "目标海外仓不存在" }, { status: 400 });
      if (existingRule) {
        return NextResponse.json({ error: "该店铺已有仓库规则；如需换仓，请使用下方的首笔订单切仓功能" }, { status: 409 });
      }

      const effectiveFrom = earliestOrderTime || new Date();
      const rule = await prisma.$transaction(async (tx) => {
        const created = await tx.profitWarehouseSwitchRule.create({
          data: {
            platform,
            region: shop.region,
            shopId,
            externalWarehouseId,
            warehouseId,
            effectiveFrom,
            effectiveOrderId: null,
            notes: String(body?.notes || "").trim() || "新店铺初始仓库绑定（从首笔订单起）",
          },
        });
        if (platform === "SHOPEE" || platform === "MERCADO_LIVRE") {
          await tx.platformStockActivation.upsert({
            where: { platform_shopId: { platform, shopId } },
            create: {
              platform,
              shopId,
              enabled: true,
              activeFrom: effectiveFrom,
              notes: `${supportedPlatform.label} 商品库存从店铺仓库绑定时间开始自动扣减（已发货订单）`,
            },
            update: { enabled: true, activeFrom: effectiveFrom },
          });
        }
        return created;
      });
      await clearCacheByPrefix("profit-report");
      return NextResponse.json({ success: true, id: rule.id, effectiveFrom: effectiveFrom.toISOString() });
    }

    if (!supportedPlatform.switchEnabled) {
      return NextResponse.json({ error: `${supportedPlatform.label} 订单接口尚未接入，暂时不能设置首笔订单切仓边界` }, { status: 400 });
    }

    const [shop, warehouse, boundaryOrder] = await Promise.all([
      findShopContext(platform, shopId),
      prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, type: true } }),
      effectiveOrderId ? findBoundaryOrder(platform, shopId, effectiveOrderId) : Promise.resolve(null),
    ]);
    if (!shop) return NextResponse.json({ error: "店铺不存在" }, { status: 400 });
    if (!warehouse || warehouse.type !== "OVERSEAS") return NextResponse.json({ error: "目标海外仓不存在" }, { status: 400 });

    if (!boundaryOrder || !boundaryOrder.createTime) return NextResponse.json({ error: "首笔新仓订单不存在或缺少下单时间" }, { status: 400 });
    if (boundaryOrder.shopId !== shopId) return NextResponse.json({ error: "首笔新仓订单不属于所选店铺" }, { status: 400 });
    const effectiveFrom = boundaryOrder.createTime;

    const data = {
      region: shop.region,
      warehouseId,
      effectiveOrderId: effectiveOrderId || null,
      notes: String(body?.notes || "").trim() || null,
    };
    const rule = await prisma.profitWarehouseSwitchRule.upsert({
      where: {
        platform_shopId_externalWarehouseId_effectiveFrom: {
          platform,
          shopId,
          externalWarehouseId,
          effectiveFrom,
        },
      },
      create: {
        platform,
        shopId,
        externalWarehouseId,
        effectiveFrom,
        ...data,
      },
      update: data,
    });
    await clearCacheByPrefix("profit-report");
    return NextResponse.json({ success: true, id: rule.id, externalWarehouseId, effectiveFrom: effectiveFrom.toISOString() });
  } catch (error: any) {
    console.error("[Profit Warehouse Switches]", error);
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003"
      ? "该仓库仍被其他记录使用"
      : error?.message || "仓库切换记录保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    const id = request.nextUrl.searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "缺少切换记录 ID" }, { status: 400 });
    await prisma.profitWarehouseSwitchRule.delete({ where: { id } });
    await clearCacheByPrefix("profit-report");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Profit Warehouse Switches]", error);
    return NextResponse.json({ error: error?.message || "仓库切换记录删除失败" }, { status: 500 });
  }
}
