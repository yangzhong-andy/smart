/**
 * 通用付款申请数据存储
 * 
 * 使用场景：
 * - 用于特殊付款申请，如采购合同定金、店铺相关支出等
 * - 通常由财务人员或采购人员发起，需要老板审批
 * 
 * 与 ExpenseRequest 的区别：
 * - ExpenseRequest：用于广告、物流、采购同事发起的日常运营支出申请（如广告费、物流费、采购费等）
 * - PaymentRequest：用于特殊付款申请，通常与采购合同、店铺运营等特定业务场景相关
 */

import { BillStatus } from "./reconciliation-store";

export type PaymentRequest = {
  id: string;
  
  // 申请信息
  expenseItem: string; // 支出项目
  amount: number; // 金额
  currency: "CNY" | "RMB" | "USD" | "JPY" | "EUR" | "GBP" | "HKD" | "SGD" | "AUD"; // 币种（与BankAccount保持一致，CNY 和 RMB 都支持）
  storeId?: string; // 所属店铺ID（可选）
  storeName?: string; // 所属店铺名称（冗余字段）
  country?: string; // 所属国家（可选）
  category: string; // 支出分类（用于财务看板统计）
  
  // 凭证（支持多图）
  approvalDocument?: string | string[]; // 老板签字申请单（Base64或URL，支持多图）
  paymentReceipt?: string | string[]; // 转账截图（Base64或URL，支持多图）
  
  // 状态机（复用审批流状态）
  status: BillStatus; // 申请状态
  
  // 审批信息
  createdBy: string; // 创建人（财务人员）
  createdAt: string; // 创建时间
  submittedAt?: string; // 提交审批时间
  approvedBy?: string; // 审批人（老板）
  approvedAt?: string; // 审批时间
  rejectionReason?: string; // 退回原因（如果被退回）
  
  // 付款信息
  paidBy?: string; // 付款人（出纳）
  paidAt?: string; // 付款时间
  paymentAccountId?: string; // 出款账户ID
  paymentAccountName?: string; // 出款账户名称（冗余字段）
  paymentFlowId?: string; // 关联的财务流水ID
  
  // 备注
  notes?: string; // 备注信息
};

/**
 * 获取所有付款申请
 */
export async function getPaymentRequests(): Promise<PaymentRequest[]> {
  try {
    const response = await fetch("/api/payment-requests?page=1&pageSize=500");
    if (!response.ok) {
      throw new Error("Failed to fetch payment requests");
    }
    const json = await response.json();
    const requests = Array.isArray(json) ? json : (json?.data ?? []);
    return requests.map((req: any) => ({
      ...req,
      createdAt: req.createdAt ? new Date(req.createdAt).toISOString() : req.createdAt,
      submittedAt: req.submittedAt ? new Date(req.submittedAt).toISOString() : req.submittedAt,
      approvedAt: req.approvedAt ? new Date(req.approvedAt).toISOString() : req.approvedAt,
      paidAt: req.paidAt ? new Date(req.paidAt).toISOString() : req.paidAt,
    }));
  } catch (error) {
    console.error("Error fetching payment requests:", error);
    return [];
  }
}

/**
 * 根据ID获取付款申请
 */
export async function getPaymentRequestById(id: string): Promise<PaymentRequest | undefined> {
  try {
    const response = await fetch(`/api/payment-requests/${id}`);
    if (!response.ok) {
      if (response.status === 404) return undefined;
      throw new Error("Failed to fetch payment request");
    }
    const request = await response.json();
    // 转换日期字段为字符串
    return {
      ...request,
      createdAt: request.createdAt ? new Date(request.createdAt).toISOString() : request.createdAt,
      submittedAt: request.submittedAt ? new Date(request.submittedAt).toISOString() : request.submittedAt,
      approvedAt: request.approvedAt ? new Date(request.approvedAt).toISOString() : request.approvedAt,
      paidAt: request.paidAt ? new Date(request.paidAt).toISOString() : request.paidAt,
    };
  } catch (error) {
    console.error("Error fetching payment request:", error);
    return undefined;
  }
}

