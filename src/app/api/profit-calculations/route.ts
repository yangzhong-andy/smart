import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET() {
  try {
    const rows = await prisma.profitCalculation.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        product: {
          select: { skuId: true },
        },
      },
    });

    return NextResponse.json(
      rows.map((row) => {
        const salePriceBrl = Number(row.salePriceBrl);
        const exchangeRate = Number(row.exchangeRate);
        const qty = row.quantity;
        // 与测算页一致：营业额(CNY) = 有效售价(BRL)×件数×汇率
        const grossRevenueCny = salePriceBrl * qty * exchangeRate;
        return {
          id: row.id,
          productId: row.productId,
          productName: row.productName,
          skuId: row.product?.skuId ?? null,
          purchaseCostCny: Number(row.purchaseCostCny),
          weightKg: row.weightKg == null ? null : Number(row.weightKg),
          firstLegShippingCny: Number(row.firstLegShippingCny),
          adCostCny: Number(row.adCostCny),
          salePriceBrl,
          exchangeRate,
          quantity: qty,
          shippingMode: row.shippingMode,
          isCommissionFree: row.isCommissionFree,
          warehouseFeeBrl: Number(row.warehouseFeeBrl),
          targetRoi: row.targetRoi == null ? null : Number(row.targetRoi),
          settlementBrl: Number(row.settlementBrl),
          grossRevenueCny,
          netProfitCny: Number(row.netProfitCny),
          roi: Number(row.roi),
          breakEvenRoi: Number(row.breakEvenRoi),
          expectedProfitCny: row.expectedProfitCny == null ? null : Number(row.expectedProfitCny),
          createdAt: row.createdAt.toISOString(),
        };
      })
    );
  } catch (error) {
    return serverError("获取利润测算历史失败", error, { includeDetailsInDev: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const productName = String(body.productName || "").trim();

    if (!productName) {
      return badRequest("商品名称不能为空");
    }

    const created = await prisma.profitCalculation.create({
      data: {
        productId: body.productId || null,
        productName,
        purchaseCostCny: toNum(body.purchaseCostCny),
        weightKg: body.weightKg == null || body.weightKg === "" ? null : toNum(body.weightKg),
        firstLegShippingCny: toNum(body.firstLegShippingCny),
        adCostCny: toNum(body.adCostCny),
        salePriceBrl: toNum(body.salePriceBrl),
        exchangeRate: toNum(body.exchangeRate, 1.35),
        quantity: Math.max(1, Math.trunc(toNum(body.quantity, 1))),
        shippingMode: body.shippingMode === "WAREHOUSE_3PL" ? "WAREHOUSE_3PL" : "SFP",
        isCommissionFree: Boolean(body.isCommissionFree),
        warehouseFeeBrl: toNum(body.warehouseFeeBrl),
        targetRoi: body.targetRoi == null || body.targetRoi === "" ? null : toNum(body.targetRoi),
        settlementBrl: toNum(body.settlementBrl),
        netProfitCny: toNum(body.netProfitCny),
        roi: toNum(body.roi),
        breakEvenRoi: toNum(body.breakEvenRoi),
        expectedProfitCny: body.expectedProfitCny == null || body.expectedProfitCny === "" ? null : toNum(body.expectedProfitCny),
      },
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    return serverError("保存利润测算失败", error, { includeDetailsInDev: true });
  }
}
