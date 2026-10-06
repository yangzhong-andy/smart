import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withFreshMercadoLivreToken } from "@/lib/mercado-livre-token-service";
import { resolveCashFlowExchangeRateToCny } from "@/lib/cash-flow-exchange-rate";
import { clearCacheByPrefix } from "@/lib/redis";

const MERCADO_PAGO_API = "https://api.mercadopago.com";
const REPORT_PATH = "/v1/account/release_report";
const REPORT_CONFIG_PATH = `${REPORT_PATH}/config`;
const REPORT_LIST_PATH = `${REPORT_PATH}/list`;

type ReportListItem = {
  id?: number | string;
  report_id?: number | string | null;
  file_name?: string | null;
  status?: string | null;
  begin_date?: string | null;
  end_date?: string | null;
  generation_date?: string | null;
  report_type?: string | null;
  sub_type?: string | null;
  [key: string]: unknown;
};

type ParsedReportRow = Record<string, string>;

export type MercadoWalletEventAmounts = {
  credit: number | string | Prisma.Decimal | null;
  debit: number | string | Prisma.Decimal | null;
};

type MercadoOrderReleaseRow = {
  id: string;
  reportId: string | null;
  transactionKey: string;
  sourceId: string | null;
  netCreditAmount: Prisma.Decimal;
  netDebitAmount: Prisma.Decimal;
  externalOrderId: string | null;
  orderMp: string | null;
  occurredAt: Date;
  cashFlowId: string | null;
};

const MERCADO_REPORT_OVERLAP_TIME_TOLERANCE_MS = 5_000;

export function aggregateMercadoOrderReleaseRows(rows: MercadoOrderReleaseRow[]) {
  const groups = new Map<string, MercadoOrderReleaseRow[]>();
  for (const row of rows) {
    const eventKey = row.sourceId || row.transactionKey;
    const eventRows = groups.get(eventKey) || [];
    eventRows.push(row);
    groups.set(eventKey, eventRows);
  }
  return [...groups].map(([eventKey, eventRows]) => {
    const occurrences: Array<{
      credit: number;
      debit: number;
      rows: Map<string, MercadoOrderReleaseRow[]>;
      timestamps: number[];
    }> = [];
    for (const row of eventRows) {
      const credit = Math.round(Number(row.netCreditAmount || 0) * 100);
      const debit = Math.round(Number(row.netDebitAmount || 0) * 100);
      // Overlapping reports can serialize the same official row a few seconds
      // apart. Match by source, amount and a small time tolerance; rows farther
      // apart remain separate legitimate components of the same transaction.
      const occurrence = occurrences.find((candidate) =>
        candidate.credit === credit
        && candidate.debit === debit
        && candidate.timestamps.some((timestamp) =>
          Math.abs(timestamp - row.occurredAt.getTime()) <= MERCADO_REPORT_OVERLAP_TIME_TOLERANCE_MS));
      const current = occurrence || {
        credit,
        debit,
        rows: new Map<string, MercadoOrderReleaseRow[]>(),
        timestamps: [],
      };
      if (!occurrence) occurrences.push(current);
      // Rows without a report cannot safely be identified as overlapping imports.
      const reportKey = row.reportId || `unlinked:${row.id}`;
      const reportRows = current.rows.get(reportKey) || [];
      reportRows.push(row);
      current.rows.set(reportKey, reportRows);
      current.timestamps.push(row.occurredAt.getTime());
    }
    // A report can legitimately contain identical rows. Keep the largest
    // multiplicity seen in one report, not the sum across overlapping reports.
    const uniqueRows = occurrences.flatMap(({ rows: byReport }) =>
      [...byReport.values()].reduce((largest, reportRows) =>
        reportRows.length > largest.length ? reportRows : largest, [] as MercadoOrderReleaseRow[]));
    const netCents = uniqueRows.reduce((sum, row) =>
      sum + Math.round((Number(row.netCreditAmount || 0) - Number(row.netDebitAmount || 0)) * 100), 0);
    const latest = uniqueRows.reduce((current, row) =>
      row.occurredAt > current.occurredAt ? row : current);
    return {
      eventKey,
      sourceId: eventRows[0].sourceId,
      latest,
      linked: eventRows.find((row) => row.cashFlowId) || null,
      missingIdentity: eventRows.some((row) => !row.sourceId || !row.reportId),
      duplicateRows: eventRows.length - uniqueRows.length,
      netAmount: netCents / 100,
    };
  });
}

