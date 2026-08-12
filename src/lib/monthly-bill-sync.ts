import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import {
  calculateLogisticsBillGroups,
  calculateSupplierBillGroups,
} from "@/lib/monthly-bill-calculation";

export type BillSyncResult = {
  created: number;
  updated: number;
  cleared: number;
  skippedLocked: number;
  groups: number;
};

const emptyResult = (): BillSyncResult => ({
  created: 0,
  updated: 0,
  cleared: 0,
  skippedLocked: 0,
  groups: 0,
});

const parseIds = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
};

const isSystemGenerated = (bill: { createdBy: string; notes: string | null }) =>
  bill.createdBy.startsWith("系统") || Boolean(bill.notes?.includes("自动生成"));

export async function syncSupplierMonthlyBills(): Promise<BillSyncResult> {
  const result = emptyResult();
  const [orders, existingBills] = await Promise.all([
    prisma.deliveryOrder.findMany({
      include: { contract: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.monthlyBill.findMany({
      where: { billType: "工厂订单", billCategory: "Payable" },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const settledOrderIds = new Set(
    existingBills
      .filter((bill) => bill.status !== "Draft")
      .flatMap((bill) => parseIds(bill.consumptionIds))
  );
  const legacyLockedKeys = new Set(
    existingBills
      .filter(
        (bill) =>
          bill.status !== "Draft" &&
          parseIds(bill.consumptionIds).length === 0 &&
          Boolean(bill.supplierId)
      )
      .map((bill) => `${bill.supplierId}\t${bill.month}`)
  );
  const groups = calculateSupplierBillGroups(
    orders.filter((order) => !settledOrderIds.has(order.id))
  );
  result.groups = groups.length;

  const activeKeys = new Set<string>();

  for (const group of groups) {
    const key = `${group.supplierId}\t${group.month}`;
    activeKeys.add(key);
    const matching = existingBills.filter(
      (bill) =>
        bill.supplierId === group.supplierId &&
        bill.month === group.month &&
        bill.currency === "CNY"
    );
    const protectedDraft = matching.find(
      (bill) => bill.status === "Draft" && !isSystemGenerated(bill)
    );
    if (legacyLockedKeys.has(key) || protectedDraft) {
      result.skippedLocked += 1;
      continue;
    }

    const notes = [
      `系统自动生成：${group.month} 供应商账单（按尾款账期汇总）`,
      `拿货货值：CNY ${group.grossAmount.toFixed(2)}`,
      `已付尾款：CNY ${group.tailPaidAmount.toFixed(2)}`,
      `合同定金抵扣：CNY ${group.depositDeduction.toFixed(2)}（仅合同全部拿完时抵扣）`,
      `本期应付：CNY ${group.payableAmount.toFixed(2)}`,
      ...group.lines.map(
        (line) =>
          `${line.deliveryNumber}（${line.quantity}件，货值 CNY ${line.grossAmount.toFixed(2)}，已付 CNY ${line.tailPaidAmount.toFixed(2)}）`
      ),
    ].join("\n");
    const data = {
      supplierName: group.supplierName,
      totalAmount: group.grossAmount,
      netAmount: group.payableAmount,
      rebateAmount: 0,
      offsetAmount: group.tailPaidAmount + group.depositDeduction,
      consumptionIds: JSON.stringify(group.orderIds),
      notes,
      updatedAt: new Date(),
    };

    const draft = matching.find(
      (bill) => bill.status === "Draft" && isSystemGenerated(bill)
    );
    if (draft) {
      await prisma.monthlyBill.update({ where: { id: draft.id }, data });
      result.updated += 1;
    } else if (group.payableAmount > 0) {
      await prisma.monthlyBill.create({
        data: {
          month: group.month,
          billCategory: "Payable",
          billType: "工厂订单",
          supplierId: group.supplierId,
          supplierName: group.supplierName,
          totalAmount: group.grossAmount,
          currency: "CNY",
          rebateAmount: 0,
          netAmount: group.payableAmount,
          offsetAmount: group.tailPaidAmount + group.depositDeduction,
          consumptionIds: JSON.stringify(group.orderIds),
          status: "Draft",
          createdBy: "系统（拿货自动生成）",
          notes,
        },
      });
      result.created += 1;
    }
  }

  for (const bill of existingBills) {
    const key = `${bill.supplierId || ""}\t${bill.month}`;
    if (
      bill.status !== "Draft" ||
      activeKeys.has(key) ||
      !isSystemGenerated(bill) ||
      parseIds(bill.consumptionIds).length === 0
    ) {
      continue;
    }
    await prisma.monthlyBill.update({
      where: { id: bill.id },
      data: {
        totalAmount: 0,
        netAmount: 0,
        consumptionIds: "[]",
        notes: `系统自动重算：${bill.month} 当前无待付款拿货单`,
      },
    });
    result.cleared += 1;
  }

  if (result.created || result.updated || result.cleared) {
    await clearCacheByPrefix("monthly-bills");
  }
  return result;
}

export async function syncLogisticsMonthlyBills(): Promise<BillSyncResult> {
  const result = emptyResult();
  const [costs, existingBills] = await Promise.all([
    prisma.logisticsCost.findMany({
      include: {
        logisticsChannel: true,
        outboundBatch: { select: { shippedDate: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.monthlyBill.findMany({
      where: { billType: "物流", billCategory: "Payable" },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const settledCostIds = new Set(
    existingBills
      .filter((bill) => bill.status !== "Draft")
      .flatMap((bill) => parseIds(bill.consumptionIds))
  );
  const legacyLockedBills = existingBills.filter(
    (bill) =>
      bill.status !== "Draft" && parseIds(bill.consumptionIds).length === 0
  );
  const groups = calculateLogisticsBillGroups(
    costs
      .filter((cost) => !settledCostIds.has(cost.id))
      .map((cost) => ({
        id: cost.id,
        amount: cost.amount,
        currency: cost.currency,
        paymentStatus: cost.paymentStatus,
        dueDate: cost.dueDate,
        createdAt: cost.createdAt,
        logisticsChannelId: cost.logisticsChannelId,
        logisticsChannelName: cost.logisticsChannel?.name || null,
        outboundShippedDate: cost.outboundBatch?.shippedDate || null,
      }))
  );
  result.groups = groups.length;

  const activeKeys = new Set<string>();

  for (const group of groups) {
    const key = `${group.channelId}\t${group.month}\t${group.currency}`;
    activeKeys.add(key);
    const matchesGroup = (bill: (typeof existingBills)[number]) => {
      if (bill.month !== group.month || bill.currency !== group.currency) return false;
      return (
        bill.supplierId === group.channelId ||
        bill.supplierName === group.channelName ||
        Boolean(bill.notes?.includes(group.channelName))
      );
    };
    const matching = existingBills.filter(matchesGroup);
    const protectedDraft = matching.find(
      (bill) => bill.status === "Draft" && !isSystemGenerated(bill)
    );
    const legacyLocked = legacyLockedBills.some(matchesGroup);
    if (legacyLocked || protectedDraft) {
      result.skippedLocked += 1;
      continue;
    }

    const notes = [
      `系统自动生成：${group.month} 物流月账单 - ${group.channelName}`,
      `费用合计：${group.currency} ${group.grossAmount.toFixed(2)}`,
      `已付金额：${group.currency} ${group.paidAmount.toFixed(2)}`,
      `本期应付：${group.currency} ${group.payableAmount.toFixed(2)}`,
      `关联物流费用：${group.costCount}笔`,
    ].join("\n");
    const data = {
      supplierId: group.channelId === "_no_channel" ? null : group.channelId,
      supplierName: group.channelName,
      totalAmount: group.grossAmount,
      netAmount: group.payableAmount,
      rebateAmount: 0,
      offsetAmount: group.paidAmount,
      consumptionIds: JSON.stringify(group.costIds),
      notes,
      updatedAt: new Date(),
    };

    const draft = matching.find(
      (bill) => bill.status === "Draft" && isSystemGenerated(bill)
    );
    if (draft) {
      await prisma.monthlyBill.update({ where: { id: draft.id }, data });
      result.updated += 1;
    } else if (group.payableAmount > 0) {
      await prisma.monthlyBill.create({
        data: {
          month: group.month,
          billCategory: "Payable",
          billType: "物流",
          supplierId: group.channelId === "_no_channel" ? null : group.channelId,
          supplierName: group.channelName,
          totalAmount: group.grossAmount,
          currency: group.currency,
          rebateAmount: 0,
          netAmount: group.payableAmount,
          offsetAmount: group.paidAmount,
          consumptionIds: JSON.stringify(group.costIds),
          status: "Draft",
          createdBy: "系统（物流费用自动生成）",
          notes,
        },
      });
      result.created += 1;
    }
  }

  for (const bill of existingBills) {
    if (bill.status !== "Draft" || !isSystemGenerated(bill)) continue;
    const ids = parseIds(bill.consumptionIds);
    if (ids.length === 0) continue;
    const inferredChannel = bill.supplierId || "_no_channel";
    const key = `${inferredChannel}\t${bill.month}\t${bill.currency}`;
    if (activeKeys.has(key)) continue;
    await prisma.monthlyBill.update({
      where: { id: bill.id },
      data: {
        totalAmount: 0,
        netAmount: 0,
        consumptionIds: "[]",
        notes: `系统自动重算：${bill.month} 当前无待付款物流费用`,
      },
    });
    result.cleared += 1;
  }

  if (result.created || result.updated || result.cleared) {
    await clearCacheByPrefix("monthly-bills");
  }
  return result;
}
