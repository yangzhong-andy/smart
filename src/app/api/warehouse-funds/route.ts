import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const warehouseId = String(searchParams.get("warehouseId") || "").trim();
  const currency = String(searchParams.get("currency") || "").trim().toUpperCase();
  const platform = String(searchParams.get("platform") || "").trim().toUpperCase();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize")) || 20));

  const accountWhere = {
    ...(warehouseId ? { warehouseId } : {}),
    ...(currency ? { currency } : {}),
  };
  const entryWhere = {
    ...(warehouseId ? { warehouseId } : {}),
    ...(currency ? { currency } : {}),
    ...(platform ? { platform } : {}),
  };
  const [accounts, entries, total] = await prisma.$transaction([
    prisma.warehouseFundAccount.findMany({
      where: accountWhere,
      include: { warehouse: { select: { id: true, code: true, name: true } } },
      orderBy: [{ warehouse: { name: "asc" } }, { currency: "asc" }],
    }),
    prisma.warehouseFundEntry.findMany({
      where: entryWhere,
      include: { warehouse: { select: { code: true, name: true } } },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.warehouseFundEntry.count({ where: entryWhere }),
  ]);

  return NextResponse.json({
    accounts: accounts.map((account) => ({
      id: account.id,
      warehouseId: account.warehouseId,
      warehouseCode: account.warehouse.code,
      warehouseName: account.warehouse.name,
      currency: account.currency,
      totalCredit: Number(account.totalCredit),
      totalDebit: Number(account.totalDebit),
      balance: Number(account.balance),
      updatedAt: account.updatedAt.toISOString(),
    })),
    entries: entries.map((entry) => ({
      id: entry.id,
      warehouseId: entry.warehouseId,
      warehouseCode: entry.warehouse.code,
      warehouseName: entry.warehouse.name,
      currency: entry.currency,
      entryType: entry.entryType,
      amount: Number(entry.amount),
      balanceBefore: Number(entry.balanceBefore),
      balanceAfter: Number(entry.balanceAfter),
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      orderId: entry.orderId,
      platform: entry.platform || (
        entry.sourceType === "PROFIT_ORDER_FULFILLMENT"
        || entry.sourceType === "PROFIT_ORDER_FULFILLMENT_REVERSAL"
          ? "TIKTOK"
          : null
      ),
      shopId: entry.shopId,
      shopName: entry.shopName,
      countryCode: entry.countryCode,
      notes: entry.notes,
      details: entry.details,
      occurredAt: entry.occurredAt.toISOString(),
      createdBy: entry.createdBy,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}
