import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { resolveVariantIdForContractSku } from "@/lib/resolve-variant-by-contract-sku";
import { syncProductVariantInventory } from "@/lib/inventory-sync";

export const dynamic = "force-dynamic";

/**
 * 将采购合同明细（variantId 为空）按 sku 文本宽松匹配到 ProductVariant 并写回。
 * POST body: { itemIds?: string[] } 不传则处理全部未绑定明细（最多 200 条）。
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    let body: { itemIds?: string[] } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const where =
      Array.isArray(body.itemIds) && body.itemIds.length > 0
        ? { id: { in: body.itemIds }, variantId: null }
        : { variantId: null };

    const items = await prisma.purchaseContractItem.findMany({
      where,
      select: { id: true, sku: true },
      take: 2000,
      orderBy: { updatedAt: "asc" },
    });

    const updated: { itemId: string; variantId: string; sku: string }[] = [];
    const skipped: { itemId: string; sku: string; reason: string }[] = [];

    for (const item of items) {
      const resolved = await resolveVariantIdForContractSku(item.sku);
      if (!resolved) {
        skipped.push({
          itemId: item.id,
          sku: item.sku,
          reason: "产品档案中无匹配的 skuId（请新增变体或统一拼写）",
        });
        continue;
      }
      await prisma.purchaseContractItem.update({
        where: { id: item.id },
        data: {
          variantId: resolved.variantId,
          // 与产品档案 skuId 对齐，避免以后再匹配失败
          sku: resolved.catalogSkuId,
        },
      });
      updated.push({
        itemId: item.id,
        variantId: resolved.variantId,
        sku: resolved.catalogSkuId,
      });
      try {
        await syncProductVariantInventory(resolved.variantId);
      } catch {
        /* 同步失败不阻断写回 */
      }
    }

    return NextResponse.json({
      ok: true,
      linked: updated.length,
      skipped: skipped.length,
      details: { updated, skipped },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
