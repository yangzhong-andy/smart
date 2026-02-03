/**
 * 收支流水数据存储
 * 统一管理 cashFlow 的 API 访问
 */

export type CashFlowType = "income" | "expense" | "transfer";
export type CashFlowStatus = "pending" | "confirmed";

export type CashFlow = {
  id: string;
  uid?: string;
  date: string;
  summary: string;
  category: string;
  type: CashFlowType;
  amount: number;
  accountId: string;
  accountName: string;
  currency: string;
  remark?: string;
  relatedId?: string;
  businessNumber?: string;
  status?: CashFlowStatus;
  isReversal?: boolean;
  reversedById?: string;
  voucher?: string | string[];
  paymentVoucher?: string | string[]; // 付款凭证（发起付款时）
  transferVoucher?: string | string[]; // 转账成功凭证（财务打款后）
  createdAt: string;
};

const CASH_FLOW_KEY = "cashFlow";

/** 从 localStorage 获取（向后兼容） */
export function getCashFlow(): CashFlow[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(CASH_FLOW_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse cash flow", e);
    return [];
  }
}

/** 从 API 获取流水列表 */
export async function getCashFlowFromAPI(params?: {
  accountId?: string;
  type?: CashFlowType;
  dateFrom?: string;
  dateTo?: string;
}): Promise<CashFlow[]> {
  if (typeof window === "undefined") return [];
  try {
    const query = new URLSearchParams();
    if (params?.accountId) query.set("accountId", params.accountId);
    if (params?.type) query.set("type", params.type);
    if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params?.dateTo) query.set("dateTo", params.dateTo);
    const url = query.toString() ? `/api/cash-flow?${query}` : "/api/cash-flow";
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch cash flow", e);
    return [];
  }
}

/** 保存流水列表（全量同步到 API） */
export async function saveCashFlow(items: CashFlow[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const existing = await getCashFlowFromAPI();
    const existingIds = new Set(existing.map((i) => i.id));
    const newIds = new Set(items.map((i) => i.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) {
        await fetch(`/api/cash-flow/${e.id}`, { method: "DELETE" });
      }
    }
    for (const i of items) {
      if (existingIds.has(i.id)) {
        await fetch(`/api/cash-flow/${i.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(i)
        });
      } else {
        await fetch("/api/cash-flow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(i)
        });
      }
    }
  } catch (e) {
    console.error("Failed to save cash flow", e);
    throw e;
  }
}

/** 创建单条流水（同步到 API） */
export async function createCashFlow(item: Omit<CashFlow, "id" | "createdAt">): Promise<CashFlow> {
  const newItem: CashFlow = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  const res = await fetch("/api/cash-flow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newItem)
  });
  if (!res.ok) throw new Error("Failed to create cash flow");
  return await res.json();
}

/** 更新单条流水 */
export async function updateCashFlow(id: string, data: Partial<CashFlow>): Promise<void> {
  const res = await fetch(`/api/cash-flow/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Failed to update cash flow");
}

/** 删除单条流水 */
export async function deleteCashFlow(id: string): Promise<boolean> {
  const res = await fetch(`/api/cash-flow/${id}`, { method: "DELETE" });
  return res.ok;
}

/** 追加一条流水到 localStorage（向后兼容，用于迁移过渡） */
export function appendCashFlowToLocal(item: CashFlow): void {
  if (typeof window === "undefined") return;
  const list = getCashFlow();
  list.push(item);
  window.localStorage.setItem(CASH_FLOW_KEY, JSON.stringify(list));
}
