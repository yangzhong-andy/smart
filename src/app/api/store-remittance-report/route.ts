import { NextRequest, NextResponse } from "next/server";
import { CashFlowType, Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buildStoreRemittanceReport, isValidRemittanceDate } from "@/lib/store-remittance-report";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || null;
  const endDate = searchParams.get("endDate") || null;
  if ((startDate && !isValidRemittanceDate(startDate)) || (endDate && !isValidRemittanceDate(endDate))) {
    return NextResponse.json({ error: "日期格式无效，请使用有效的 YYYY-MM-DD 日期" }, { status: 400 });
  }
  if (startDate && endDate && startDate > endDate) {
    return NextResponse.json({ error: "开始日期不能晚于结束日期" }, { status: 400 });
  }

  try {
    // Read the complete lightweight ledger in one consistent snapshot. No date filter or
    // pagination belongs here: period filters must not truncate lifetime/month/trend totals.
    // Every selected column is explicit; voucher/base64 content is never selected.
    const [stores, accountLinks, flows] = await prisma.$transaction([
      prisma.store.findMany({
        select: { id: true, name: true, platform: true, country: true, currency: true, accountId: true, accountName: true },
        orderBy: { name: "asc" },
      }),
      prisma.bankAccount.findMany({ select: { id: true, storeId: true } }),
      prisma.cashFlow.findMany({
        // Include reversals of any type so even a legacy correction cancels its original.
        where: { OR: [{ type: CashFlowType.INCOME }, { isReversal: true }] },
        select: {
          id: true, type: true, status: true, category: true, date: true, amount: true,
          currency: true, exchangeRate: true, accountId: true, storeId: true,
          isReversal: true, reversedById: true,
        },
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    const report = buildStoreRemittanceReport(stores, flows, { startDate, endDate, accountLinks });
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[store-remittance-report] report failed", error);
    return NextResponse.json({ error: "店铺回款统计加载失败，请稍后重试" }, { status: 500 });
  }
}
