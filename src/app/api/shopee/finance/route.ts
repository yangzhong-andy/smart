import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function positiveInt(value: string | null, fallback: number, max: number) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback; }
function brazilDate(value: string | null, end = false) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}-03:00`); return Number.isNaN(date.getTime()) ? null : date; }

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request); if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams; const page = positiveInt(params.get("page"), 1, 100_000); const pageSize = positiveInt(params.get("pageSize"), 20, 100);
  const shopId = params.get("shopId")?.trim() || undefined; const keyword = params.get("keyword")?.trim() || undefined; const start = brazilDate(params.get("startDate")); const end = brazilDate(params.get("endDate"), true);
  const orderFilter: Prisma.ShopeeOrderWhereInput = { ...(start || end ? { createTime: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}) };
  const where: Prisma.ShopeeSettlementWhereInput = {
    ...(shopId ? { shopId } : {}),
    ...(keyword ? { OR: [{ orderSn: { contains: keyword, mode: "insensitive" } }, { order: { buyerUsername: { contains: keyword, mode: "insensitive" } } }] } : {}),
    ...(start || end ? { order: orderFilter } : {}),
  };
  const pendingWhere: Prisma.ShopeeOrderWhereInput = { status: "COMPLETED", settlement: null, ...(shopId ? { shopId } : {}), ...orderFilter };
  const [rows, total, pending, totals, shops] = await prisma.$transaction([
    prisma.shopeeSettlement.findMany({ where, include: { order: { select: { status: true, totalAmount: true, buyerUsername: true, createTime: true, updateTime: true } }, shopSetting: { select: { shopName: true, region: true } } }, orderBy: [{ order: { createTime: "desc" } }, { orderSn: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.shopeeSettlement.count({ where }),
    prisma.shopeeOrder.count({ where: pendingWhere }),
    prisma.shopeeSettlement.aggregate({ where, _sum: { buyerTotalAmount: true, commissionFee: true, serviceFee: true, sellerTransactionFee: true, amsCommissionFee: true, adsEscrowFee: true, campaignFee: true, finalShippingFee: true, sellerReturnRefund: true, withholdingTax: true, escrowAmountAfterAdjust: true } }),
    prisma.shopeeShopSetting.findMany({ where: { status: "active" }, select: { shopId: true, shopName: true, region: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return NextResponse.json({ data: rows, total, pending, page, pageSize, totals: totals._sum, shops });
}
