import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSupplierMonthlyBills } from "@/lib/monthly-bill-sync";

export const dynamic = "force-dynamic";

/** Recalculate supplier bills after a delivery order changes. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deliveryOrderId = body.deliveryOrderId;
    if (!deliveryOrderId) {
      return NextResponse.json({ error: "缺少 deliveryOrderId" }, { status: 400 });
    }

    const order = await prisma.deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      include: { contract: true },
    });
    if (!order) {
      return NextResponse.json({ error: "拿货单不存在" }, { status: 404 });
    }
    if (!order.contract.supplierId) {
      return NextResponse.json(
        { error: "合同未关联供应商，无法生成月账单" },
        { status: 400 }
      );
    }
    if (!order.tailDueDate) {
      return NextResponse.json(
        { error: "拿货单无尾款到期日，无法确定账单月份" },
        { status: 400 }
      );
    }

    const result = await syncSupplierMonthlyBills();
    const month = order.tailDueDate.toISOString().slice(0, 7);
    const bill = await prisma.monthlyBill.findFirst({
      where: {
        supplierId: order.contract.supplierId,
        month,
        billType: "工厂订单",
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      message: "已按尾款账期重算供应商月账单",
      month,
      supplierId: order.contract.supplierId,
      supplierName: order.contract.supplierName,
      billId: bill?.id,
      totalAmount: bill ? Number(bill.totalAmount) : 0,
      created: result.created > 0,
      updated: result.updated > 0 || result.cleared > 0,
      skippedLocked: result.skippedLocked,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成月账单失败" },
      { status: 500 }
    );
  }
}