export function requiresMercadoOrderReleaseReview(
  event: { duplicateRows: number; netAmount: number },
  existingAmount: number | string | Prisma.Decimal,
) {
  return event.duplicateRows > 0
    && Math.round(Number(existingAmount) * 100) !== Math.round(event.netAmount * 100);
}

// The release report also contains transfers, withdrawals and technical reversals.
// Only the platform's own overdue-invoice collection has this reference shape.
export function isMercadoInvoiceCollection(row: {
  sourceId?: string | null;
  externalReference?: string | null;
  paymentMethodType?: string | null;
  netCreditAmount?: number | string | Prisma.Decimal | null;
  netDebitAmount?: number | string | Prisma.Decimal | null;
  externalOrderId?: string | null;
  orderMp?: string | null;
  packId?: string | null;
  payoutBankAccount?: string | null;
}, userId: string) {
  return Boolean(
    row.sourceId
    && row.externalReference?.startsWith(`MELIPAYMENTS-COLLECTIONATTEMPT-${userId}-`)
    && row.paymentMethodType === "account_money"
    && Number(row.netDebitAmount || 0) > 0
    && Number(row.netCreditAmount || 0) === 0
    && !row.externalOrderId && !row.orderMp && !row.packId && !row.payoutBankAccount,
  );
}

export function verifiedMercadoInvoiceCategory(userId: string, sourceId: string, debit: number) {
  // Confirmed against the September invoice in the seller's own billing portal.
  if (userId === "3438348964" && sourceId === "000fpss5vb" && Math.round(debit * 100) === 142804) {
    return { category: "广告费/美克多广告", description: "2026年9月广告账单逾期自动扣款", reviewed: true };
  }
  return { category: "平台资金/待核对账单", description: "平台逾期账单自动扣款，费用组成待核对", reviewed: false };
}

export function summarizeMercadoWalletBusinessEvents(events: MercadoWalletEventAmounts[]) {
  const summary = events.reduce(
    (summary, event) => {
      const credit = Number(event.credit || 0);
      const debit = Number(event.debit || 0);
      const net = credit - debit;
      summary.businessEventCount += 1;
      if (net > 0) summary.inflow += net;
      if (net < 0) summary.outflow += Math.abs(net);
      return summary;
    },
    { businessEventCount: 0, inflow: 0, outflow: 0 },
  );
  return {
    ...summary,
    inflow: Math.round((summary.inflow + Number.EPSILON) * 100) / 100,
    outflow: Math.round((summary.outflow + Number.EPSILON) * 100) / 100,
  };
}

class MercadoPagoWalletError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MercadoPagoWalletError";
    this.status = status;
  }
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function date(value: unknown): Date | null {
  const valueText = text(value);
  if (!valueText) return null;
  const result = new Date(valueText);
  return Number.isNaN(result.getTime()) ? null : result;
}

