import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncProductVariantInventory } from "@/lib/inventory-sync";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';
const CACHE_KEY_PREFIX = "purchase-contracts";

// POST /api/purchase-contracts/[id]/update-finished
// 更新采购合同的完工数量，并自动同步库存
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contractId } = await params;
    const body = await request.json();
    const items = body.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "请提供 items 数组" }, { status: 400 });
    }

    // 获取受影响的 variantId 列表
    const affectedVariantIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      // 更新每个 item 的 finishedQty
      for (const item of items) {
        const { itemId, finishedQty } = item;
        if (!itemId || finishedQty == null) continue;

        const qty = parseInt(String(finishedQty), 10);
        if (isNaN(qty) || qty < 0) {
          throw new Error(`INVALID_QTY:${finishedQty}`);
        }

        // 获取 item 信息以验证和获取 variantId
        const contractItem = await tx.purchaseContractItem.findUnique({
          where: { id: itemId },
          select: { variantId: true, qty: true },
        });

        if (!contractItem) {
          throw new Error(`ITEM_NOT_FOUND:${itemId}`);
        }

        if (qty > (contractItem.qty || 0)) {
          throw new Error(`QTY_EXCEED:${contractItem.qty}`);
        }

        // 更新完工数量
        await tx.purchaseContractItem.update({
          where: { id: itemId },
          data: { finishedQty: qty },
        });

        if (contractItem.variantId && !affectedVariantIds.includes(contractItem.variantId)) {
          affectedVariantIds.push(contractItem.variantId);
        }
      }

      // 同步回写合同 finishedQty，确保生产进度页顶部统计立即变化
      const agg = await tx.purchaseContractItem.aggregate({
        where: { contractId },
        _sum: { finishedQty: true },
      });
      await tx.purchaseContract.update({
        where: { id: contractId },
        data: { finishedQty: agg._sum.finishedQty ?? 0 },
      });
    });

    // 自动同步库存到 ProductVariant
    for (const variantId of affectedVariantIds) {
      await syncProductVariantInventory(variantId);
    }

    // 清理采购合同缓存，避免生产进度页拿到旧数据
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({ success: true, message: "完工数量已更新，库存已同步" });
  } catch (error: any) {
    console.error("更新完工数量失败:", error);
    const msg = String(error?.message || "");
    if (msg.startsWith("INVALID_QTY:")) {
      return NextResponse.json({ error: `无效的完工数量: ${msg.replace("INVALID_QTY:", "")}` }, { status: 400 });
    }
    if (msg.startsWith("ITEM_NOT_FOUND:")) {
      return NextResponse.json({ error: `采购合同项不存在: ${msg.replace("ITEM_NOT_FOUND:", "")}` }, { status: 404 });
    }
    if (msg.startsWith("QTY_EXCEED:")) {
      return NextResponse.json({ error: `完工数量不能超过合同数量 (${msg.replace("QTY_EXCEED:", "")})` }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || "更新失败" }, { status: 500 });
  }
}
