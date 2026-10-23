import { randomBytes } from "node:crypto";
import { CashFlowStatus, CashFlowType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { getMonthlyBillPaymentAmount, type BillType } from "@/lib/reconciliation-store";
import { normalizeCashFlowExchangeRateToCny } from "@/lib/cash-flow-exchange-rate";
import { monthlyBillPaymentState } from "@/lib/monthly-bill-payment-state";

export const dynamic = "force-dynamic";

class PaymentConflict extends Error {}
class PaymentInputError extends Error {}

function voucher(value: unknown): string | null {
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  if (!["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(auth.user.role)
      && auth.user.departmentCode !== "FINANCE_CENTER") {
    return NextResponse.json({ error: "没有月账单付款权限" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const accountId = String(body.accountId || "").trim();
    const paymentMethod = String(body.paymentMethod || "").trim();
    const paymentDate = String(body.paymentDate || "").trim();
    const remark = String(body.remark || "").trim();
    const transferVoucher = voucher(body.transferVoucher);
    if (!accountId || !paymentMethod) throw new PaymentInputError("请选择付款账户和付款方式");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new PaymentInputError("请选择有效的付款日期");
    if (remark.length > 500) throw new PaymentInputError("备注不能超过 500 字");
    if (transferVoucher && transferVoucher.length > 3_000_000) throw new PaymentInputError("付款凭证过大");
    const paidAt = new Date(`${paymentDate}T12:00:00+08:00`);
    if (Number.isNaN(paidAt.getTime()) || paidAt.toISOString().slice(0, 10) < "2000-01-01") {
      throw new PaymentInputError("付款日期无效");
    }
    const exchangeRateValue = Number(body.exchangeRate ?? 1);
    if (!Number.isFinite(exchangeRateValue) || exchangeRateValue <= 0) {
      throw new PaymentInputError("付款汇率必须大于 0");
    }
    const exchangeRate = new Prisma.Decimal(exchangeRateValue);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<{ locked: number }[]>`
        SELECT 1 AS "locked" FROM
        (SELECT pg_advisory_xact_lock(hashtext(${`monthly-bill-payment:${params.id}`}))) AS lock_guard
      `;
      const bill = await tx.monthlyBill.findUnique({ where: { id: params.id } });
      if (!bill) throw new PaymentInputError("月账单不存在");
      if (bill.billCategory !== "Payable") throw new PaymentConflict("这不是应付账单，不能执行付款");

      const flows = await tx.cashFlow.findMany({
        where: {
          relatedId: bill.id,
          type: CashFlowType.EXPENSE,
          status: CashFlowStatus.CONFIRMED,
          isReversal: false,
          reversedById: null,
        },
        select: { id: true, businessNumber: true },
        take: 2,
      });
      const paymentState = monthlyBillPaymentState(
        bill.status, bill.paymentFlowId, flows.map((flow) => flow.id),
      );
      if (paymentState === "already-paid") {
        return { alreadyPaid: true, paymentVoucherNumber: bill.paymentVoucherNumber || flows[0].businessNumber };
      }
      if (paymentState === "conflict" && bill.status === "Paid") {
        throw new PaymentConflict("账单已标记付款，但流水关联不一致，请财务人工核对");
      }
      if (flows.length || bill.paymentFlowId) {
        throw new PaymentConflict("该账单已有付款流水，已阻止重复付款，请财务人工核对");
      }
      if (paymentState !== "new") {
        throw new PaymentConflict("只有已审批的应付账单可以付款，请刷新页面");
      }

      const billAmount = new Prisma.Decimal(getMonthlyBillPaymentAmount({
        billType: bill.billType as BillType,
        totalAmount: Number(bill.totalAmount),
        netAmount: Number(bill.netAmount),
      }));
      if (!billAmount.isPositive()) throw new PaymentConflict("应付金额不大于 0，请先核对账单");
      await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "BankAccount" WHERE id = ${accountId} FOR UPDATE
      `;
      const account = await tx.bankAccount.findUnique({ where: { id: accountId } });
      if (!account) throw new PaymentInputError("付款账户不存在");
      const accountCurrency = account.currency === "RMB" ? "CNY" : account.currency;
      if (accountCurrency !== bill.currency && accountCurrency !== "CNY") {
        throw new PaymentInputError("付款账户币种必须与账单相同，或选择人民币账户");
      }
      const amount = accountCurrency === bill.currency
        ? billAmount
        : billAmount.mul(exchangeRate).toDecimalPlaces(2);
      const flowRate = normalizeCashFlowExchangeRateToCny(accountCurrency, exchangeRate.toString());
      if (!flowRate) throw new PaymentInputError("付款汇率无效");

      const totals = await tx.cashFlow.aggregate({
        where: { accountId, type: { in: [CashFlowType.INCOME, CashFlowType.EXPENSE] } },
        _sum: { amount: true },
      });
      const balance = account.initialCapital.add(totals._sum.amount || 0);
      if (balance.lessThan(amount)) throw new PaymentConflict("付款账户余额不足，请刷新账户余额");

      const paymentVoucherNumber = `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
      const summary = `${bill.billType} - ${bill.agencyName || bill.supplierName || bill.factoryName || "月账单"}`;
      const category = bill.billType === "广告" ? "广告费/广告代理费"
        : bill.billType === "物流" ? "物流/海运费"
        : bill.billType === "工厂订单" ? "采购/工厂订单" : "其他";
      const applicationVoucher = bill.paymentApplicationVoucher;
      const flow = await tx.cashFlow.create({
        data: {
          date: paidAt,
          exchangeRate: new Prisma.Decimal(flowRate),
          summary,
          category,
          type: CashFlowType.EXPENSE,
          amount: amount.negated(),
          accountId,
          accountName: account.name,
          currency: accountCurrency,
          remark: `付款单号：${paymentVoucherNumber} - ${bill.month} - ${paymentMethod}${remark ? ` - ${remark}` : ""}`,
          relatedId: bill.id,
          businessNumber: paymentVoucherNumber,
          status: CashFlowStatus.CONFIRMED,
          isReversal: false,
          voucher: applicationVoucher,
          paymentVoucher: applicationVoucher,
          transferVoucher,
        },
      });
      const newBalance = balance.sub(amount);
      await tx.bankAccount.update({
        where: { id: accountId },
        data: {
          originalBalance: newBalance,
          rmbBalance: accountCurrency === "CNY"
            ? newBalance
            : newBalance.mul(account.exchangeRate).toDecimalPlaces(2),
        },
      });
      await tx.monthlyBill.update({
        where: { id: bill.id },
        data: {
          status: "Paid",
          paidBy: auth.user.name || auth.user.email,
          paidAt,
          paymentMethod,
          paymentAccountId: accountId,
          paymentAccountName: account.name,
          paymentVoucher: transferVoucher ? JSON.stringify([transferVoucher]) : null,
          paymentVoucherNumber,
          paymentFlowId: flow.id,
          paymentRemarks: `付款单号：${paymentVoucherNumber}`,
        },
      });
      return { alreadyPaid: false, paymentVoucherNumber };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

    await Promise.all([
      clearCacheByPrefix("monthly-bills"),
      clearCacheByPrefix("cash-flow"),
      clearCacheByPrefix("accounts"),
    ]);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    if (error instanceof PaymentInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof PaymentConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Monthly bill payment failed", error);
    return NextResponse.json({ error: "付款未完成，请刷新账单状态后重试" }, { status: 500 });
  }
}