function decimal(value: unknown): string | null {
  const valueText = text(value);
  if (!valueText) return null;
  const parsed = Number(valueText.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
}

function number(value: unknown): number {
  return Number(decimal(value) || 0);
}

function errorMessage(payload: any, fallback: string) {
  return String(payload?.message || payload?.error_description || payload?.error || fallback);
}

async function mercadoPagoJson<T>(
  accessToken: string,
  path: string,
  options?: { method?: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const response = await fetch(`${MERCADO_PAGO_API}${path}`, {
    method: options?.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new MercadoPagoWalletError(response.status, errorMessage(payload, `Mercado Pago 请求失败：${path}`));
  return payload as T;
}

async function mercadoPagoText(accessToken: string, path: string) {
  const response = await fetch(`${MERCADO_PAGO_API}${path}`, {
    headers: { Accept: "text/csv", Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.text();
  if (!response.ok) throw new MercadoPagoWalletError(response.status, payload || `Mercado Pago 文件下载失败：${path}`);
  return payload;
}

export function parseMercadoPagoReleaseCsv(input: string): { headers: string[]; rows: ParsedReportRow[] } {
  const parsed: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const content = input.replace(/^\uFEFF/, "");

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      parsed.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    parsed.push(row);
  }

  const headers = (parsed.shift() || []).map((value) => value.trim());
  const rows = parsed
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((key, index) => [key, values[index] || ""])));
  return { headers, rows };
}

function reportRowBaseHash(row: ParsedReportRow) {
  const normalized = Object.fromEntries(Object.keys(row).sort().map((key) => [key, row[key] || ""]));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function transactionKey(baseHash: string, occurrence: number) {
  return createHash("sha256").update(`${baseHash}:${occurrence}`).digest("hex");
}

function reportConfig(userId: string) {
  return {
    file_name_prefix: `smart-erp-mercado-${userId}`,
    include_withdrawal_at_end: true,
    execute_after_withdrawal: true,
    display_timezone: "GMT-03",
    notification_email_list: [],
    frequency: { hour: 0, type: "monthly", value: 1 },
    columns: [
      "DATE",
      "RECORD_TYPE",
      "SOURCE_ID",
      "EXTERNAL_REFERENCE",
      "ORDER_ID",
      "ORDER_MP",
      "PACK_ID",
      "GROSS_AMOUNT",
      "MP_FEE_AMOUNT",
      "SHIPPING_FEE_AMOUNT",
      "TAXES_AMOUNT",
      "COUPON_AMOUNT",
      "SELLER_AMOUNT",
      "NET_CREDIT_AMOUNT",
      "NET_DEBIT_AMOUNT",
      "BALANCE_AMOUNT",
      "PAYMENT_METHOD_TYPE",
      "PAYOUT_BANK_ACCOUNT_NUMBER",
      "TRANSACTION_APPROVAL_DATE",
      "TRANSACTION_INTENT_ID",
    ].map((key) => ({ key })),
  };
}

async function ensureReleaseReportConfig(accessToken: string, userId: string) {
  try {
    return await mercadoPagoJson<Record<string, unknown>>(accessToken, REPORT_CONFIG_PATH);
  } catch (error) {
    if (!(error instanceof MercadoPagoWalletError) || error.status !== 404 || !/configuration not found/i.test(error.message)) throw error;
    return mercadoPagoJson<Record<string, unknown>>(accessToken, REPORT_CONFIG_PATH, {
      method: "POST",
      body: reportConfig(userId),
    });
  }
}

async function requestHistoricalReport(accessToken: string, beginAt: Date, endAt: Date) {
  const clean = (value: Date) => value.toISOString().replace(".000Z", "Z");
  return mercadoPagoJson<ReportListItem>(accessToken, REPORT_PATH, {
    method: "POST",
    body: { begin_date: clean(beginAt), end_date: clean(endAt) },
  });
}

async function listReleaseReports(accessToken: string) {
  const payload = await mercadoPagoJson<unknown>(accessToken, REPORT_LIST_PATH);
  return Array.isArray(payload) ? payload as ReportListItem[] : [];
}

async function orderReferenceSets(accountId: string) {
  const orders = await prisma.mercadoLivreOrder.findMany({
    where: { accountId },
    select: { externalOrderId: true, packId: true, rawData: true },
  });
  const orderIds = new Set<string>();
  const packIds = new Set<string>();
  const paymentIds = new Set<string>();
  for (const order of orders) {
    orderIds.add(order.externalOrderId);
    if (order.packId) packIds.add(order.packId);
    const raw = order.rawData as any;
    for (const payment of Array.isArray(raw?.payments) ? raw.payments : []) {
      const paymentId = text(payment?.id);
      if (paymentId) paymentIds.add(paymentId);
    }
  }
  return { orderIds, packIds, paymentIds };
}

function classifyRow(row: ParsedReportRow, references: Awaited<ReturnType<typeof orderReferenceSets>>, userId: string) {
  const payoutBankAccount = text(row.PAYOUT_BANK_ACCOUNT_NUMBER);
  const sourceId = text(row.SOURCE_ID);
  const externalOrderId = text(row.ORDER_ID);
  const orderMp = text(row.ORDER_MP);
  const packId = text(row.PACK_ID);
  if (payoutBankAccount) return "BANK_PAYOUT";
  if (
    (sourceId && references.paymentIds.has(sourceId))
    || (externalOrderId && references.orderIds.has(externalOrderId))
    || (orderMp && references.orderIds.has(orderMp))
    || (packId && references.packIds.has(packId))
  ) return "ORDER_RELEASE";
  if (isMercadoInvoiceCollection({
    sourceId, externalReference: text(row.EXTERNAL_REFERENCE), paymentMethodType: text(row.PAYMENT_METHOD_TYPE),
    netCreditAmount: row.NET_CREDIT_AMOUNT, netDebitAmount: row.NET_DEBIT_AMOUNT,
    externalOrderId, orderMp, packId, payoutBankAccount,
  }, userId)) return "BILL_PAYMENT";
  if (number(row.NET_CREDIT_AMOUNT) > 0) return "OTHER_INFLOW";
  if (number(row.NET_DEBIT_AMOUNT) > 0) return "OTHER_OUTFLOW";
  return "OTHER";
}

async function saveReport(input: {
  accountId: string;
  userId: string;
  report: ReportListItem;
  csv: string;
  references: Awaited<ReturnType<typeof orderReferenceSets>>;
}) {
  const fileName = text(input.report.file_name);
  if (!fileName) throw new Error("Mercado Pago 报告缺少文件名");
  const parsed = parseMercadoPagoReleaseCsv(input.csv);
  const dataRows = parsed.rows.filter((row) => !["initial_available_balance", "total"].includes(String(row.RECORD_TYPE || "").toLowerCase()));
  const savedReport = await prisma.mercadoLivreWalletReport.upsert({
    where: { accountId_fileName: { accountId: input.accountId, fileName } },
    create: {
      accountId: input.accountId,
      externalReportId: text(input.report.id),
      reportId: text(input.report.report_id),
      fileName,
      status: text(input.report.status) || "enabled",
      beginAt: date(input.report.begin_date),
      endAt: date(input.report.end_date),
      generatedAt: date(input.report.generation_date),
      rowCount: dataRows.length,
      rawData: input.report as Prisma.InputJsonObject,
    },
    update: {
      externalReportId: text(input.report.id),
      reportId: text(input.report.report_id),
      status: text(input.report.status) || "enabled",
      beginAt: date(input.report.begin_date),
      endAt: date(input.report.end_date),
      generatedAt: date(input.report.generation_date),
      rowCount: dataRows.length,
      rawData: input.report as Prisma.InputJsonObject,
      syncedAt: new Date(),
    },
    select: { id: true },
  });

  const occurrences = new Map<string, number>();
  let saved = 0;
  for (const row of dataRows) {
    const occurredAt = date(row.DATE);
    if (!occurredAt) continue;
    const baseHash = reportRowBaseHash(row);
    const occurrence = occurrences.get(baseHash) || 0;
    occurrences.set(baseHash, occurrence + 1);
    const netCredit = decimal(row.NET_CREDIT_AMOUNT) || "0.00";
    const netDebit = decimal(row.NET_DEBIT_AMOUNT) || "0.00";
    const moneyFlow = Number(netCredit) > Number(netDebit) ? "MONEY_IN" : Number(netDebit) > 0 ? "MONEY_OUT" : "NEUTRAL";
    const businessType = classifyRow(row, input.references, input.userId);
    const key = transactionKey(baseHash, occurrence);
    const createData = {
      accountId: input.accountId,
      reportId: savedReport.id,
      transactionKey: key,
      sourceId: text(row.SOURCE_ID),
      externalReference: text(row.EXTERNAL_REFERENCE),
      recordType: text(row.RECORD_TYPE) || "release",
      businessType,
      moneyFlow,
      netCreditAmount: netCredit,
      netDebitAmount: netDebit,
      grossAmount: decimal(row.GROSS_AMOUNT),
      sellerAmount: decimal(row.SELLER_AMOUNT),
      marketplaceFeeAmount: decimal(row.MP_FEE_AMOUNT),
      shippingFeeAmount: decimal(row.SHIPPING_FEE_AMOUNT),
      taxesAmount: decimal(row.TAXES_AMOUNT),
      couponAmount: decimal(row.COUPON_AMOUNT),
      balanceAmount: decimal(row.BALANCE_AMOUNT),
      payoutBankAccount: text(row.PAYOUT_BANK_ACCOUNT_NUMBER),
      paymentMethodType: text(row.PAYMENT_METHOD_TYPE),
      transactionIntentId: text(row.TRANSACTION_INTENT_ID),
      externalOrderId: text(row.ORDER_ID),
      packId: text(row.PACK_ID),
      orderMp: text(row.ORDER_MP),
      occurredAt,
      matchStatus: businessType === "BANK_PAYOUT" ? "PENDING_CASH_FLOW" : businessType === "ORDER_RELEASE" ? "ORDER_LINKED" : "NOT_APPLICABLE",
      rawData: row as Prisma.InputJsonObject,
    };
    await prisma.mercadoLivreWalletTransaction.upsert({
      where: { accountId_transactionKey: { accountId: input.accountId, transactionKey: key } },
      create: createData,
      update: {
        sourceId: createData.sourceId,
        externalReference: createData.externalReference,
        recordType: createData.recordType,
        businessType: createData.businessType,
        moneyFlow: createData.moneyFlow,
        netCreditAmount: createData.netCreditAmount,
        netDebitAmount: createData.netDebitAmount,
        grossAmount: createData.grossAmount,
        sellerAmount: createData.sellerAmount,
        marketplaceFeeAmount: createData.marketplaceFeeAmount,
        shippingFeeAmount: createData.shippingFeeAmount,
        taxesAmount: createData.taxesAmount,
        couponAmount: createData.couponAmount,
        balanceAmount: createData.balanceAmount,
        payoutBankAccount: createData.payoutBankAccount,
        paymentMethodType: createData.paymentMethodType,
        transactionIntentId: createData.transactionIntentId,
        externalOrderId: createData.externalOrderId,
        packId: createData.packId,
        orderMp: createData.orderMp,
        occurredAt: createData.occurredAt,
        rawData: createData.rawData,
        syncedAt: new Date(),
      },
    });
    saved += 1;
  }
  return { fileName, rows: dataRows.length, saved };
}

async function matchExistingCashFlows(account: {
  id: string;
  userId: string;
  currency: string;
  storeId: string | null;
}) {
  const walletAccounts = account.storeId
    ? await prisma.bankAccount.findMany({
        where: {
          storeId: account.storeId,
          currency: account.currency,
          accountType: "PLATFORM",
          OR: [
            { platformAccount: account.userId },
            { name: { contains: "美克多", mode: "insensitive" } },
            { accountPurpose: { contains: "美克多", mode: "insensitive" } },
          ],
        },
        select: { id: true },
      })
    : [];
  const walletAccountIds = walletAccounts.map((item) => item.id);
  const payouts = await prisma.mercadoLivreWalletTransaction.findMany({
    where: { accountId: account.id, businessType: "BANK_PAYOUT", cashFlowId: null },
    select: { id: true, occurredAt: true, netDebitAmount: true },
  });
  let matched = 0;
  for (const payout of payouts) {
    const start = new Date(payout.occurredAt.getTime() - 48 * 60 * 60 * 1000);
    const end = new Date(payout.occurredAt.getTime() + 48 * 60 * 60 * 1000);
    const candidates = await prisma.cashFlow.findMany({
      where: {
        type: "INCOME",
        currency: account.currency,
        amount: payout.netDebitAmount,
        date: { gte: start, lte: end },
        ...(walletAccountIds.length ? { accountId: { notIn: walletAccountIds } } : {}),
        mercadoLivreWalletTransaction: null,
        OR: [
          { summary: { contains: "Mercado", mode: "insensitive" } },
          { summary: { contains: "美克多", mode: "insensitive" } },
          { summary: { contains: "PAGO", mode: "insensitive" } },
          { remark: { contains: "Mercado", mode: "insensitive" } },
          { remark: { contains: "美克多", mode: "insensitive" } },
          { remark: { contains: "PAGO", mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: 2,
    });
    if (candidates.length === 1) {
      await prisma.mercadoLivreWalletTransaction.update({
        where: { id: payout.id },
        data: { cashFlowId: candidates[0].id, matchStatus: "MATCHED_EXISTING_CASH_FLOW" },
      });
      matched += 1;
    }
  }
  return { selected: payouts.length, matched };
}

async function syncOrderReleaseCashFlows(account: {
  id: string;
  userId: string;
  nickname: string | null;
  currency: string;
  storeId: string | null;
}) {
  if (!account.storeId) return { walletAccountId: null, events: 0, posted: 0, skipped: "STORE_NOT_LINKED" };
  const walletAccount = await prisma.bankAccount.findFirst({
    where: {
      storeId: account.storeId,
      currency: account.currency,
      accountType: "PLATFORM",
      OR: [
        { platformAccount: account.userId },
        { name: { contains: "美克多", mode: "insensitive" } },
        { accountPurpose: { contains: "美克多", mode: "insensitive" } },
      ],
    },
    orderBy: [{ platformAccount: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, exchangeRate: true },
  });
  if (!walletAccount) return { walletAccountId: null, events: 0, posted: 0, skipped: "WALLET_ACCOUNT_NOT_LINKED" };

  const rows = await prisma.mercadoLivreWalletTransaction.findMany({
    where: { accountId: account.id, businessType: "ORDER_RELEASE" },
    select: {
      id: true,
      reportId: true,
      transactionKey: true,
      sourceId: true,
      netCreditAmount: true,
      netDebitAmount: true,
      externalOrderId: true,
      orderMp: true,
      occurredAt: true,
      cashFlowId: true,
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
  const events = aggregateMercadoOrderReleaseRows(rows);
  let posted = 0;
  let reviewRequired = 0;
  for (const event of events) {
    if (event.missingIdentity) {
      reviewRequired += 1;
      continue;
    }
    // CashFlow.amount is signed: income is positive and expense/chargeback is
    // negative. A grouped release event can legitimately finish below zero.
    // Keeping the net amount prevents a chargeback from inflating the wallet.
    const amount = event.netAmount;
    const uidHash = createHash("sha256").update(`${account.id}:${event.eventKey}`).digest("hex");
    const uid = `mercado-order-release:${uidHash}`;
    const existing = await prisma.cashFlow.findUnique({ where: { uid }, select: { id: true, amount: true } });
    // Do not silently revalue historical cash flows created from overlapping reports.
    if (existing && requiresMercadoOrderReleaseReview(event, existing.amount)) {
      reviewRequired += 1;
      continue;
    }
    if (amount === 0 && !existing) continue;
    const isIncome = event.netAmount >= 0;
    const reference = event.sourceId || event.eventKey;
    const orderNumber = event.latest.externalOrderId || event.latest.orderMp || reference;
    const flow = await prisma.cashFlow.upsert({
      where: { uid },
      create: {
        uid,
        date: event.latest.occurredAt,
        summary: isIncome
          ? `Mercado Livre订单资金释放 - ${account.nickname || account.userId}`
          : `Mercado Livre订单资金冲正 - ${account.nickname || account.userId}`,
        category: isIncome ? "回款/店铺回款" : "平台资金/订单冲正",
        type: isIncome ? "INCOME" : "EXPENSE",
        amount,
        accountId: walletAccount.id,
        accountName: walletAccount.name,
        currency: account.currency,
        exchangeRate: resolveCashFlowExchangeRateToCny(account.currency, null, walletAccount.exchangeRate),
        remark: `Mercado Pago资金编号: ${reference}`,
        relatedId: reference,
        businessNumber: orderNumber,
        platform: "MERCADO_LIVRE",
        storeId: account.storeId,
        storeName: account.nickname || account.userId,
      },
      update: {
        date: event.latest.occurredAt,
        summary: isIncome
          ? `Mercado Livre订单资金释放 - ${account.nickname || account.userId}`
          : `Mercado Livre订单资金冲正 - ${account.nickname || account.userId}`,
        category: isIncome ? "回款/店铺回款" : "平台资金/订单冲正",
        type: isIncome ? "INCOME" : "EXPENSE",
        amount,
        accountId: walletAccount.id,
        accountName: walletAccount.name,
        currency: account.currency,
        exchangeRate: resolveCashFlowExchangeRateToCny(account.currency, null, walletAccount.exchangeRate),
        remark: `Mercado Pago资金编号: ${reference}`,
        relatedId: reference,
        businessNumber: orderNumber,
        platform: "MERCADO_LIVRE",
        storeId: account.storeId,
        storeName: account.nickname || account.userId,
      },
      select: { id: true },
    });
    const representative = event.linked || event.latest;
    await prisma.mercadoLivreWalletTransaction.update({
      where: { id: representative.id },
      data: { cashFlowId: flow.id, matchStatus: "WALLET_POSTED" },
    });
    posted += 1;
  }
  return { walletAccountId: walletAccount.id, events: events.length, posted, reviewRequired, skipped: null };
}

async function syncInvoiceCollectionCashFlows(account: {
  id: string;
  userId: string;
  nickname: string | null;
  currency: string;
  storeId: string | null;
}) {
  if (!account.storeId) return { walletAccountId: null, candidates: 0, posted: 0, review: 0, skipped: "STORE_NOT_LINKED" };
  const walletAccounts = await prisma.bankAccount.findMany({
    where: {
      storeId: account.storeId,
      currency: account.currency,
      accountType: "PLATFORM",
      OR: [
        { platformAccount: account.userId },
        { name: { contains: "美克多", mode: "insensitive" } },
        { accountPurpose: { contains: "美克多", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, exchangeRate: true },
  });
  // An ambiguous binding must not move money to an arbitrary platform wallet.
  if (walletAccounts.length !== 1) {
    return { walletAccountId: null, candidates: 0, posted: 0, review: 0, skipped: "WALLET_ACCOUNT_NOT_UNIQUE" };
  }
  const walletAccount = walletAccounts[0];
  const rows = await prisma.mercadoLivreWalletTransaction.findMany({
    where: {
      accountId: account.id,
      businessType: { in: ["OTHER_OUTFLOW", "BILL_PAYMENT"] },
      externalReference: { startsWith: `MELIPAYMENTS-COLLECTIONATTEMPT-${account.userId}-` },
    },
    select: {
      id: true, transactionKey: true, sourceId: true, externalReference: true, paymentMethodType: true,
      netCreditAmount: true, netDebitAmount: true, externalOrderId: true, orderMp: true, packId: true,
      payoutBankAccount: true, occurredAt: true, cashFlowId: true,
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!isMercadoInvoiceCollection(row, account.userId)) continue;
    const key = row.sourceId!;
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  let posted = 0;
  let review = 0;
  for (const [sourceId, eventRows] of grouped) {
    const debitCents = eventRows.reduce((sum, row) => sum + Math.round(Number(row.netDebitAmount) * 100), 0);
    const amount = debitCents / 100;
    const classification = verifiedMercadoInvoiceCategory(account.userId, sourceId, amount);
    const uid = `mercado-invoice:${createHash("sha256").update(`${account.id}:${sourceId}`).digest("hex")}`;
    const linkedIds = [...new Set(eventRows.map((row) => row.cashFlowId).filter(Boolean))];
    if (linkedIds.length > 1) throw new Error(`Mercado账单 ${sourceId} 已关联多笔财务流水`);
    await prisma.$transaction(async (tx) => {
      const existing = await tx.cashFlow.findUnique({ where: { uid }, select: { id: true, accountId: true, amount: true, type: true } });
      if (existing && (existing.accountId !== walletAccount.id || existing.type !== "EXPENSE" || Number(existing.amount) !== -amount)) {
        throw new Error(`Mercado账单 ${sourceId} 原入账金额或钱包已变更，请人工复核`);
      }
      if (linkedIds.length && existing && linkedIds[0] !== existing.id) {
        throw new Error(`Mercado账单 ${sourceId} 已关联其他财务流水，请人工复核`);
      }
      const manuallyPosted = await tx.cashFlow.findMany({
        where: { accountId: walletAccount.id, relatedId: sourceId, type: "EXPENSE", uid: { not: uid } },
        select: { id: true, amount: true }, take: 2,
      });
      if (manuallyPosted.length || (linkedIds.length && !existing)) {
        throw new Error(`Mercado账单 ${sourceId} 可能已经手工记账，请人工复核，未重复扣款`);
      }
      const flow = existing || await tx.cashFlow.create({
        data: {
          uid,
          date: eventRows[eventRows.length - 1].occurredAt,
          summary: classification.reviewed ? "Mercado Livre广告账单扣款" : "Mercado Livre平台账单扣款（费用待核对）",
          category: classification.category,
          type: "EXPENSE",
          amount: -amount,
          accountId: walletAccount.id,
          accountName: walletAccount.name,
          currency: account.currency,
          exchangeRate: resolveCashFlowExchangeRateToCny(account.currency, null, walletAccount.exchangeRate),
          remark: `${classification.description}；Mercado Pago资金编号: ${sourceId}；官方引用: ${eventRows[0].externalReference}`,
          relatedId: sourceId,
          businessNumber: sourceId,
          platform: "MERCADO_LIVRE",
          storeId: account.storeId,
          storeName: account.nickname || account.userId,
        },
        select: { id: true },
      });
      const representative = eventRows.find((row) => row.cashFlowId) || eventRows[eventRows.length - 1];
      await tx.mercadoLivreWalletTransaction.updateMany({
        where: { id: { in: eventRows.map((row) => row.id) } },
        data: { businessType: "BILL_PAYMENT", matchStatus: classification.reviewed ? "WALLET_POSTED" : "WALLET_POSTED_REVIEW" },
      });
      if (!representative.cashFlowId) {
        await tx.mercadoLivreWalletTransaction.update({ where: { id: representative.id }, data: { cashFlowId: flow.id } });
      }
      if (!existing) posted += 1;
      if (!classification.reviewed) review += 1;
    });
  }
  if (posted) await Promise.all([clearCacheByPrefix("cash-flow"), clearCacheByPrefix("accounts")]);
  return { walletAccountId: walletAccount.id, candidates: grouped.size, posted, review, skipped: null };
}

async function syncAccount(input: { accountId: string; generate?: boolean; days?: number; waitMs?: number }) {
  const account = await prisma.mercadoLivreAccount.findUnique({
    where: { id: input.accountId },
    select: { id: true, userId: true, nickname: true, currency: true, status: true, storeId: true },
  });
  if (!account || account.status !== "active") throw new Error("Mercado Livre 授权账号不存在或未连接");
  const references = await orderReferenceSets(account.id);

  return withFreshMercadoLivreToken(account.id, async (accessToken) => {
    const config = await ensureReleaseReportConfig(accessToken, account.userId);
    let generation: ReportListItem | null = null;
    if (input.generate) {
      const endAt = new Date();
      endAt.setUTCDate(endAt.getUTCDate() + 1);
      endAt.setUTCHours(0, 0, 0, 0);
      const beginAt = new Date(endAt.getTime() - Math.max(1, Math.min(365, input.days || 60)) * 86_400_000);
      generation = await requestHistoricalReport(accessToken, beginAt, endAt);
    }

    const waitUntil = Date.now() + Math.max(0, Math.min(55_000, input.waitMs || 0));
    let reports = await listReleaseReports(accessToken);
    while (input.generate && !reports.some((report) => report.file_name && ["enabled", "processed"].includes(String(report.status))) && Date.now() < waitUntil) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      reports = await listReleaseReports(accessToken);
    }

    const ready = reports.filter((report) => report.file_name && ["enabled", "processed"].includes(String(report.status)));
    const results: Array<{ fileName: string; rows: number; saved: number; skipped?: boolean }> = [];
    for (const report of ready) {
      const fileName = String(report.file_name);
      const existing = await prisma.mercadoLivreWalletReport.findUnique({
        where: { accountId_fileName: { accountId: account.id, fileName } },
        select: { rowCount: true },
      });
      if (existing && existing.rowCount > 0) {
        results.push({ fileName, rows: existing.rowCount, saved: 0, skipped: true });
        continue;
      }
      const csv = await mercadoPagoText(accessToken, `${REPORT_PATH}/${encodeURIComponent(fileName)}`);
      results.push(await saveReport({ accountId: account.id, userId: account.userId, report, csv, references }));
    }
    const matching = await matchExistingCashFlows(account);
    const walletPosting = await syncOrderReleaseCashFlows(account);
    const invoicePosting = await syncInvoiceCollectionCashFlows(account);
    return {
      account: { id: account.id, userId: account.userId, nickname: account.nickname },
      config: {
        includeWithdrawalAtEnd: Boolean(config.include_withdrawal_at_end),
        executeAfterWithdrawal: Boolean(config.execute_after_withdrawal),
      },
      generation,
      reportsListed: reports.length,
      reportsReady: ready.length,
      reports: results,
      matching,
      walletPosting,
      invoicePosting,
    };
  });
}

export async function syncMercadoLivreWallets(input: {
  accountId?: string;
  generate?: boolean;
  days?: number;
  waitMs?: number;
} = {}) {
  const accounts = await prisma.mercadoLivreAccount.findMany({
    where: { status: "active", ...(input.accountId ? { id: input.accountId } : {}) },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const results = [];
  const errors: Array<{ accountId: string; error: string }> = [];
  for (const account of accounts) {
    try {
      results.push(await syncAccount({ accountId: account.id, generate: input.generate, days: input.days, waitMs: input.waitMs }));
    } catch (error) {
      errors.push({ accountId: account.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { accounts: accounts.length, results, errors };
}
