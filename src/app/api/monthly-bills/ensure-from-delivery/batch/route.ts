import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST - 根据所有拿货单批量生成/更新月账单
 * 扫描所有有合同、供应商、尾款到期日的拿货单，按 (供应商, 月份) 汇总未付尾款，创建或更新「工厂订单」月账单（仅草稿可更新）
 */
export async function POST() {
  try {
    const allOrders = await prisma.deliveryOrder.findMany({
      include: { contract: true },
      orderBy: { tailDueDate: "asc" },
    });
    const orders = allOrders.filter(
      (o) => o.contract != null && o.tailDueDate != null && o.contract.supplierId != null
    );

    const keyToOrders = new Map<string, typeof orders>();
    for (const o of orders) {
      const contract = o.contract!;
      if (!contract.supplierId || !o.tailDueDate) continue;
      const month = o.tailDueDate.toISOString().slice(0, 7);
      const key = `${contract.supplierId}\t${month}`;
      if (!keyToOrders.has(key)) keyToOrders.set(key, []);
      keyToOrders.get(key)!.push(o);
    }

    const results: { supplierId: string; supplierName: string; month: string; created?: boolean; updated?: boolean; skipped?: boolean; totalAmount?: number }[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const [, groupOrders] of keyToOrders) {
      const first = groupOrders[0];
      const contract = first!.contract!;
      const supplierId = contract.supplierId!;
      const supplierName = contract.supplierName || "未知供应商";
      const billMonth = first!.tailDueDate!.toISOString().slice(0, 7);
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
        skipped++;
        results.push({ supplierId, supplierName, month: billMonth, skipped: true });
        continue;
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
        updated++;
        results.push({
          supplierId,
          supplierName,
          month: billMonth,
          updated: true,
          totalAmount: totalUnpaid,
        });
      } else {
        await prisma.monthlyBill.create({
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
            createdBy: "系统（拿货单批量生成）",
            notes,
          },
        });
        created++;
        results.push({
          supplierId,
          supplierName,
          month: billMonth,
          created: true,
          totalAmount: totalUnpaid,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `已处理 ${keyToOrders.size} 个供应商×月份，新建 ${created} 条，更新 ${updated} 条，跳过（无未付尾款）${skipped} 条`,
      created,
      updated,
      skipped,
      totalGroups: keyToOrders.size,
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "批量生成月账单失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
