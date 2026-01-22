/**
 * 通用付款申请数据存储
 * 管理非账单类支出申请
 */

import { BillStatus } from "./reconciliation-store";

export type PaymentRequest = {
  id: string;
  
  // 申请信息
  expenseItem: string; // 支出项目
  amount: number; // 金额
  currency: "USD" | "CNY" | "HKD"; // 币种
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

const PAYMENT_REQUESTS_KEY = "paymentRequests";

/**
 * 获取所有付款申请
 */
export function getPaymentRequests(): PaymentRequest[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(PAYMENT_REQUESTS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * 保存付款申请列表
 */
export function savePaymentRequests(requests: PaymentRequest[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PAYMENT_REQUESTS_KEY, JSON.stringify(requests));
}

/**
 * 根据ID获取付款申请
 */
export function getPaymentRequestById(id: string): PaymentRequest | undefined {
  const requests = getPaymentRequests();
  return requests.find((r) => r.id === id);
}

/**
 * 根据状态获取付款申请列表
 */
export function getPaymentRequestsByStatus(status: BillStatus): PaymentRequest[] {
  const requests = getPaymentRequests();
  return requests.filter((r) => r.status === status);
}

/**
 * 获取待审批付款申请数量（包括月账单和付款申请）
 */
export function getTotalPendingApprovalCount(): number {
  const { getBillsByStatus } = require("./reconciliation-store");
  const bills = getBillsByStatus("Pending_Approval");
  const requests = getPaymentRequestsByStatus("Pending_Approval");
  return bills.length + requests.length;
}
