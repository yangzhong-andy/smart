/**
 * 待入账任务数据存储
 * 管理审批通过后需要财务人员处理的入账任务
 */

export type PendingEntryType = "Bill" | "PaymentRequest"; // 账单或付款申请

export type PendingEntryStatus = "Pending" | "Completed" | "Cancelled"; // 待处理、已完成、已取消

export type PendingEntry = {
  id: string;
  type: PendingEntryType; // 类型：账单或付款申请
  relatedId: string; // 关联的账单ID或付款申请ID
  billCategory?: "Payable" | "Receivable"; // 账单分类（仅账单类型）
  billType?: string; // 账单类型（仅账单类型）
  
  // 基本信息
  month?: string; // 账单月份（仅账单类型）
  agencyName?: string; // 代理商名称
  supplierName?: string; // 供应商名称（物流账单）
  factoryName?: string; // 工厂名称（工厂订单）
  accountName?: string; // 账户名称
  expenseItem?: string; // 支出项目（付款申请）
  storeName?: string; // 店铺名称
  
  // 金额信息
  amount: number; // 金额
  currency: "USD" | "CNY" | "HKD"; // 币种
  netAmount: number; // 净金额（应付款或应收款）
  
  // 审批信息
  approvedBy: string; // 审批人
  approvedAt: string; // 审批时间
  
  // 入账信息
  status: PendingEntryStatus; // 状态
  entryAccountId?: string; // 入账账户ID
  entryAccountName?: string; // 入账账户名称
  entryDate?: string; // 入账日期
  entryBy?: string; // 入账人
  entryAt?: string; // 入账时间
  entryFlowId?: string; // 关联的财务流水ID
  
  // 备注
  notes?: string; // 备注
  
  // 元数据
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
};

const PENDING_ENTRIES_KEY = "pendingEntries";

/**
 * 获取所有待入账任务
 */
export function getPendingEntries(): PendingEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(PENDING_ENTRIES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse pending entries", e);
    return [];
  }
}

/**
 * 保存待入账任务列表
 */
export function savePendingEntries(entries: PendingEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_ENTRIES_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error("Failed to save pending entries", e);
  }
}

/**
 * 根据状态获取待入账任务
 */
export function getPendingEntriesByStatus(status: PendingEntryStatus): PendingEntry[] {
  const entries = getPendingEntries();
  return entries.filter((e) => e.status === status);
}

/**
 * 根据关联ID获取待入账任务
 */
export function getPendingEntryByRelatedId(type: PendingEntryType, relatedId: string): PendingEntry | undefined {
  const entries = getPendingEntries();
  return entries.find((e) => e.type === type && e.relatedId === relatedId && e.status === "Pending");
}

/**
 * 创建待入账任务
 */
export function createPendingEntry(entry: Omit<PendingEntry, "id" | "createdAt" | "updatedAt" | "status">): PendingEntry {
  const newEntry: PendingEntry = {
    ...entry,
    id: `pending-entry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    status: "Pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const entries = getPendingEntries();
  entries.push(newEntry);
  savePendingEntries(entries);
  
  return newEntry;
}

/**
 * 完成待入账任务
 */
export function completePendingEntry(
  entryId: string,
  entryAccountId: string,
  entryAccountName: string,
  entryDate: string,
  entryBy: string,
  entryFlowId?: string
): void {
  const entries = getPendingEntries();
  const updatedEntries = entries.map((e) =>
    e.id === entryId
      ? {
          ...e,
          status: "Completed" as PendingEntryStatus,
          entryAccountId,
          entryAccountName,
          entryDate,
          entryBy,
          entryAt: new Date().toISOString(),
          entryFlowId,
          updatedAt: new Date().toISOString()
        }
      : e
  );
  savePendingEntries(updatedEntries);
}

/**
 * 取消待入账任务
 */
export function cancelPendingEntry(entryId: string): void {
  const entries = getPendingEntries();
  const updatedEntries = entries.map((e) =>
    e.id === entryId
      ? {
          ...e,
          status: "Cancelled" as PendingEntryStatus,
          updatedAt: new Date().toISOString()
        }
      : e
  );
  savePendingEntries(updatedEntries);
}

/**
 * 获取待入账任务数量
 */
export function getPendingEntryCount(): number {
  return getPendingEntriesByStatus("Pending").length;
}
