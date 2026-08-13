import { Prisma, WarehouseFundEntryType } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

export type WarehouseFundEntryInput = {
  warehouseId: string;
  currency: string;
  entryType: WarehouseFundEntryType;
  amount: Prisma.Decimal.Value;
  sourceType: string;
  sourceId: string;
  expenseRequestId?: string | null;
  cashFlowId?: string | null;
  orderId?: string | null;
  occurredAt?: Date;
  notes?: string | null;
  createdBy?: string | null;
  allowNegativeBalance?: boolean;
};

const normalizeCurrency = (currency: string) => currency.trim().toUpperCase();

/**
 * Records one auditable warehouse-fund movement. The source key makes retries
 * idempotent, while a transaction-scoped advisory lock serializes updates for
 * one warehouse/currency account.
 */
export async function recordWarehouseFundEntry(tx: TransactionClient, input: WarehouseFundEntryInput) {
  const currency = normalizeCurrency(input.currency);
  const sourceType = input.sourceType.trim();
  const sourceId = input.sourceId.trim();
  const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2);

  if (!input.warehouseId || !currency || !sourceType || !sourceId) {
    throw new Error("仓库资金流水缺少仓库、币种或来源信息");
  }
  if (amount.isZero()) throw new Error("仓库资金流水金额不能为 0");

  const warehouse = await tx.warehouse.findUnique({
    where: { id: input.warehouseId },
    select: { id: true, type: true },
  });
  if (!warehouse || warehouse.type !== "OVERSEAS") throw new Error("海外仓不存在或类型不正确");

  const lockKey = `warehouse-fund:${input.warehouseId}:${currency}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const existing = await tx.warehouseFundEntry.findUnique({
    where: { sourceType_sourceId: { sourceType, sourceId } },
  });
  if (existing) {
    if (
      existing.warehouseId !== input.warehouseId
      || existing.currency !== currency
      || !existing.amount.equals(amount)
      || existing.entryType !== input.entryType
    ) {
      throw new Error("相同来源已存在不同的仓库资金流水，请人工核对");
    }
    return { entry: existing, duplicated: true };
  }

  const account = await tx.warehouseFundAccount.upsert({
    where: { warehouseId_currency: { warehouseId: input.warehouseId, currency } },
    create: { warehouseId: input.warehouseId, currency },
    update: {},
  });
  const balanceBefore = account.balance;
  const balanceAfter = balanceBefore.add(amount);
  if (!input.allowNegativeBalance && balanceAfter.isNegative()) {
    throw new Error(`仓库预存余额不足：当前 ${currency} ${balanceBefore.toFixed(2)}`);
  }

  const isCredit = amount.isPositive();
  const updatedAccount = await tx.warehouseFundAccount.update({
    where: { id: account.id },
    data: {
      balance: balanceAfter,
      totalCredit: isCredit ? { increment: amount } : undefined,
      totalDebit: isCredit ? undefined : { increment: amount.abs() },
    },
  });
  const entry = await tx.warehouseFundEntry.create({
    data: {
      accountId: account.id,
      warehouseId: input.warehouseId,
      currency,
      entryType: input.entryType,
      amount,
      balanceBefore,
      balanceAfter,
      sourceType,
      sourceId,
      expenseRequestId: input.expenseRequestId || null,
      cashFlowId: input.cashFlowId || null,
      orderId: input.orderId || null,
      occurredAt: input.occurredAt || new Date(),
      notes: input.notes || null,
      createdBy: input.createdBy || null,
    },
  });

  return { entry, account: updatedAccount, duplicated: false };
}

export const isWarehouseRechargeCategory = (category: string | null | undefined) =>
  String(category || "").trim() === "物流/海外仓一件代发费";