/**
 * 根据状态获取付款申请列表
 */
export async function getPaymentRequestsByStatus(status: BillStatus): Promise<PaymentRequest[]> {
  try {
    const response = await fetch(`/api/payment-requests?status=${status}&page=1&pageSize=500`);
    if (!response.ok) {
      throw new Error("Failed to fetch payment requests");
    }
    const json = await response.json();
    const requests = Array.isArray(json) ? json : (json?.data ?? []);
    return requests.map((req: any) => ({
      ...req,
      createdAt: req.createdAt ? new Date(req.createdAt).toISOString() : req.createdAt,
      submittedAt: req.submittedAt ? new Date(req.submittedAt).toISOString() : req.submittedAt,
      approvedAt: req.approvedAt ? new Date(req.approvedAt).toISOString() : req.approvedAt,
      paidAt: req.paidAt ? new Date(req.paidAt).toISOString() : req.paidAt,
    }));
  } catch (error) {
    console.error("Error fetching payment requests by status:", error);
    return [];
  }
}

/**
 * 创建付款申请
 */
export async function createPaymentRequest(request: Omit<PaymentRequest, "id">): Promise<PaymentRequest> {
  try {
    const response = await fetch("/api/payment-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error("Failed to create payment request");
    }
    const created = await response.json();
    // 转换日期字段为字符串
    return {
      ...created,
      createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : created.createdAt,
      submittedAt: created.submittedAt ? new Date(created.submittedAt).toISOString() : created.submittedAt,
      approvedAt: created.approvedAt ? new Date(created.approvedAt).toISOString() : created.approvedAt,
      paidAt: created.paidAt ? new Date(created.paidAt).toISOString() : created.paidAt,
    };
  } catch (error) {
    console.error("Error creating payment request:", error);
    throw error;
  }
}

/**
 * 更新付款申请
 */
export async function updatePaymentRequest(id: string, request: Partial<PaymentRequest>): Promise<PaymentRequest> {
  try {
    const response = await fetch(`/api/payment-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error("Failed to update payment request");
    }
    const updated = await response.json();
    // 转换日期字段为字符串
    return {
      ...updated,
      createdAt: updated.createdAt ? new Date(updated.createdAt).toISOString() : updated.createdAt,
      submittedAt: updated.submittedAt ? new Date(updated.submittedAt).toISOString() : updated.submittedAt,
      approvedAt: updated.approvedAt ? new Date(updated.approvedAt).toISOString() : updated.approvedAt,
      paidAt: updated.paidAt ? new Date(updated.paidAt).toISOString() : updated.paidAt,
    };
  } catch (error) {
    console.error("Error updating payment request:", error);
    throw error;
  }
}

/**
 * 保存付款申请列表（批量更新，用于兼容旧代码）
 * 注意：此函数会逐个更新每个申请，建议直接使用 updatePaymentRequest
 */
export async function savePaymentRequests(requests: PaymentRequest[]): Promise<void> {
  try {
    // 批量更新所有申请
    await Promise.all(
      requests.map((request) => updatePaymentRequest(request.id, request))
    );
  } catch (error) {
    console.error("Error saving payment requests:", error);
    throw error;
  }
}

/**
 * 获取待审批付款申请数量（包括月账单和付款申请）
 */
export async function getTotalPendingApprovalCount(): Promise<number> {
  try {
    const reconciliationStore = await import("./reconciliation-store");
    const bills = await reconciliationStore.getBillsByStatus("Pending_Approval");
    const requests = await getPaymentRequestsByStatus("Pending_Approval");
    return bills.length + requests.length;
  } catch (error) {
    console.error("Error getting total pending approval count:", error);
    return 0;
  }
}
