import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncProductVariantInventory } from "@/lib/inventory-sync";

export const dynamic = 'force-dynamic';

// POST /api/purchase-contracts/[id]/complete-production
// 一键完成生产（将完工数量设为合同总数），并自动同步库存
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contractId } = await params;

    // 获取采购合同
    const contract = await prisma.purchaseContract.findUnique({
      where: { id: contractId },
      include: {
        items: true,
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "采购合同不存在" }, { status: 404 });
    }

    // 获取受影响的 variantId 列表
    const affectedVariantIds: string[] = [];

    // 更新每个 item 的 finishedQty 为合同数量
    for (const item of contract.items) {
      if (item.variantId) {
        await prisma.purchaseContractItem.update({
          where: { id: item.id },
          data: { finishedQty: item.qty },
        });

        if (item.variantId && !affectedVariantIds.includes(item.variantId)) {
          affectedVariantIds.push(item.variantId);
        }
      }
    }

    // 自动同步库存到 ProductVariant
    for (const variantId of affectedVariantIds) {
      await syncProductVariantInventory(variantId);
    }

    return NextResponse.json({ success: true, message: "生产已完成，库存已同步" });
  } catch (error: any) {
    console.error("完成生产失败:", error);
    return NextResponse.json({ error: error.message || "操作失败" }, { status: 500 });
  }
}
