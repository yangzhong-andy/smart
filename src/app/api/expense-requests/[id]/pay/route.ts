import { NextRequest, NextResponse } from "next/server";
import { CashFlowStatus, CashFlowType, Prisma, WarehouseFundEntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { clearCacheByPrefix } from "@/lib/redis";
import { isWarehouseRechargeCategory, recordWarehouseFundEntry } from "@/lib/warehouse-funds";

export const dynamic = "force-dynamic";

const serializeVoucher = (value: unknown) => {
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "FINANCE"] });
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const accountId = String(body.accountId || "").trim();
    if (!accountId) return NextResponse.json({ error: "请选择出款账户" }, { status: 400 });

    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) return NextResponse.json({ error: "付款时间无效" }, { status: 400 });
    const exchangeRate = new Prisma.Decimal(body.exchangeRate || 1);
    if (!exchangeRate.isPositive()) return NextResponse.json({ error: "付款汇率必须大于 0" }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`expense-payment:${params.id}`}))`;

      const expense = await tx.expenseRequest.findUnique({ where: { id: params.id } });
      if (!expense) throw new Error("支出申请不存在");
      if (expense.status === "Paid") {
        if (!expense.paymentFlowId) throw new Error("申请已付款但缺少财务流水，请人工核对");
        return { expense, cashFlowId: expense.paymentFlowId, duplicated: true };
      }
      if (expense.status !== "Approved") throw new Error("只有已审批的申请可以付款");
      if (!expense.amount.isPositive()) throw new Error("支出申请金额必须大于 0");

      const account = await tx.bankAccount.findUnique({ where: { id: accountId } });
      if (!account) throw new Error("出款账户不存在");

      const expenseCurrency = expense.currency.trim().toUpperCase();
      const accountCurrency = account.currency.trim().toUpperCase();
      const flowAmount = expenseCurrency === accountCurrency
        ? expense.amount
        : expense.amount.mul(exchangeRate).toDecimalPlaces(2);

      const paymentVoucher = serializeVoucher(expense.voucher);
      const transferVoucher = serializeVoucher(body.transferVoucher);
      const flow = await tx.cashFlow.create({
        data: {
          accountId: account.id,
          accountName: account.name,
          type: CashFlowType.EXPENSE,
          date: expense.date,
          summary: expense.summary,
          category: expense.category,
          amount: flowAmount.negated(),
          currency: accountCurrency,
          remark: expense.remark || "",
          relatedId: expense.relatedId,
          businessNumber: String(body.businessNumber || expense.businessNumber || "").trim() || null,
          voucher: paymentVoucher || transferVoucher,
          paymentVoucher,
          transferVoucher,
          status: CashFlowStatus.CONFIRMED,
          exchangeRate: expenseCurrency === accountCurrency ? new Prisma.Decimal(1) : exchangeRate,
          storeId: expense.storeId,
          storeName: expense.storeName,
        },
      });

      const updated = await tx.expenseRequest.update({
        where: { id: expense.id },
        data: {
          status: "Paid",
          financeAccountId: account.id,
          financeAccountName: account.name,
          paidBy: auth.user?.name || auth.user?.email || "财务",
          paidAt,
          paymentFlowId: flow.id,
          paymentVoucher: transferVoucher,
        },
      });

      if (isWarehouseRechargeCategory(expense.category)) {
        if (!expense.warehouseId) throw new Error("海外仓充值申请未关联仓库");
        await recordWarehouseFundEntry(tx, {
          warehouseId: expense.warehouseId,
          currency: expense.currency,
          entryType: WarehouseFundEntryType.RECHARGE,
          amount: expense.amount,
          sourceType: "EXPENSE_REQUEST",
          sourceId: expense.id,
          expenseRequestId: expense.id,
          cashFlowId: flow.id,
          occurredAt: paidAt,
          notes: expense.summary,
          createdBy: auth.user?.name || auth.user?.email,
        });
      }

      return { expense: updated, cashFlowId: flow.id, duplicated: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

    await Promise.all([
      clearCacheByPrefix("expense-requests"),
      clearCacheByPrefix("cash-flow"),
      clearCacheByPrefix("accounts"),
      clearCacheByPrefix("warehouses"),
      clearCacheByPrefix("warehouse-funds"),
    ]);
    return NextResponse.json({
      success: true,
      duplicated: result.duplicated,
      expenseRequestId: result.expense.id,
      cashFlowId: result.cashFlowId,
      status: result.expense.status,
    });
  } catch (error: any) {
    const message = error?.message || "付款失败";
    const status = message.includes("不存在") ? 404 : message.includes("只有已审批") || message.includes("缺少") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
