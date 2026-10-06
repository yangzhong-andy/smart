import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { summarizeMercadoWalletBusinessEvents } from "@/lib/mercado-livre-wallet-sync";

export const dynamic = "force-dynamic";

function positiveInt(value: string | null, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function serializeTransaction(row: any) {
  return {
    ...row,
    netCreditAmount: Number(row.netCreditAmount || 0),
    netDebitAmount: Number(row.netDebitAmount || 0),
    grossAmount: row.grossAmount == null ? null : Number(row.grossAmount),
    sellerAmount: row.sellerAmount == null ? null : Number(row.sellerAmount),
    marketplaceFeeAmount: row.marketplaceFeeAmount == null ? null : Number(row.marketplaceFeeAmount),
    shippingFeeAmount: row.shippingFeeAmount == null ? null : Number(row.shippingFeeAmount),
    taxesAmount: row.taxesAmount == null ? null : Number(row.taxesAmount),
    couponAmount: row.couponAmount == null ? null : Number(row.couponAmount),
    balanceAmount: row.balanceAmount == null ? null : Number(row.balanceAmount),
    cashFlow: row.cashFlow ? { ...row.cashFlow, amount: Number(row.cashFlow.amount || 0) } : null,
  };
}

type OrderReleaseSummaryRow = {
  paidOrderCount: number;
  paidOrderAmount: Prisma.Decimal;
  releasedOrderCount: number;
  releasedOrderGrossAmount: Prisma.Decimal;
  unreleasedOrderCount: number;
  unreleasedOrderGrossAmount: Prisma.Decimal;
};

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const params = request.nextUrl.searchParams;
  const page = positiveInt(params.get("page"), 1, 100_000);
  const pageSize = positiveInt(params.get("pageSize"), 50, 200);
  const accountId = params.get("accountId")?.trim() || undefined;
  const moneyFlow = params.get("moneyFlow")?.trim() || undefined;
  const businessType = params.get("businessType")?.trim() || undefined;
  const matchStatus = params.get("matchStatus")?.trim() || undefined;
  const keyword = params.get("keyword")?.trim() || undefined;

  const where: Prisma.MercadoLivreWalletTransactionWhereInput = {
    ...(accountId ? { accountId } : {}),
    ...(moneyFlow ? { moneyFlow } : {}),
    ...(businessType ? { businessType } : {}),
    ...(matchStatus ? { matchStatus } : {}),
    ...(keyword ? {
      OR: [
        { sourceId: { contains: keyword, mode: "insensitive" } },
        { externalReference: { contains: keyword, mode: "insensitive" } },
        { externalOrderId: { contains: keyword, mode: "insensitive" } },
        { orderMp: { contains: keyword, mode: "insensitive" } },
        { packId: { contains: keyword, mode: "insensitive" } },
        { payoutBankAccount: { contains: keyword, mode: "insensitive" } },
        { cashFlow: { is: { summary: { contains: keyword, mode: "insensitive" } } } },
      ],
    } : {}),
  };
  const summaryWhere: Prisma.MercadoLivreWalletTransactionWhereInput = accountId ? { accountId } : {};
  const orderAccountFilter = accountId ? Prisma.sql`AND o."accountId" = ${accountId}` : Prisma.empty;

  const [rows, total, accounts, reports, rawSummary, payoutCount, payoutMatched, payoutPending] = await prisma.$transaction([
    prisma.mercadoLivreWalletTransaction.findMany({
      where,
      select: {
        id: true,
        sourceId: true,
        externalReference: true,
        recordType: true,
        businessType: true,
        moneyFlow: true,
        netCreditAmount: true,
        netDebitAmount: true,
        grossAmount: true,
        sellerAmount: true,
        marketplaceFeeAmount: true,
        shippingFeeAmount: true,
        taxesAmount: true,
        couponAmount: true,
        balanceAmount: true,
        payoutBankAccount: true,
        paymentMethodType: true,
        transactionIntentId: true,
        externalOrderId: true,
        packId: true,
        orderMp: true,
        occurredAt: true,
        matchStatus: true,
        syncedAt: true,
        account: { select: { id: true, userId: true, nickname: true, currency: true, store: { select: { id: true, name: true } } } },
        report: { select: { fileName: true, beginAt: true, endAt: true, generatedAt: true } },
        cashFlow: { select: { id: true, date: true, summary: true, amount: true, currency: true, accountName: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mercadoLivreWalletTransaction.count({ where }),
    prisma.mercadoLivreAccount.findMany({
      where: { status: "active" },
      select: { id: true, userId: true, nickname: true, currency: true, store: { select: { id: true, name: true } }, _count: { select: { walletTransactions: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.mercadoLivreWalletReport.findMany({
      where: accountId ? { accountId } : {},
      select: { id: true, accountId: true, fileName: true, status: true, beginAt: true, endAt: true, generatedAt: true, rowCount: true, syncedAt: true },
      orderBy: [{ generatedAt: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),
    prisma.mercadoLivreWalletTransaction.aggregate({ where: summaryWhere, _sum: { netCreditAmount: true, netDebitAmount: true }, _count: true }),
    prisma.mercadoLivreWalletTransaction.count({ where: { ...summaryWhere, businessType: "BANK_PAYOUT" } }),
    prisma.mercadoLivreWalletTransaction.count({ where: { ...summaryWhere, businessType: "BANK_PAYOUT", matchStatus: "MATCHED_EXISTING_CASH_FLOW" } }),
    prisma.mercadoLivreWalletTransaction.count({ where: { ...summaryWhere, businessType: "BANK_PAYOUT", matchStatus: { not: "MATCHED_EXISTING_CASH_FLOW" } } }),
  ]);

  const [payoutSum, sourceEventGroups, unkeyedEvents, orderReleaseGroups, orderSummaryRows, latestBalances] = await Promise.all([
    prisma.mercadoLivreWalletTransaction.aggregate({
      where: { ...summaryWhere, businessType: "BANK_PAYOUT" },
      _sum: { netDebitAmount: true },
    }),
    prisma.mercadoLivreWalletTransaction.groupBy({
      by: ["accountId", "sourceId"],
      where: { ...summaryWhere, sourceId: { not: null } },
      _sum: { netCreditAmount: true, netDebitAmount: true },
    }),
    prisma.mercadoLivreWalletTransaction.findMany({
      where: { ...summaryWhere, sourceId: null },
      select: { netCreditAmount: true, netDebitAmount: true },
    }),
    prisma.mercadoLivreWalletTransaction.groupBy({
      by: ["accountId", "sourceId"],
      where: { ...summaryWhere, businessType: "ORDER_RELEASE" },
      _sum: { netCreditAmount: true, netDebitAmount: true },
    }),
    prisma.$queryRaw<OrderReleaseSummaryRow[]>(Prisma.sql`
      WITH paid_orders AS (
        SELECT o."accountId", o."externalOrderId", o."packId", o."paidAmount", o."rawData"::jsonb AS "rawData"
        FROM "MercadoLivreOrder" o
        WHERE o."status" = 'paid' ${orderAccountFilter}
      ),
      released_orders AS (
        SELECT DISTINCT o."accountId", o."externalOrderId"
        FROM paid_orders o
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o."rawData"->'payments', '[]'::jsonb)) payment(value)
        JOIN "MercadoLivreWalletTransaction" t
          ON t."accountId" = o."accountId"
         AND t."sourceId" = payment.value->>'id'
        UNION
        SELECT DISTINCT o."accountId", o."externalOrderId"
        FROM paid_orders o
        JOIN "MercadoLivreWalletTransaction" t
          ON t."accountId" = o."accountId"
         AND t."businessType" = 'ORDER_RELEASE'
         AND (
           t."externalOrderId" = o."externalOrderId"
           OR t."orderMp" = o."externalOrderId"
           OR (o."packId" IS NOT NULL AND t."packId" = o."packId")
         )
      )
      SELECT
        count(*)::int AS "paidOrderCount",
        COALESCE(sum(o."paidAmount"), 0) AS "paidOrderAmount",
        count(*) FILTER (WHERE released."externalOrderId" IS NOT NULL)::int AS "releasedOrderCount",
        COALESCE(sum(o."paidAmount") FILTER (WHERE released."externalOrderId" IS NOT NULL), 0) AS "releasedOrderGrossAmount",
        count(*) FILTER (WHERE released."externalOrderId" IS NULL)::int AS "unreleasedOrderCount",
        COALESCE(sum(o."paidAmount") FILTER (WHERE released."externalOrderId" IS NULL), 0) AS "unreleasedOrderGrossAmount"
      FROM paid_orders o
      LEFT JOIN released_orders released
        ON released."accountId" = o."accountId"
       AND released."externalOrderId" = o."externalOrderId"
    `),
    Promise.all(
      accounts
        .filter((account) => !accountId || account.id === accountId)
        .map((account) => prisma.mercadoLivreWalletTransaction.findFirst({
          where: { accountId: account.id, balanceAmount: { not: null } },
          select: { balanceAmount: true, occurredAt: true },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        })),
    ),
  ]);
  const eventSummary = summarizeMercadoWalletBusinessEvents([
    ...sourceEventGroups.map((group) => ({
      credit: group._sum.netCreditAmount,
      debit: group._sum.netDebitAmount,
    })),
    ...unkeyedEvents.map((row) => ({ credit: row.netCreditAmount, debit: row.netDebitAmount })),
  ]);
  const releaseSummary = summarizeMercadoWalletBusinessEvents(orderReleaseGroups.map((group) => ({
    credit: group._sum.netCreditAmount,
    debit: group._sum.netDebitAmount,
  })));
  const orderSummary = orderSummaryRows[0];
  const balanceRows = latestBalances.filter((row): row is NonNullable<typeof row> => Boolean(row));
  const currentBalance = balanceRows.reduce((sum, row) => sum + Number(row.balanceAmount || 0), 0);
  const balanceAsOf = balanceRows.reduce<Date | null>(
    (latest, row) => !latest || row.occurredAt > latest ? row.occurredAt : latest,
    null,
  );

  return NextResponse.json({
    data: rows.map(serializeTransaction),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    accounts: accounts.map((account) => ({ ...account, transactionCount: account._count.walletTransactions, _count: undefined })),
    reports,
    summary: {
      transactionCount: rawSummary._count,
      businessEventCount: eventSummary.businessEventCount,
      inflow: eventSummary.inflow,
      outflow: eventSummary.outflow,
      currentBalance,
      balanceAsOf,
      payoutCount,
      payoutAmount: Number(payoutSum._sum.netDebitAmount || 0),
      payoutMatched,
      payoutPending,
    },
    orderRelease: {
      paidOrderCount: Number(orderSummary?.paidOrderCount || 0),
      paidOrderAmount: Number(orderSummary?.paidOrderAmount || 0),
      releasedOrderCount: Number(orderSummary?.releasedOrderCount || 0),
      releasedOrderGrossAmount: Number(orderSummary?.releasedOrderGrossAmount || 0),
      unreleasedOrderCount: Number(orderSummary?.unreleasedOrderCount || 0),
      unreleasedOrderGrossAmount: Number(orderSummary?.unreleasedOrderGrossAmount || 0),
      releasedNetAmount: releaseSummary.inflow - releaseSummary.outflow,
      pendingBalanceAvailable: false,
    },
    policy: {
      platformWalletSeparated: true,
      companyCashFlowCreatedAutomatically: false,
      description: "订单资金释放后自动进入已绑定的美克多 PAGO 钱包账户；银行提款仍按实际到账单独核销，避免重复入账。",
    },
  });
}
