import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { businessDateUtcRange } from "@/lib/order-business-time";

export const dynamic = "force-dynamic";

function positiveInt(value: string | null, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const params = request.nextUrl.searchParams;
  const page = positiveInt(params.get("page"), 1, 100_000);
  const pageSize = positiveInt(params.get("pageSize"), 20, 100);
  const accountId = params.get("accountId")?.trim() || undefined;
  const status = params.get("status")?.trim() || undefined;
  const keyword = params.get("keyword")?.trim() || undefined;
  const startDate = params.get("startDate")?.trim() || undefined;
  const endDate = params.get("endDate")?.trim() || undefined;
  const baseWhere: Prisma.MercadoLivreOrderWhereInput = {
    ...(accountId ? { accountId } : {}),
    ...(startDate || endDate ? { dateCreated: businessDateUtcRange(startDate, endDate, "BR") } : {}),
    ...(keyword ? {
      OR: [
        { externalOrderId: { contains: keyword, mode: "insensitive" } },
        { buyerNickname: { contains: keyword, mode: "insensitive" } },
        { shippingId: { contains: keyword, mode: "insensitive" } },
        { items: { some: { OR: [{ sellerSku: { contains: keyword, mode: "insensitive" } }, { title: { contains: keyword, mode: "insensitive" } }] } } },
      ],
    } : {}),
  };
  const where: Prisma.MercadoLivreOrderWhereInput = {
    ...baseWhere,
    ...(status ? { status } : {}),
  };
  const [orders, total, baseTotal, accounts, statusGroups] = await prisma.$transaction([
    prisma.mercadoLivreOrder.findMany({
      where,
      select: {
        id: true,
        externalOrderId: true,
        status: true,
        substatus: true,
        currency: true,
        totalAmount: true,
        paidAmount: true,
        buyerNickname: true,
        shippingId: true,
        packId: true,
        dateCreated: true,
        lastUpdated: true,
        items: {
          select: {
            id: true,
            sellerSku: true,
            title: true,
            quantity: true,
            unitPrice: true,
          },
          orderBy: { title: "asc" },
        },
        account: { select: { userId: true, nickname: true, currency: true } },
      },
      orderBy: [{ dateCreated: "desc" }, { externalOrderId: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mercadoLivreOrder.count({ where }),
    prisma.mercadoLivreOrder.count({ where: baseWhere }),
    prisma.mercadoLivreAccount.findMany({
      where: { status: "active" },
      select: { id: true, userId: true, nickname: true, currency: true, lastSyncAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.mercadoLivreOrder.groupBy({ by: ["status"], where: baseWhere, _count: true, orderBy: { status: "asc" } }),
  ]);
  return NextResponse.json({
    data: orders,
    total,
    baseTotal,
    page,
    pageSize,
    accounts,
    statusCounts: Object.fromEntries(statusGroups.map((group) => [group.status || "UNKNOWN", group._count])),
  });
}
