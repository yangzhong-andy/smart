import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const deliveryOrderId = new URL(request.url).searchParams.get("deliveryOrderId");
    if (!deliveryOrderId) {
      return NextResponse.json({ error: "请选择拿货单" }, { status: 400 });
    }

    const order = await prisma.deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      include: {
        contract: {
          include: {
            supplier: true,
            items: {
              include: { variant: { include: { product: true } } },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
        exportTaxCases: {
          where: { status: { not: "CANCELLED" } },
          select: { items: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "拿货单不存在" }, { status: 404 });
    }

    const qtyMap = order.itemQtys && typeof order.itemQtys === "object" && !Array.isArray(order.itemQtys)
      ? order.itemQtys as Record<string, unknown>
      : null;
    const firstItemId = order.contract.items[0]?.id;
    const used = new Map<string, { invoice: number; refund: number }>();

    for (const taxCase of order.exportTaxCases) {
      for (const item of taxCase.items) {
        const current = used.get(item.contractItemId) || { invoice: 0, refund: 0 };
        if (item.needsInvoice) current.invoice += item.qty;
        if (item.needsTaxRefund) current.refund += item.qty;
        used.set(item.contractItemId, current);
      }
    }

    const items = order.contract.items.map((item) => {
      const deliveryQty = qtyMap
        ? Math.max(0, Math.trunc(Number(qtyMap[item.id]) || 0))
        : order.contract.items.length === 1 || item.id === firstItemId
          ? order.qty
          : 0;
      const itemUsed = used.get(item.id) || { invoice: 0, refund: 0 };
      return {
        contractItemId: item.id,
        sku: item.variant?.skuId || item.sku,
        skuName: item.skuName || item.variant?.product?.name || undefined,
        spec: item.spec || undefined,
        customsName: item.variant?.product?.customsNameCN || undefined,
        purchaseUnitPrice: Number(item.unitPrice),
        deliveryQty,
        invoiceUsedQty: itemUsed.invoice,
        refundUsedQty: itemUsed.refund,
        invoiceAvailableQty: Math.max(0, deliveryQty - itemUsed.invoice),
        refundAvailableQty: Math.max(0, deliveryQty - itemUsed.refund),
      };
    }).filter((item) => item.deliveryQty > 0);

    return NextResponse.json({
      deliveryOrder: {
        id: order.id,
        deliveryNumber: order.deliveryNumber,
        contractId: order.contractId,
        contractNumber: order.contractNumber,
        supplierId: order.contract.supplierId || undefined,
        supplierName: order.contract.supplierName,
        defaultTaxPointRate: order.contract.supplier?.invoicePoint == null
          ? undefined
          : Number(order.contract.supplier.invoicePoint),
      },
      items,
    });
  } catch (error) {
    console.error("获取拿货单退税来源失败:", error);
    return NextResponse.json({ error: "获取拿货单货品失败" }, { status: 500 });
  }
}
