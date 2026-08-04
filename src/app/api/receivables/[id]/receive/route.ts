import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

// POST - 回收（生成收入流水 + 更新应收款余额）
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { amount, accountId, accountName, receivedDate, voucher, remark, receivedBy } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "请输入有效回收金额" }, { status: 400 });
    }

    const receivable = await prisma.receivable.findUnique({ where: { id: params.id } });
    if (!receivable) return NextResponse.json({ error: "应收款不存在" }, { status: 404 });
    if (receivable.currentBalance <= 0) return NextResponse.json({ error: "已结清" }, { status: 400 });
    if (amount > Number(receivable.currentBalance)) {
      return NextResponse.json({ error: "回收金额超过未回收余额" }, { status: 400 });
    }

    // 生成收入流水
    const flow = await prisma.cashFlow.create({
      data: {
        date: new Date(receivedDate || new Date()),
        summary: `应收款回收 - ${receivable.counterparty} (${receivable.type})`,
        category: `应收款/${receivable.type}`,
        type: "INCOME",
        amount: Number(amount),
        accountId,
        accountName: accountName || "",
        currency: receivable.currency,
        remark: remark || `应收款回收 ${receivable.receivableNo}`,
        relatedId: receivable.id,
        businessNumber: receivable.receivableNo || undefined,
        status: "CONFIRMED",
        voucher: voucher || null,
      },
    });

    // 更新应收款
    const newBalance = Number(receivable.currentBalance) - Number(amount);
    const receiptRecords = (receivable.receiptRecords as any[]) || [];
    receiptRecords.push({
      id: crypto.randomUUID(),
      cashFlowId: flow.id,
      receivedAmount: Number(amount),
      receivedDate: receivedDate || new Date().toISOString().slice(0, 10),
      accountId,
      accountName: accountName || "",
      voucher: voucher || undefined,
      remark: remark || "",
      receivedBy: receivedBy || "系统",
      createdAt: new Date().toISOString(),
    });

    const updated = await prisma.receivable.update({
      where: { id: params.id },
      data: {
        currentBalance: newBalance,
        status: newBalance <= 0 ? "Settled" : "PartiallyReceived",
        receiptRecords: receiptRecords,
      },
    });

    await clearCacheByPrefix("receivables");
    return NextResponse.json({
      ...updated,
      originalAmount: Number(updated.originalAmount),
      currentBalance: Number(updated.currentBalance),
      flowId: flow.id,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "回收失败" }, { status: 500 });
  }
}
