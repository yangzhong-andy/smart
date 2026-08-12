import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { syncSupplierMonthlyBills } from "@/lib/monthly-bill-sync";

export async function autoGenerateSupplierBills(): Promise<{ created: number; updated: number; skipped: number }> {
  const result = await syncSupplierMonthlyBills();
  return {
    created: result.created,
    updated: result.updated + result.cleared,
    skipped: result.skippedLocked,
  };
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
