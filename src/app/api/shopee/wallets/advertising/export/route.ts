import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "OFFICIAL_AD_TOPUP_IN",
  "AUTO_TOPUP",
  "INTERNAL_TRANSFER_IN",
  "BANK_FUNDING_IN",
  "OFFICIAL_AD_SPEND_OUT",
  "OFFICIAL_AD_SPEND_ADJUSTMENT",
  "ORDER_AUTO_TOPUP_IN",
  "ORDER_AUTO_TOPUP_ADJUSTMENT",
  "OFFICIAL_AD_CREDIT_IN",
  "OPENING_BALANCE",
  "MANUAL_ADJUSTMENT",
]);

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[\",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function dateText(value: Date | null | undefined) {
  return value ? value.toISOString() : "";
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const shopSettingId = params.get("shopSettingId")?.trim() || "";
  const keyword = params.get("keyword")?.trim().slice(0, 100) || "";
  const moneyFlow = params.get("moneyFlow")?.trim().toUpperCase() || "";
  const requestedType = params.get("entryType")?.trim().toUpperCase() || "";
  const entryType = ALLOWED_TYPES.has(requestedType) ? requestedType : "";

  const where: Prisma.ShopeeWalletEntryWhereInput = {
    wallet: {
      walletType: "ADVERTISING",
      ...(shopSettingId ? { shopSettingId } : {}),
    },
    ...(moneyFlow === "MONEY_IN" ? { amount: { gt: 0 } } : {}),
    ...(moneyFlow === "MONEY_OUT" ? { amount: { lt: 0 } } : {}),
    ...(entryType ? { entryType } : {}),
    ...(keyword ? {
      OR: [
        { relatedOrderSn: { contains: keyword, mode: "insensitive" } },
        { sourceId: { contains: keyword, mode: "insensitive" } },
        { notes: { contains: keyword, mode: "insensitive" } },
        { createdBy: { contains: keyword, mode: "insensitive" } },
        { bankAccount: { name: { contains: keyword, mode: "insensitive" } } },
        { wallet: { name: { contains: keyword, mode: "insensitive" } } },
        { wallet: { shopSetting: { shopId: { contains: keyword, mode: "insensitive" } } } },
        { wallet: { shopSetting: { shopName: { contains: keyword, mode: "insensitive" } } } },
      ],
    } : {}),
  };

  const rows = await prisma.shopeeWalletEntry.findMany({
    where,
    include: {
      wallet: { select: { name: true, currency: true, shopSetting: { select: { shopId: true, shopName: true } } } },
      bankAccount: { select: { name: true, accountNumber: true } },
      cashFlow: { select: { summary: true, amount: true, currency: true } },
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 100_000,
  });

  const header = [
    "发生时间（UTC）",
    "发生时间（巴西）",
    "店铺",
    "广告钱包",
    "业务类型",
    "收支",
    "金额",
    "变动前余额",
    "变动后余额",
    "关联订单",
    "来源流水号",
    "公司账户",
    "公司流水",
    "备注",
    "记录人",
  ];
  const body = rows.map((row) => [
    dateText(row.occurredAt),
    row.occurredAt.toLocaleString("zh-CN", { timeZone: "America/Sao_Paulo", hour12: false }),
    row.wallet.shopSetting.shopName || row.wallet.shopSetting.shopId,
    row.wallet.name,
    row.entryType,
    Number(row.amount) >= 0 ? "收入" : "支出",
    Number(row.amount).toFixed(2),
    Number(row.balanceBefore).toFixed(2),
    Number(row.balanceAfter).toFixed(2),
    row.relatedOrderSn,
    row.sourceId,
    row.bankAccount ? `${row.bankAccount.name}${row.bankAccount.accountNumber ? ` · ${row.bankAccount.accountNumber}` : ""}` : "",
    row.cashFlow ? `${row.cashFlow.summary} · ${Number(row.cashFlow.amount).toFixed(2)} ${row.cashFlow.currency}` : "",
    row.notes,
    row.createdBy,
  ].map(csvCell).join(","));
  const csv = `\uFEFF${[header.map(csvCell).join(","), ...body].join("\r\n")}\r\n`;
  const filename = `shopee-advertising-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
