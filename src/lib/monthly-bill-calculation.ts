const toCents = (value: unknown) => Math.round((Number(value) || 0) * 100);

const fromCents = (value: number) => value / 100;

const monthOf = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
};

export type SupplierBillOrder = {
  id: string;
  deliveryNumber: string;
  contractId: string;
  qty: number;
  tailAmount: unknown;
  tailPaid: unknown;
  depositDeduction?: unknown;
  settlementCoverage?: unknown;
  tailDueDate: Date | string | null;
  createdAt: Date | string;
  status?: string | null;
  contract: {
    supplierId: string | null;
    supplierName: string;
    totalQty: number;
    pickedQty: number;
    depositPaid: unknown;
  };
};

export type SupplierBillGroup = {
  key: string;
  supplierId: string;
  supplierName: string;
  month: string;
  orderIds: string[];
  orderCount: number;
  quantity: number;
  grossAmount: number;
  tailPaidAmount: number;
  depositDeduction: number;
  payableAmount: number;
  lines: Array<{
    deliveryNumber: string;
    quantity: number;
    grossAmount: number;
    tailPaidAmount: number;
  }>;
};

/**
 * Supplier bills are grouped by tail due month. A paid contract deposit is
 * deducted once, in the month containing the contract's final delivery.
 */
export function calculateSupplierBillGroups(
  orders: SupplierBillOrder[]
): SupplierBillGroup[] {
  const eligible = orders.filter(
    (order) =>
      order.status !== "CANCELLED" &&
      Boolean(order.contract.supplierId) &&
      Boolean(monthOf(order.tailDueDate))
  );

  const finalOrderByContract = new Map<string, SupplierBillOrder>();
  for (const order of eligible) {
    if (order.contract.pickedQty < order.contract.totalQty) continue;
    const current = finalOrderByContract.get(order.contractId);
    const currentTime = current ? new Date(current.createdAt).getTime() : -1;
    const orderTime = new Date(order.createdAt).getTime();
    if (
      !current ||
      orderTime > currentTime ||
      (orderTime === currentTime && order.id.localeCompare(current.id) > 0)
    ) {
      finalOrderByContract.set(order.contractId, order);
    }
  }

  type WorkingGroup = Omit<
    SupplierBillGroup,
    "grossAmount" | "tailPaidAmount" | "depositDeduction" | "payableAmount"
  > & {
    grossCents: number;
    tailPaidCents: number;
    depositCents: number;
  };

  const groups = new Map<string, WorkingGroup>();
  for (const order of eligible) {
    const supplierId = order.contract.supplierId!;
    const month = monthOf(order.tailDueDate)!;
    const key = `${supplierId}\t${month}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        supplierId,
        supplierName: order.contract.supplierName || "未知供应商",
        month,
        orderIds: [],
        orderCount: 0,
        quantity: 0,
        lines: [],
        grossCents: 0,
        tailPaidCents: 0,
        depositCents: 0,
      };
      groups.set(key, group);
    }

    const grossCents = Math.max(0, toCents(order.tailAmount));
    const paidCents = Math.max(0, Math.min(grossCents, toCents(order.tailPaid)));
    const explicitDepositCents = Math.max(
      0,
      Math.min(grossCents - paidCents, toCents(order.depositDeduction))
    );
    group.orderIds.push(order.id);
    group.orderCount += 1;
    group.quantity += Math.max(0, Number(order.qty) || 0);
    group.grossCents += grossCents;
    group.tailPaidCents += paidCents;
    group.lines.push({
      deliveryNumber: order.deliveryNumber,
      quantity: Math.max(0, Number(order.qty) || 0),
      grossAmount: fromCents(grossCents),
      tailPaidAmount: fromCents(paidCents),
    });

    if (explicitDepositCents > 0) {
      group.depositCents += explicitDepositCents;
    } else if (finalOrderByContract.get(order.contractId)?.id === order.id) {
      const orderUnpaidCents = Math.max(0, grossCents - paidCents);
      group.depositCents += Math.min(
        orderUnpaidCents,
        Math.max(0, toCents(order.contract.depositPaid))
      );
    }
  }

  return Array.from(groups.values()).map((group) => {
    const unpaidBeforeDeposit = Math.max(0, group.grossCents - group.tailPaidCents);
    const depositCents = Math.min(unpaidBeforeDeposit, group.depositCents);
    return {
      key: group.key,
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      month: group.month,
      orderIds: group.orderIds,
      orderCount: group.orderCount,
      quantity: group.quantity,
      grossAmount: fromCents(group.grossCents),
      tailPaidAmount: fromCents(group.tailPaidCents),
      depositDeduction: fromCents(depositCents),
      payableAmount: fromCents(unpaidBeforeDeposit - depositCents),
      lines: group.lines,
    };
  });
}

export type LogisticsBillCost = {
  id: string;
  amount: unknown;
  currency: string;
  paymentStatus: string;
  dueDate: Date | string | null;
  createdAt: Date | string;
  logisticsChannelId: string | null;
  logisticsChannelName: string | null;
  outboundShippedDate: Date | string | null;
};

export type LogisticsBillGroup = {
  key: string;
  channelId: string;
  channelName: string;
  month: string;
  currency: string;
  costIds: string[];
  costCount: number;
  grossAmount: number;
  paidAmount: number;
  payableAmount: number;
};

const isPaid = (status: string) =>
  ["已付", "已支付", "Paid"].includes(String(status || "").trim());

export function calculateLogisticsBillGroups(
  costs: LogisticsBillCost[]
): LogisticsBillGroup[] {
  type WorkingGroup = Omit<
    LogisticsBillGroup,
    "grossAmount" | "paidAmount" | "payableAmount"
  > & { grossCents: number; paidCents: number };
  const groups = new Map<string, WorkingGroup>();

  for (const cost of costs) {
    const month =
      monthOf(cost.outboundShippedDate) || monthOf(cost.dueDate) || monthOf(cost.createdAt);
    if (!month) continue;
    const channelId = cost.logisticsChannelId || "_no_channel";
    const channelName = cost.logisticsChannelName || "未关联物流渠道";
    const currency = String(cost.currency || "CNY").toUpperCase();
    const key = `${channelId}\t${month}\t${currency}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        channelId,
        channelName,
        month,
        currency,
        costIds: [],
        costCount: 0,
        grossCents: 0,
        paidCents: 0,
      };
      groups.set(key, group);
    }
    const amountCents = Math.max(0, toCents(cost.amount));
    group.costIds.push(cost.id);
    group.costCount += 1;
    group.grossCents += amountCents;
    if (isPaid(cost.paymentStatus)) group.paidCents += amountCents;
  }

  return Array.from(groups.values()).map((group) => ({
    key: group.key,
    channelId: group.channelId,
    channelName: group.channelName,
    month: group.month,
    currency: group.currency,
    costIds: group.costIds,
    costCount: group.costCount,
    grossAmount: fromCents(group.grossCents),
    paidAmount: fromCents(group.paidCents),
    payableAmount: fromCents(Math.max(0, group.grossCents - group.paidCents)),
  }));
}
