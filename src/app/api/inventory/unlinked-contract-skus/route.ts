import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PurchaseContractStatus } from "@prisma/client";
import { resolveVariantIdForContractSku } from "@/lib/resolve-variant-by-contract-sku";

export const dynamic = "force-dynamic";

/**
 * 采购合同明细中 variantId 为空、或产品与合同 SKU 未对齐的明细（用于库存页排查「合同有货但列表无 SKU」）
 */
export async function GET() {
  try {
    const items = await prisma.purchaseContractItem.findMany({
      where: {
        variantId: null,
        contract: {
          status: { not: PurchaseContractStatus.CANCELLED },
        },
      },
      select: {
        id: true,
        sku: true,
        skuName: true,
        qty: true,
        pickedQty: true,
        finishedQty: true,
        contract: {
          select: { id: true, contractNumber: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const enriched = await Promise.all(
      items.map(async (row) => {
        const resolved = await resolveVariantIdForContractSku(row.sku);
        return {
          itemId: row.id,
          sku: row.sku,
          skuName: row.skuName,
          qty: row.qty,
          pickedQty: row.pickedQty,
          finishedQty: row.finishedQty,
          contractId: row.contract.id,
          contractNumber: row.contract.contractNumber,
          canAutoLink: Boolean(resolved),
          suggestedVariantId: resolved?.variantId ?? null,
          suggestedCatalogSkuId: resolved?.catalogSkuId ?? null,
        };
      })
    );

    return NextResponse.json({
      count: enriched.length,
      items: enriched,
      hint:
        "库存列表只展示「产品档案」里的 ProductVariant。合同明细若未绑定 variantId（创建时 sku 与档案 skuId 不完全一致），此处会列出；可在产品档案补建 SKU 后点击下方「自动补绑」。",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
