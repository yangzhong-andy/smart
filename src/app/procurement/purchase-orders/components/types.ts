import type { PurchaseContract } from "@/lib/purchase-contracts-store";

export type { PurchaseContract };

export type Supplier = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  depositRate: number;
  tailPeriodDays: number;
  settleBase: "发货" | "入库";
};

export type FormItemRow = {
  tempId: string;
  productId: string;
  sku: string;
  skuName: string;
  spec: string;
  quantity: string;
  unitPrice: string;
};

export type ContractSummary = {
  totalCount: number;
  totalAmount: number;
  totalPaid: number;
  totalOwed: number;
  totalDepositPaid: number;
  totalQty: number;
  totalPickedQty: number;
  avgProgress: number;
};

/** 详情弹窗用的拿货单（仅展示与支付尾款） */
export type DeliveryOrderForDetail = {
  id: string;
  deliveryNumber: string;
  qty: number;
  domesticTrackingNumber?: string;
  tailAmount: number;
  tailPaid: number;
  tailDueDate?: string;
};

export type ContractDetail = {
  contract: PurchaseContract;
  deliveryOrders: DeliveryOrderForDetail[];
};

export const STATUS_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "待审批", label: "待审批" },
  { value: "待发货", label: "待发货" },
  { value: "部分发货", label: "部分发货" },
  { value: "已发货", label: "已发货" },
] as const;

export const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

export const formatDate = (d: string) => new Date(d).toISOString().slice(0, 10);

export function toLocalDateMidnight(isoOrDateStr: string): Date {
  const d = new Date(isoOrDateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function getProductionProgress(
  createdAt: string,
  deliveryDate?: string,
  today: Date = new Date()
): { percent: number; label: string; elapsedDays: number; totalDays: number } | null {
  if (!deliveryDate) return null;
  const start = toLocalDateMidnight(createdAt);
  const end = toLocalDateMidnight(deliveryDate);
  const t = toLocalDateMidnight(today.toISOString());
  const totalMs = end.getTime() - start.getTime();
  const totalDays = Math.max(0, totalMs / (24 * 60 * 60 * 1000));
  if (totalDays <= 0)
    return { percent: 100, label: "已到期", elapsedDays: 0, totalDays: 0 };
  const elapsedMs = t.getTime() - start.getTime();
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);
  if (elapsedDays <= 0)
    return {
      percent: 0,
      label: "未开始",
      elapsedDays: 0,
      totalDays: Math.round(totalDays),
    };
  if (elapsedDays >= totalDays)
    return {
      percent: 100,
      label: "已到期",
      elapsedDays: Math.round(totalDays),
      totalDays: Math.round(totalDays),
    };
  const percent = Math.round((elapsedDays / totalDays) * 100);
  const remaining = Math.ceil(totalDays - elapsedDays);
  return {
    percent,
    label: `剩 ${remaining} 天`,
    elapsedDays: Math.round(elapsedDays),
    totalDays: Math.round(totalDays),
  };
}
