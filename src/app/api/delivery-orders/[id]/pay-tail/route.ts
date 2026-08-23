import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { PurchaseContractStatus } from "@prisma/client";
import { syncSupplierMonthlyBills } from "@/lib/monthly-bill-sync";

export const dynamic = "force-dynamic";

/**
 * POST - 财务工作台对「采购尾款」支出申请执行付款后，同步更新拿货单已付尾款与合同已付总额
 * body: { expenseRequestId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { id: deliveryOrderId } = await params;
    const body = await request.json();
    const expenseRequestId = String(body?.expenseRequestId || "").trim();
    if (!expenseRequestId) {
      return NextResponse.json({ error: "缺少付款申请编号" }, { status: 400 });
    }

    const order = await prisma.deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      include: { contract: true },
    });
    if (!order) {
      return NextResponse.json({ error: "拿货单不存在" }, { status: 404 });
    }

    const paidRequest = await prisma.expenseRequest.findUnique({
      where: { id: expenseRequestId },
      select: { id: true, relatedId: true, status: true, category: true, summary: true },
    });
    const isPaidPurchaseTail = Boolean(
      paidRequest &&
      paidRequest.status === "Paid" &&
      paidRequest.relatedId === deliveryOrderId &&
      (paidRequest.category === "采购/采购尾款" || paidRequest.summary.includes("采购尾款"))
    );
    if (!isPaidPurchaseTail) {
      return NextResponse.json({ error: "付款申请未支付或未关联该拿货单" }, { status: 409 });
    }

    const paidRequests = await prisma.expenseRequest.findMany({
      where: {
        status: "Paid",
        currency: "CNY",
        AND: [
          {
            OR: [
              { category: "采购/采购尾款" },
              { summary: { contains: "采购尾款" } },
            ],
          },
          {
            OR: [
              { relatedId: deliveryOrderId },
              { summary: { contains: order.deliveryNumber } },
            ],
          },
        ],
      },
      select: { amount: true },
    });
    const newTailPaid = paidRequests.reduce(
      (sum, item) => sum + Math.round(Math.abs(Number(item.amount)) * 100),
      0
    ) / 100;
    const contract = order.contract;
    const contractOrders = await prisma.deliveryOrder.findMany({
      where: { contractId: contract.id },
      select: { id: true, tailPaid: true },
    });
    const actualContractTailPaid = contractOrders.reduce(
      (sum, item) =>
        sum + Math.round(
          (item.id === deliveryOrderId ? newTailPaid : Number(item.tailPaid)) * 100
        ),
      0
    ) / 100;
    const newTotalPaid = Number(contract.depositPaid) + actualContractTailPaid;
    const totalAmount = Number(contract.totalAmount);
    const newStatus =
      newTotalPaid >= totalAmount
        ? PurchaseContractStatus.SETTLED
        : contract.status;

    await prisma.$transaction([
      prisma.deliveryOrder.update({
        where: { id: deliveryOrderId },
        data: {
          tailPaid: newTailPaid,
          updatedAt: new Date(),
        },
      }),
      prisma.purchaseContract.update({
        where: { id: order.contractId },
        data: {
          totalPaid: newTotalPaid,
          totalOwed: totalAmount - newTotalPaid,
          status: newStatus,
          updatedAt: new Date(),
        },
      }),
    ]);

    // 清除相关缓存，保证拿货单列表和合同视图可以看到最新的已付尾款/已付总额
    await clearCacheByPrefix("delivery-orders");
    await clearCacheByPrefix("purchase-contracts");
    await syncSupplierMonthlyBills();

    return NextResponse.json({
      ok: true,
      deliveryOrderId,
      contractId: order.contractId,
      tailPaid: newTailPaid,
      totalPaid: newTotalPaid,
      idempotent: Math.abs(newTailPaid - Number(order.tailPaid)) < 0.005,
    });
  } catch (e) {
    console.error("pay-tail error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "同步失败" },
      { status: 500 }
    );
  }
}
