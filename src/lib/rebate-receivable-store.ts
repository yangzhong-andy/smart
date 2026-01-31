/**
 * 返点应收款数据存储
 * 已迁移到数据库，使用 API 调用
 */

export type RebateReceivableStatus = "待核销" | "核销中" | "已结清";

export type RebateReceivable = {
  id: string;
  rechargeId: string;
  rechargeDate: string;
  agencyId: string;
  agencyName: string;
  adAccountId: string;
  accountName: string;
  platform: string;
  rebateAmount: number;
  currency: string;
  currentBalance: number;
  status: RebateReceivableStatus;
  writeoffRecords: Array<{
    id: string;
    consumptionId: string;
    consumptionDate: string;
    writeoffAmount: number;
    remainingBalance: number;
    createdAt: string;
  }>;
  adjustments: Array<{
    id: string;
    amount: number;
    reason: string;
    adjustedBy: string;
    adjustedAt: string;
    balanceBefore: number;
    balanceAfter: number;
  }>;
  createdAt: string;
  updatedAt: string;
  notes?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API 错误: ${res.status}`);
  return res.json();
}

export async function getRebateReceivables(): Promise<RebateReceivable[]> {
  return fetchJson<RebateReceivable[]>("/api/rebate-receivables");
}

export async function getRebateReceivableById(id: string): Promise<RebateReceivable | undefined> {
  try {
    return await fetchJson<RebateReceivable>(`/api/rebate-receivables/${id}`);
  } catch {
    return undefined;
  }
}

export async function getRebateReceivableByRechargeId(rechargeId: string): Promise<RebateReceivable | undefined> {
  const list = await fetchJson<RebateReceivable[]>(`/api/rebate-receivables?rechargeId=${encodeURIComponent(rechargeId)}`);
  return list[0];
}

export async function getRebateReceivablesByAccount(accountId: string): Promise<RebateReceivable[]> {
  return fetchJson<RebateReceivable[]>(`/api/rebate-receivables?adAccountId=${encodeURIComponent(accountId)}`);
}

export async function getRebateReceivablesByStatus(status: RebateReceivableStatus): Promise<RebateReceivable[]> {
  return fetchJson<RebateReceivable[]>(`/api/rebate-receivables?status=${encodeURIComponent(status)}`);
}

export function getTotalUnsettledRebates(): {
  USD: number;
  CNY: number;
  HKD: number;
} {
  // 同步版本保留用于兼容，实际应从 API 获取后计算
  return { USD: 0, CNY: 0, HKD: 0 };
}

export async function getTotalUnsettledRebatesAsync(): Promise<{ USD: number; CNY: number; HKD: number }> {
  const receivables = await getRebateReceivables();
  const totals = { USD: 0, CNY: 0, HKD: 0 };
  receivables
    .filter((r) => r.status !== "已结清" && r.currentBalance > 0)
    .forEach((r) => {
      if (r.currency === "USD") totals.USD += r.currentBalance;
      else if (r.currency === "CNY") totals.CNY += r.currentBalance;
      else if (r.currency === "HKD") totals.HKD += r.currentBalance;
    });
  return totals;
}
