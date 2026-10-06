import { CashFlowType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

const ACCOUNT_CHANGE_ROLES = ["ADMIN", "SUPER_ADMIN", "FINANCE"];

class AccountChangeError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function normalizedCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  return currency === "RMB" ? "CNY" : currency;
}

function serializeLog(row: {
  id: string;
  oldAccountId: string;
  oldAccountName: string;
  newAccountId: string;
  newAccountName: string;
  reason: string;
  changedByName: string;
  changedByEmail: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    oldAccountId: row.oldAccountId,
    oldAccountName: row.oldAccountName,
    newAccountId: row.newAccountId,
    newAccountName: row.newAccountName,
    reason: row.reason,
    changedByName: row.changedByName,
    changedByEmail: row.changedByEmail,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiUser(request, { roles: ACCOUNT_CHANGE_ROLES });
  if (auth.response) return auth.response;

  try {
    const logs = await prisma.cashFlowAccountChangeLog.findMany({
      where: { cashFlowId: params.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        oldAccountId: true,
        oldAccountName: true,
        newAccountId: true,
        newAccountName: true,
        reason: true,
        changedByName: true,
        changedByEmail: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: logs.map(serializeLog) });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "账户修改记录读取失败" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiUser(request, { roles: ACCOUNT_CHANGE_ROLES });
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const newAccountId = String(body.newAccountId || "").trim();
    const reason = String(body.reason || "").trim();

    if (!newAccountId) {
      throw new AccountChangeError("请选择新的付款账户");
    }
    if (reason.length < 4) {
      throw new AccountChangeError("修改原因至少填写 4 个字");
    }
    if (reason.length > 500) {
      throw new AccountChangeError("修改原因不能超过 500 个字");
    }

    const result = await prisma.$transaction(async (tx) => {
      const [flow, newAccount] = await Promise.all([
        tx.cashFlow.findUnique({
          where: { id: params.id },
          select: {
            id: true,
            date: true,
            amount: true,
            currency: true,
            summary: true,
            type: true,
            accountId: true,
            isReversal: true,
            account: { select: { name: true } },
            reversals: {
              where: { isReversal: true },
              select: { id: true },
              take: 1,
            },
          },
        }),
        tx.bankAccount.findUnique({
          where: { id: newAccountId },
          select: { id: true, name: true, currency: true },
        }),
      ]);

      if (!flow) throw new AccountChangeError("流水记录不存在", 404);
      if (!newAccount) throw new AccountChangeError("目标付款账户不存在", 404);
      if (flow.type !== CashFlowType.EXPENSE) {
        throw new AccountChangeError("只有付款流水可以修改付款账户");
      }
      if (flow.isReversal || flow.reversals.length > 0) {
        throw new AccountChangeError("冲销流水或已冲销流水不能修改付款账户");
      }
      if (flow.accountId === newAccount.id) {
        throw new AccountChangeError("新付款账户不能与当前账户相同");
      }
      if (normalizedCurrency(flow.currency) !== normalizedCurrency(newAccount.currency)) {
        throw new AccountChangeError(
          `账户币种不一致：流水为 ${flow.currency}，目标账户为 ${newAccount.currency}`,
        );
      }

      const updated = await tx.cashFlow.updateMany({
        where: { id: flow.id, accountId: flow.accountId },
        data: {
          accountId: newAccount.id,
          accountName: newAccount.name,
        },
      });
      if (updated.count !== 1) {
        throw new AccountChangeError("流水账户已被其他操作修改，请刷新后重试", 409);
      }

      const log = await tx.cashFlowAccountChangeLog.create({
        data: {
          cashFlowId: flow.id,
          flowDate: flow.date,
          flowAmount: flow.amount,
          flowCurrency: flow.currency,
          flowSummary: flow.summary,
          oldAccountId: flow.accountId,
          oldAccountName: flow.account.name,
          newAccountId: newAccount.id,
          newAccountName: newAccount.name,
          reason,
          changedById: auth.user.id,
          changedByName: auth.user.name,
          changedByEmail: auth.user.email,
        },
        select: {
          id: true,
          oldAccountId: true,
          oldAccountName: true,
          newAccountId: true,
          newAccountName: true,
          reason: true,
          changedByName: true,
          changedByEmail: true,
          createdAt: true,
        },
      });

      return { newAccount, log };
    });

    await Promise.all([
      clearCacheByPrefix("cash-flow"),
      clearCacheByPrefix("accounts"),
    ]);

    return NextResponse.json({
      success: true,
      accountId: result.newAccount.id,
      accountName: result.newAccount.name,
      change: serializeLog(result.log),
    });
  } catch (error: any) {
    const status = error instanceof AccountChangeError ? error.status : 500;
    return NextResponse.json(
      { error: error?.message || "付款账户修改失败" },
      { status },
    );
  }
}
