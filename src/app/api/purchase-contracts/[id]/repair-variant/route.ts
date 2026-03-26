import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-contracts/[id]/repair-variant
 * 修复某个采购合同 items 的 variantId 绑定（按 item.sku 反查 ProductVariant.id）
 * - 不会改数量/金额，只修正外键，解决“多个明细统计到同一SKU”
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params;

    const items = await prisma.purchaseContractItem.findMany({
      where: { contractId },
      select: { id: true, sku: true, variantId: true },
      orderBy: { sortOrder: "asc" },
    });

    if (items.length === 0) {
      return NextResponse.json({ error: "合同明细为空" }, { status: 400 });
    }

    const skuList = items
      .map((it) => String(it.sku || "").trim())
      .filter((s) => s.length > 0 && s !== "未填" && s !== "多款");

    const variants = await prisma.productVariant.findMany({
      where: { skuId: { in: Array.from(new Set(skuList)) } },
      select: { id: true, skuId: true },
    });
    const variantBySku = new Map<string, string>();
    for (const v of variants) variantBySku.set(v.skuId, v.id);

    let fixed = 0;
    let skipped = 0;
    let missing = 0;

    await prisma.$transaction(async (tx) => {
      for (const it of items) {
        const sku = String(it.sku || "").trim();
        const resolved = variantBySku.get(sku);
        if (!resolved) {
          missing += 1;
          continue;
        }
        if (it.variantId === resolved) {
          skipped += 1;
          continue;
        }
        await tx.purchaseContractItem.update({
          where: { id: it.id },
          data: { variantId: resolved },
        });
        fixed += 1;
      }
    });

    await clearCacheByPrefix("purchase-contracts");

    return NextResponse.json({
      success: true,
      contractId,
      fixed,
      skipped,
      missing,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "修复失败" },
      { status: 500 }
    );
  }
}

