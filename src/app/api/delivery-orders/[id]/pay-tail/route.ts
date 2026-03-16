import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { PurchaseContractStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * POST - 财务工作台对「采购尾款」支出申请执行付款后，同步更新拿货单已付尾款与合同已付总额
 * body: { amount: number }
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
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "金额无效" }, { status: 400 });
    }

    const order = await prisma.deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      include: { contract: true },
    });
    if (!order) {
      return NextResponse.json({ error: "拿货单不存在" }, { status: 404 });
    }

    const newTailPaid = Number(order.tailPaid) + amount;
    const contract = order.contract;
    const newTotalPaid = Number(contract.totalPaid) + amount;
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

    return NextResponse.json({
      ok: true,
      deliveryOrderId,
      contractId: order.contractId,
      tailPaid: newTailPaid,
      totalPaid: newTotalPaid,
    });
  } catch (e) {
    console.error("pay-tail error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "同步失败" },
      { status: 500 }
    );
  }
}
