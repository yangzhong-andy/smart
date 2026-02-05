import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST - 拿货后按账期生成/汇总月账单
 * 根据拿货单的尾款到期日（tailDueDate）所在月份，为该供应商创建或更新「工厂订单」月账单（仅草稿时可更新）
 * body: { deliveryOrderId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deliveryOrderId = body.deliveryOrderId;
    if (!deliveryOrderId) {
      return NextResponse.json(
        { error: "缺少 deliveryOrderId" },
        { status: 400 }
      );
    }

    const order = await prisma.deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      include: { contract: true },
    });
    if (!order || !order.contract) {
      return NextResponse.json(
        { error: "拿货单或关联合同不存在" },
        { status: 404 }
      );
    }

    const contract = order.contract;
    const supplierId = contract.supplierId;
    const supplierName = contract.supplierName || "未知供应商";
    if (!supplierId) {
      return NextResponse.json(
        { error: "合同未关联供应商，无法生成月账单" },
        { status: 400 }
      );
    }

    const tailDueDate = order.tailDueDate;
    if (!tailDueDate) {
      return NextResponse.json(
        { error: "拿货单无尾款到期日，无法确定账单月份" },
        { status: 400 }
      );
    }

    const billMonth = tailDueDate.toISOString().slice(0, 7);
    const monthStart = new Date(billMonth + "-01T00:00:00.000Z");
    const monthEndExcl = new Date(monthStart);
    monthEndExcl.setUTCMonth(monthEndExcl.getUTCMonth() + 1);

    const allContractsOfSupplier = await prisma.purchaseContract.findMany({
      where: { supplierId },
      select: { id: true },
    });
    const contractIds = allContractsOfSupplier.map((c) => c.id);

    const deliveriesInMonth = await prisma.deliveryOrder.findMany({
      where: {
        contractId: { in: contractIds },
        tailDueDate: { gte: monthStart, lt: monthEndExcl },
      },
      include: { contract: true },
      orderBy: { tailDueDate: "asc" },
    });

    let totalUnpaid = 0;
    const lines: string[] = [];
    for (const d of deliveriesInMonth) {
      const unpaid = Number(d.tailAmount) - Number(d.tailPaid || 0);
      if (unpaid <= 0) continue;
      totalUnpaid += unpaid;
      lines.push(
        `${d.deliveryNumber}（${d.qty}件，尾款¥${Number(d.tailAmount).toFixed(2)}，未付¥${unpaid.toFixed(2)}）`
      );
    }

    if (totalUnpaid <= 0) {
      return NextResponse.json({
        success: true,
        message: "该月无未付尾款，未创建/更新月账单",
        month: billMonth,
        supplierId,
        supplierName,
      });
    }

    const notes =
      "供应商月账单明细（按尾款到期日汇总）:\n" + lines.join("\n");
    const currency = "CNY";

    const existing = await prisma.monthlyBill.findFirst({
      where: {
        supplierId,
        month: billMonth,
        billType: "工厂订单",
        status: "Draft",
      },
    });

    if (existing) {
      await prisma.monthlyBill.update({
        where: { id: existing.id },
        data: {
          totalAmount: totalUnpaid,
          netAmount: totalUnpaid,
          notes,
          supplierName,
        },
      });
      return NextResponse.json({
        success: true,
        message: "已更新该供应商当月月账单（草稿）",
        month: billMonth,
        supplierId,
        supplierName,
        billId: existing.id,
        totalAmount: totalUnpaid,
        updated: true,
      });
    }

    const created = await prisma.monthlyBill.create({
      data: {
        month: billMonth,
        billCategory: "Payable",
        billType: "工厂订单",
        supplierId,
        supplierName,
        totalAmount: totalUnpaid,
        currency,
        rebateAmount: 0,
        netAmount: totalUnpaid,
        consumptionIds: null,
        rechargeIds: null,
        status: "Draft",
        createdBy: "系统（拿货自动生成）",
        notes,
      },
    });

    return NextResponse.json({
      success: true,
      message: "已根据账期生成该供应商当月月账单",
      month: billMonth,
      supplierId,
      supplierName,
      billId: created.id,
      totalAmount: totalUnpaid,
      created: true,
    });
  } catch (error: any) {
    console.error("Ensure monthly bill from delivery:", error);
    return NextResponse.json(
      { error: error?.message || "生成月账单失败" },
      { status: 500 }
    );
  }
}
