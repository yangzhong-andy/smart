import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_ROWS = 100_000;

function parseAmount(s: string | null | undefined): number {
  if (s == null || String(s).trim() === "") return 0;
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId") ?? undefined;
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;

    const where: { type: string; storeId?: string; statementDate?: { gte?: string; lte?: string } } = {
      type: "Order",
    };
    if (storeId) where.storeId = storeId;
    if (startDate || endDate) {
      where.statementDate = {};
      if (startDate) where.statementDate.gte = startDate;
      if (endDate) where.statementDate.lte = endDate;
    }

    const rows = await prisma.storeOrderSettlement.findMany({
      where,
      select: {
        statementDate: true,
        storeId: true,
        totalSettlementAmount: true,
        netSales: true,
        grossSales: true,
        sellerDiscount: true,
        quantity: true,
        productName: true,
        skuName: true,
      },
      orderBy: { statementDate: "asc" },
      take: MAX_ROWS,
    });

    // 汇总
    let totalSettlement = 0;
    let totalNetSales = 0;
    let orderCount = 0;
    const byDate: Record<string, { count: number; settlement: number; netSales: number }> = {};
    const byStore: Record<string, { count: number; settlement: number; netSales: number }> = {};
    const productKeyToRow: Record<
      string,
      { productName: string; skuName: string | null; quantity: number; settlement: number; netSales: number }
    > = {};

    for (const r of rows) {
      const settlement = parseAmount(r.totalSettlementAmount);
      // 净销售：优先用 netSales，为空/0 时用 grossSales + sellerDiscount 推算（TikTok 结算单常见关系）
      let netSales = parseAmount(r.netSales);
      if (netSales === 0) {
        const gross = parseAmount(r.grossSales);
        const discount = parseAmount(r.sellerDiscount);
        if (gross !== 0 || discount !== 0) netSales = gross + discount;
      }
      const qty = Number(r.quantity) || 0;

      totalSettlement += settlement;
      totalNetSales += netSales;
      orderCount += 1;

      const date = r.statementDate || "";
      if (!byDate[date]) byDate[date] = { count: 0, settlement: 0, netSales: 0 };
      byDate[date].count += 1;
      byDate[date].settlement += settlement;
      byDate[date].netSales += netSales;

      const sid = r.storeId ?? "_unknown_";
      if (!byStore[sid]) byStore[sid] = { count: 0, settlement: 0, netSales: 0 };
      byStore[sid].count += 1;
      byStore[sid].settlement += settlement;
      byStore[sid].netSales += netSales;

      const pkey = `${r.productName ?? ""}\t${r.skuName ?? ""}`;
      if (!productKeyToRow[pkey]) {
        productKeyToRow[pkey] = {
          productName: r.productName ?? "",
          skuName: r.skuName ?? null,
          quantity: 0,
          settlement: 0,
          netSales: 0,
        };
      }
      productKeyToRow[pkey].quantity += qty;
      productKeyToRow[pkey].settlement += settlement;
      productKeyToRow[pkey].netSales += netSales;
    }

    const byStatementDate = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    const byStoreList = Object.entries(byStore).map(([storeId, v]) => ({ storeId, ...v }));

    const topProducts = Object.values(productKeyToRow)
      .sort((a, b) => b.settlement - a.settlement)
      .slice(0, 20);

    return NextResponse.json({
      summary: {
        totalRecords: orderCount,
        totalSettlementAmount: totalSettlement,
        totalNetSales,
      },
      byStatementDate,
      byStore: byStoreList,
      topProducts,
    });
  } catch (e) {
    console.error("store-order-settlement dashboard error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Dashboard failed" },
      { status: 500 }
    );
  }
}
