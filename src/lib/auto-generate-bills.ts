import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";

export async function autoGenerateSupplierBills(): Promise<{ created: number; updated: number; skipped: number }> {
  try {
    const allOrders = await prisma.deliveryOrder.findMany({
      include: { contract: true },
      orderBy: { tailDueDate: "asc" },
    });
    const orders = allOrders.filter(
      (o) => o.contract != null && o.shippedDate != null && o.contract.supplierId != null
    );
    const keyToOrders = new Map<string, typeof orders>();
    for (const o of orders) {
      const contract = o.contract!;
      if (!contract.supplierId || !o.shippedDate) continue;
      const month = o.shippedDate.toISOString().slice(0, 7);
      const key = contract.supplierId + "\t" + month;
      if (!keyToOrders.has(key)) keyToOrders.set(key, []);
      keyToOrders.get(key)!.push(o);
    }
    let created = 0, updated = 0, skipped = 0;
    for (const [, groupOrders] of keyToOrders) {
      const first = groupOrders[0];
      const contract = first!.contract!;
      const supplierId = contract.supplierId!;
      const supplierName = contract.supplierName || "未知供应商";
      const billMonth = first!.shippedDate!.toISOString().slice(0, 7);
      const monthStart = new Date(billMonth + "-01T00:00:00.000Z");
      const monthEndExcl = new Date(monthStart);
      monthEndExcl.setUTCMonth(monthEndExcl.getUTCMonth() + 1);
      const allContractsOfSupplier = await prisma.purchaseContract.findMany({ where: { supplierId }, select: { id: true } });
      const contractIds = allContractsOfSupplier.map((c) => c.id);
      const deliveriesInMonth = await prisma.deliveryOrder.findMany({ where: { contractId: { in: contractIds }, shippedDate: { gte: monthStart, lt: monthEndExcl } } });
      const totalTailAmount = deliveriesInMonth.reduce((sum, d) => sum + Number(d.tailAmount), 0);
      if (totalTailAmount <= 0) { skipped++; continue; }
      const existing = await prisma.monthlyBill.findFirst({ where: { billType: "工厂订单", supplierId, month: billMonth } });
      if (existing) {
        if (existing.status === "Draft") {
          await prisma.monthlyBill.update({ where: { id: existing.id }, data: { totalAmount: totalTailAmount, netAmount: totalTailAmount, updatedAt: new Date() } });
          updated++;
        } else { skipped++; }
      } else {
        await prisma.monthlyBill.create({ data: { billType: "工厂订单", billCategory: "Payable", supplierId, supplierName, month: billMonth, totalAmount: totalTailAmount, netAmount: totalTailAmount, currency: "CNY", status: "Draft", notes: "自动生成：" + billMonth + "月供应商月账单", createdAt: new Date(), updatedAt: new Date() } });
        created++;
      }
    }
    if (created > 0 || updated > 0) { await clearCacheByPrefix("monthly-bills"); }
    return { created, updated, skipped };
  } catch (error) {
    console.error("autoGenerateSupplierBills error:", error);
    return { created: 0, updated: 0, skipped: 0 };
  }
}

/**
 * 自动生成广告消耗月账单
 * 按代理商+账户+月份汇总 AdConsumption，生成 MonthlyBill
 */
export async function generateAdConsumptionBills(month?: string) {
  try {
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const monthStart = new Date(targetMonth + "-01");
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    // 按代理商+账户汇总消耗
    const consumptions = await prisma.adConsumption.groupBy({
      by: ["agencyId", "agencyName", "adAccountId", "accountName", "currency"],
      where: {
        date: { gte: monthStart, lt: monthEnd },
      },
      _sum: { amount: true },
    });

    let created = 0;
    for (const c of consumptions) {
      if (!c.agencyId) continue;
      const totalAmount = c._sum.amount || 0;

      // 检查是否已存在
      const existing = await prisma.monthlyBill.findFirst({
        where: {
          billType: "广告",
          agencyId: c.agencyId,
          adAccountId: c.adAccountId || null,
          month: targetMonth,
        },
      });

      if (existing) {
        // 更新金额
        await prisma.monthlyBill.update({
          where: { id: existing.id },
          data: {
            totalAmount,
            netAmount: totalAmount,
            updatedAt: new Date(),
          },
        });
      } else {
        // 创建新月账单
        await prisma.monthlyBill.create({
          data: {
            month: targetMonth,
            billType: "广告",
            billCategory: "Payable",
            agencyId: c.agencyId,
            agencyName: c.agencyName || "",
            adAccountId: c.adAccountId || null,
            accountName: c.accountName || "",
            totalAmount,
            netAmount: totalAmount,
            currency: c.currency || "USD",
            status: "Draft",
            notes: `信用消耗账单（${targetMonth}）- 自动生成`,
          },
        });
        created++;
      }
    }

    if (created > 0) {
      await clearCacheByPrefix("monthly-bills");
      console.log(`[Auto Bills] 广告消耗月账单 ${targetMonth}: 新增 ${created} 条`);
    }

    return { month: targetMonth, created, total: consumptions.length };
  } catch (error) {
    console.error("[Auto Bills] 广告月账单生成失败:", error);
    return { error: String(error) };
  }
}
