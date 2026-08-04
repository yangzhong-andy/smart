/**
 * 待入账任务数据存储
 * 已迁移到数据库，使用 API 调用
 */

export type PendingEntryType = "Bill" | "PaymentRequest";
export type PendingEntryStatus = "Pending" | "Completed" | "Cancelled";

export type PendingEntry = {
  id: string;
  type: PendingEntryType;
  relatedId: string;
  billCategory?: "Payable" | "Receivable";
  billType?: string;
  month?: string;
  agencyName?: string;
  supplierName?: string;
  factoryName?: string;
  accountName?: string;
  expenseItem?: string;
  storeName?: string;
  amount: number;
  currency: "USD" | "CNY" | "HKD";
  netAmount: number;
  approvedBy: string;
  approvedAt: string;
  status: PendingEntryStatus;
  entryAccountId?: string;
  entryAccountName?: string;
  entryDate?: string;
  entryBy?: string;
  entryAt?: string;
  entryFlowId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API 错误: ${res.status}`);
  return res.json();
}

export async function getPendingEntries(): Promise<PendingEntry[]> {
  return fetchJson<PendingEntry[]>("/api/pending-entries");
}

export async function getPendingEntriesByStatus(status: PendingEntryStatus): Promise<PendingEntry[]> {
  const entries = await getPendingEntries();
  return entries.filter((e) => e.status === status);
}

export async function getPendingEntryByRelatedId(
  type: PendingEntryType,
  relatedId: string
): Promise<PendingEntry | undefined> {
  const entries = await getPendingEntries();
  return entries.find((e) => e.type === type && e.relatedId === relatedId && e.status === "Pending");
}

export async function createPendingEntry(
  entry: Omit<PendingEntry, "id" | "createdAt" | "updatedAt" | "status">
): Promise<PendingEntry> {
  const res = await fetch("/api/pending-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error("创建失败");
  return res.json();
}

export async function completePendingEntry(
  entryId: string,
  entryAccountId: string,
  entryAccountName: string,
  entryDate: string,
  entryBy: string,
  entryFlowId?: string
): Promise<void> {
  const res = await fetch(`/api/pending-entries/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "Completed",
      entryAccountId,
      entryAccountName,
      entryDate,
      entryBy,
      entryFlowId,
      entryAt: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error("更新失败");
}

export async function cancelPendingEntry(entryId: string): Promise<void> {
  const res = await fetch(`/api/pending-entries/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Cancelled" }),
  });
  if (!res.ok) throw new Error("更新失败");
}

export async function getPendingEntryCount(): Promise<number> {
  const entries = await getPendingEntriesByStatus("Pending");
  return entries.length;
}
