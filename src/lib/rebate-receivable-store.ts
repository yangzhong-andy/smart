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

/**
 * 保存返点应收款列表（全量同步）
 * 对比现有数据，执行新增/更新/删除
 */
export async function saveRebateReceivables(receivables: RebateReceivable[]): Promise<void> {
  if (typeof window === "undefined") return;
  
  try {
    // 获取现有数据
    const existing = await getRebateReceivables();
    const existingIds = new Set(existing.map((r) => r.id));
    const newIds = new Set(receivables.map((r) => r.id));
    
    // 删除不在新列表中的记录
    for (const e of existing) {
      if (!newIds.has(e.id)) {
        await fetch(`/api/rebate-receivables/${e.id}`, { method: "DELETE" });
      }
    }
    
    // 新增或更新
    for (const r of receivables) {
      const body = {
        ...r,
        writeoffRecords: r.writeoffRecords || [],
        adjustments: r.adjustments || []
      };
      
      if (existingIds.has(r.id)) {
        // 更新
        await fetch(`/api/rebate-receivables/${r.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      } else {
        // 新增
        await fetch("/api/rebate-receivables", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      }
    }
  } catch (e) {
    console.error("Failed to save rebate receivables", e);
    throw e;
  }
}

/**
 * 更新单条返点应收款
 */
export async function updateRebateReceivable(id: string, data: Partial<RebateReceivable>): Promise<void> {
  const res = await fetch(`/api/rebate-receivables/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`更新返点应收款失败: ${res.status}`);
}
