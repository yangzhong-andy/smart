/**
 * 支出和收入申请数据存储
 * 管理支出和收入的审批流程
 * 已迁移到数据库，使用 API 调用
 * 
 * ExpenseRequest（支出申请）使用场景：
 * - 统一用于所有部门的支出申请（广告、物流、采购、财务等）
 * - 通过 departmentId 字段控制各部门的付款权限
 * - 常见类型：广告费、物流费、采购费、运营费用、采购合同定金、店铺相关支出等
 * - 审批流程：发起人（各部门同事） → 主管审批 → 财务处理
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
  
  // 店铺相关字段（从 PaymentRequest 合并）
  storeId?: string; // 所属店铺ID
  storeName?: string; // 所属店铺名称（冗余）
  country?: string; // 所属国家
  
  // 部门权限控制
  departmentId?: string; // 发起部门ID（用于权限控制）
  departmentName?: string; // 发起部门名称（冗余）
  
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

// ========== 支出申请 ==========

export async function getExpenseRequests(): Promise<ExpenseRequest[]> {
  try {
    const response = await fetch('/api/expense-requests');
    if (!response.ok) {
      throw new Error('Failed to fetch expense requests');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching expense requests:', error);
    return [];
  }
}

export async function getExpenseRequestById(id: string): Promise<ExpenseRequest | undefined> {
  try {
    const response = await fetch(`/api/expense-requests/${id}`);
    if (!response.ok) {
      return undefined;
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching expense request:', error);
    return undefined;
  }
}

export async function getExpenseRequestsByStatus(status: RequestStatus): Promise<ExpenseRequest[]> {
  try {
    const response = await fetch(`/api/expense-requests?status=${status}`);
    if (!response.ok) {
      throw new Error('Failed to fetch expense requests by status');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching expense requests by status:', error);
    return [];
  }
}

export async function createExpenseRequest(request: ExpenseRequest): Promise<ExpenseRequest> {
  try {
    const response = await fetch('/api/expense-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create expense request');
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating expense request:', error);
    throw error;
  }
}

export async function updateExpenseRequest(id: string, updates: Partial<ExpenseRequest>): Promise<void> {
  try {
    const response = await fetch(`/api/expense-requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update expense request');
    }
  } catch (error) {
    console.error('Error updating expense request:', error);
    throw error;
  }
}

// ========== 收入申请 ==========

export async function getIncomeRequests(): Promise<IncomeRequest[]> {
  try {
    const response = await fetch('/api/income-requests');
    if (!response.ok) {
      throw new Error('Failed to fetch income requests');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching income requests:', error);
    return [];
  }
}

export async function getIncomeRequestById(id: string): Promise<IncomeRequest | undefined> {
  try {
    const response = await fetch(`/api/income-requests/${id}`);
    if (!response.ok) {
      return undefined;
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching income request:', error);
    return undefined;
  }
}

export async function getIncomeRequestsByStatus(status: RequestStatus): Promise<IncomeRequest[]> {
  try {
    const response = await fetch(`/api/income-requests?status=${status}`);
    if (!response.ok) {
      throw new Error('Failed to fetch income requests by status');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching income requests by status:', error);
    return [];
  }
}

export async function createIncomeRequest(request: IncomeRequest): Promise<IncomeRequest> {
  try {
    const response = await fetch('/api/income-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create income request');
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating income request:', error);
    throw error;
  }
}

export async function updateIncomeRequest(id: string, updates: Partial<IncomeRequest>): Promise<void> {
  try {
    const response = await fetch(`/api/income-requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update income request');
    }
  } catch (error) {
    console.error('Error updating income request:', error);
    throw error;
  }
}

// ========== 通用函数 ==========

export async function getPendingApprovalCount(): Promise<number> {
  try {
    const expenseRequests = await getExpenseRequestsByStatus("Pending_Approval");
    const incomeRequests = await getIncomeRequestsByStatus("Pending_Approval");
    return expenseRequests.length + incomeRequests.length;
  } catch (error) {
    console.error('Error getting pending approval count:', error);
    return 0;
  }
}

export async function getPendingFinanceCount(): Promise<number> {
  try {
    const expenseRequests = await getExpenseRequestsByStatus("Approved");
    const incomeRequests = await getIncomeRequestsByStatus("Approved");
    return expenseRequests.length + incomeRequests.length;
  } catch (error) {
    console.error('Error getting pending finance count:', error);
    return 0;
  }
}
