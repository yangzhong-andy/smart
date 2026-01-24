/**
 * 支出和收入申请数据存储
 * 管理支出和收入的审批流程
 */

export type RequestStatus = "Draft" | "Pending_Approval" | "Approved" | "Rejected" | "Paid" | "Received";

export type ExpenseRequest = {
  id: string;
  uid?: string; // 全局唯一业务ID
  
  // 申请信息
  date: string; // 日期
  summary: string; // 摘要
  category: string; // 支出分类
  amount: number; // 金额
  currency: string; // 币种
  businessNumber?: string; // 关联单号
  relatedId?: string; // 关联的业务ID
  remark?: string; // 备注
  voucher?: string | string[]; // 凭证
  
  // 状态机
  status: RequestStatus;
  
  // 审批信息
  createdBy: string; // 发起人
  createdAt: string; // 创建时间
  submittedAt?: string; // 提交审批时间
  approvedBy?: string; // 主管审批人
  approvedAt?: string; // 主管审批时间
  rejectionReason?: string; // 退回原因
  
  // 财务处理信息
  financeAccountId?: string; // 财务选择的账户ID
  financeAccountName?: string; // 财务选择的账户名称（冗余）
  paidBy?: string; // 付款人（财务）
  paidAt?: string; // 付款时间
  paymentFlowId?: string; // 关联的财务流水ID
  paymentVoucher?: string | string[]; // 付款凭证
  
  // 特殊字段（广告充值等）
  adAccountId?: string; // 广告账户ID
  rebateAmount?: number; // 返点金额
};

export type IncomeRequest = {
  id: string;
  uid?: string; // 全局唯一业务ID
  
  // 申请信息
  date: string; // 日期
  summary: string; // 摘要
  category: string; // 收入分类
  amount: number; // 金额
  currency: string; // 币种
  storeId?: string; // 所属店铺ID
  storeName?: string; // 所属店铺名称（冗余）
  remark?: string; // 备注
  voucher?: string | string[]; // 凭证
  
  // 状态机
  status: RequestStatus;
  
  // 审批信息
  createdBy: string; // 发起人
  createdAt: string; // 创建时间
  submittedAt?: string; // 提交审批时间
  approvedBy?: string; // 主管审批人
  approvedAt?: string; // 主管审批时间
  rejectionReason?: string; // 退回原因
  
  // 财务处理信息
  financeAccountId?: string; // 财务选择的账户ID
  financeAccountName?: string; // 财务选择的账户名称（冗余）
  receivedBy?: string; // 收款人（财务）
  receivedAt?: string; // 收款时间
  paymentFlowId?: string; // 关联的财务流水ID
  paymentVoucher?: string | string[]; // 收款凭证
};

const EXPENSE_REQUESTS_KEY = "expenseRequests";
const INCOME_REQUESTS_KEY = "incomeRequests";

// ========== 支出申请 ==========

export function getExpenseRequests(): ExpenseRequest[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(EXPENSE_REQUESTS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function saveExpenseRequests(requests: ExpenseRequest[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EXPENSE_REQUESTS_KEY, JSON.stringify(requests));
}

export function getExpenseRequestById(id: string): ExpenseRequest | undefined {
  const requests = getExpenseRequests();
  return requests.find((r) => r.id === id);
}

export function getExpenseRequestsByStatus(status: RequestStatus): ExpenseRequest[] {
  const requests = getExpenseRequests();
  return requests.filter((r) => r.status === status);
}

export function createExpenseRequest(request: ExpenseRequest): void {
  const requests = getExpenseRequests();
  requests.push(request);
  saveExpenseRequests(requests);
}

export function updateExpenseRequest(id: string, updates: Partial<ExpenseRequest>): void {
  const requests = getExpenseRequests();
  const index = requests.findIndex((r) => r.id === id);
  if (index !== -1) {
    requests[index] = { ...requests[index], ...updates };
    saveExpenseRequests(requests);
  }
}

// ========== 收入申请 ==========

export function getIncomeRequests(): IncomeRequest[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(INCOME_REQUESTS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function saveIncomeRequests(requests: IncomeRequest[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INCOME_REQUESTS_KEY, JSON.stringify(requests));
}

export function getIncomeRequestById(id: string): IncomeRequest | undefined {
  const requests = getIncomeRequests();
  return requests.find((r) => r.id === id);
}

export function getIncomeRequestsByStatus(status: RequestStatus): IncomeRequest[] {
  const requests = getIncomeRequests();
  return requests.filter((r) => r.status === status);
}

export function createIncomeRequest(request: IncomeRequest): void {
  const requests = getIncomeRequests();
  requests.push(request);
  saveIncomeRequests(requests);
}

export function updateIncomeRequest(id: string, updates: Partial<IncomeRequest>): void {
  const requests = getIncomeRequests();
  const index = requests.findIndex((r) => r.id === id);
  if (index !== -1) {
    requests[index] = { ...requests[index], ...updates };
    saveIncomeRequests(requests);
  }
}

// ========== 通用函数 ==========

export function getPendingApprovalCount(): number {
  const expenseRequests = getExpenseRequestsByStatus("Pending_Approval");
  const incomeRequests = getIncomeRequestsByStatus("Pending_Approval");
  return expenseRequests.length + incomeRequests.length;
}

export function getPendingFinanceCount(): number {
  const expenseRequests = getExpenseRequestsByStatus("Approved");
  const incomeRequests = getIncomeRequestsByStatus("Approved");
  return expenseRequests.length + incomeRequests.length;
}
