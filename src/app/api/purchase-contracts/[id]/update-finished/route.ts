import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncProductVariantInventory } from "@/lib/inventory-sync";

export const dynamic = 'force-dynamic';

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

    // 更新每个 item 的 finishedQty
    for (const item of items) {
      const { itemId, finishedQty } = item;
      if (!itemId || finishedQty == null) continue;

      const qty = parseInt(String(finishedQty), 10);
      if (isNaN(qty) || qty < 0) {
        return NextResponse.json({ error: `无效的完工数量: ${finishedQty}` }, { status: 400 });
      }

      // 获取 item 信息以验证和获取 variantId
      const contractItem = await prisma.purchaseContractItem.findUnique({
        where: { id: itemId },
        select: { variantId: true, qty: true },
      });

      if (!contractItem) {
        return NextResponse.json({ error: `采购合同项不存在: ${itemId}` }, { status: 404 });
      }

      if (qty > (contractItem.qty || 0)) {
        return NextResponse.json({ error: `完工数量不能超过合同数量 (${contractItem.qty})` }, { status: 400 });
      }

      // 更新完工数量
      await prisma.purchaseContractItem.update({
        where: { id: itemId },
        data: { finishedQty: qty },
      });

      if (contractItem.variantId && !affectedVariantIds.includes(contractItem.variantId)) {
        affectedVariantIds.push(contractItem.variantId);
      }
    }

    // 自动同步库存到 ProductVariant
    for (const variantId of affectedVariantIds) {
      await syncProductVariantInventory(variantId);
    }

    return NextResponse.json({ success: true, message: "完工数量已更新，库存已同步" });
  } catch (error: any) {
    console.error("更新完工数量失败:", error);
    return NextResponse.json({ error: error.message || "更新失败" }, { status: 500 });
  }
}
