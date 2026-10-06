import { NextResponse } from "next/server";
import { ContainerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * 货物资产统一口径：已绑柜、未确认到仓，且柜子已进入实际运输链路。
 * PLANNED 不算在途；到港/清关仍属于公司在途货物，直到正式确认入仓。
 */
export async function GET() {
  try {
    const items = await prisma.outboundBatchItem.findMany({
      where: {
        outboundBatch: {
          status: { not: "已取消" },
          arrivalConfirmedAt: null,
          containerId: { not: null },
          container: {
            status: {
              in: [
                ContainerStatus.LOADING,
                ContainerStatus.IN_TRANSIT,
                ContainerStatus.ARRIVED_PORT,
                ContainerStatus.CUSTOMS_CLEAR,
              ],
            },
          },
        },
      },
      select: {
        variantId: true,
        sku: true,
        skuName: true,
        qty: true,
        outboundBatchId: true,
        variant: {
          select: {
            skuId: true,
            product: { select: { name: true } },
          },
        },
      },
    });
    const skuMap = new Map<string, {
      variantId: string | null;
      skuId: string;
      productName: string;
      quantity: number;
      batchIds: Set<string>;
    }>();
    for (const item of items) {
      const skuId = item.variant?.skuId || item.sku || "未识别 SKU";
      const key = item.variantId || skuId;
      const row = skuMap.get(key) || {
        variantId: item.variantId,
        skuId,
        productName: item.variant?.product.name || item.skuName || "未填写产品名称",
        quantity: 0,
        batchIds: new Set<string>(),
      };
      row.quantity += item.qty;
      row.batchIds.add(item.outboundBatchId);
      skuMap.set(key, row);
    }
    const skus = [...skuMap.values()]
      .map(({ batchIds, ...row }) => ({ ...row, batchCount: batchIds.size }))
      .sort((a, b) => b.quantity - a.quantity || a.skuId.localeCompare(b.skuId));
    return NextResponse.json({
      inTransitTotal: skus.reduce((sum, row) => sum + row.quantity, 0),
      skus,
      source: "ACTIVE_CONTAINER_TRANSIT",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
