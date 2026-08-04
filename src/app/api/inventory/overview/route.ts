import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  aggregateInventoryTotals,
  type ProductInventoryFields,
} from "@/lib/inventory-display";
import { sumOverseasQtyByVariantIds } from "@/lib/overseas-stock";

export const dynamic = "force-dynamic";

/**
 * 库存总览：与库存查询页同一套件数/金额公式，但从数据库全量变体汇总；
 * 另返回采购合同明细的累计拿货/下单/完工，便于与「当前在库」对照。
 */
export async function GET() {
  try {
    const [variants, pickedAgg, qtyAgg, finishedAgg] = await Promise.all([
      prisma.productVariant.findMany({
        select: {
          id: true,
          atFactory: true,
          atDomestic: true,
          inTransit: true,
          stockQuantity: true,
          costPrice: true,
          currency: true,
        },
      }),
      prisma.purchaseContractItem.aggregate({ _sum: { pickedQty: true } }),
      prisma.purchaseContractItem.aggregate({ _sum: { qty: true } }),
      prisma.purchaseContractItem.aggregate({ _sum: { finishedQty: true } }),
    ]);

    const overseasMap = await sumOverseasQtyByVariantIds(variants.map((v) => v.id));

    const products: ProductInventoryFields[] = variants.map((v) => ({
      at_factory: v.atFactory,
      at_domestic: v.atDomestic,
      in_transit: v.inTransit,
      at_overseas: overseasMap.get(v.id) ?? 0,
      stock_quantity: v.stockQuantity,
      cost_price: v.costPrice != null ? Number(v.costPrice) : 0,
      currency: v.currency ?? "CNY",
    }));

    const totals = aggregateInventoryTotals(products);

    return NextResponse.json({
      ...totals,
      contractPickedQtySum: Number(pickedAgg._sum.pickedQty ?? 0),
      contractOrderQtySum: Number(qtyAgg._sum.qty ?? 0),
      contractFinishedQtySum: Number(finishedAgg._sum.finishedQty ?? 0),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
