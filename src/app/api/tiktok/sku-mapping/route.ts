import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/sku-mapping?shopId=xxx
 * 获取 SKU 映射列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");

    const where: any = {};
    if (shopId) where.tiktokShopId = shopId;

    const mappings = await prisma.tikTokSkuMapping.findMany({
      where,
      orderBy: { sellerSku: "asc" },
    });

    // 获取关联的 variant 信息
    const variantIds = [...new Set(mappings.map(m => m.variantId))];
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, skuId: true, productId: true, color: true, size: true },
    });
    const variantMap = new Map(variants.map(v => [v.id, v]));

    // 获取产品名
    const productIds = [...new Set(variants.map(v => v.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productMap = new Map(products.map(p => [p.id, p.name]));

    // 获取店铺名
    const shops = await prisma.tikTokShopSetting.findMany({
      select: { shopId: true, shopName: true },
    });
    const shopMap = new Map(shops.map(s => [s.shopId, s.shopName]));

    return NextResponse.json({
      mappings: mappings.map(m => ({
        ...m,
        variantSkuId: variantMap.get(m.variantId)?.skuId || null,
        variantName: [variantMap.get(m.variantId)?.color, variantMap.get(m.variantId)?.size].filter(Boolean).join(" / ") || null,
        productName: variantMap.get(m.variantId)?.productId ? productMap.get(variantMap.get(m.variantId)!.productId) || null : null,
        shopName: shopMap.get(m.tiktokShopId) || m.tiktokShopId,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/tiktok/sku-mapping
 * 添加/更新 SKU 映射
 * Body: { tiktokShopId, sellerSku, variantId, tiktokSkuName? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tiktokShopId, sellerSku, variantId, tiktokSkuName, tiktokProductId, tiktokSkuId } = body;

    if (!tiktokShopId || !sellerSku || !variantId) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 验证 variant 存在
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) {
      return NextResponse.json({ error: "系统产品变体不存在" }, { status: 400 });
    }

    const mapping = await prisma.tikTokSkuMapping.upsert({
      where: { tiktokShopId_sellerSku: { tiktokShopId, sellerSku } },
      create: {
        tiktokShopId, sellerSku, variantId,
        tiktokSkuName: tiktokSkuName || null,
        tiktokProductId: tiktokProductId || null,
        tiktokSkuId: tiktokSkuId || null,
      },
      update: {
        variantId,
        tiktokSkuName: tiktokSkuName || null,
        tiktokProductId: tiktokProductId || null,
        tiktokSkuId: tiktokSkuId || null,
      },
    });

    return NextResponse.json({ success: true, id: mapping.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/tiktok/sku-mapping?id=xxx
 * 删除 SKU 映射
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

    await prisma.tikTokSkuMapping.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
