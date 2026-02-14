/**
 * 对账中心数据存储
 * 管理月账单、审批流程等
 */

export type BillStatus = "Draft" | "Pending_Finance_Review" | "Pending_Approval" | "Approved" | "Cashier_Approved" | "Paid";

export type BillCategory = "Payable" | "Receivable"; // 账单分类：应付款/应收款

export type BillType = "广告" | "物流" | "工厂订单" | "店铺回款" | "广告返点" | "其他";

export type MonthlyBill = {
  id: string;
  uid?: string; // 全局唯一业务ID（业财一体化）
  month: string; // 账单月份，格式：YYYY-MM
  billCategory: BillCategory; // 账单分类：应付款/应收款
  billType: BillType; // 账单类型：广告、物流、工厂订单、店铺回款、广告返点等
  agencyId?: string; // 关联代理商ID（可选，广告账单使用）
  agencyName?: string; // 代理商名称（冗余字段，广告账单使用）
  adAccountId?: string; // 关联广告账户ID（可选，广告账单使用）
  accountName?: string; // 广告账户名称（冗余字段，广告账单使用）
  supplierId?: string; // 关联供应商ID（可选，工厂订单账单使用）
  supplierName?: string; // 供应商名称（冗余字段，工厂订单账单使用）
  factoryId?: string; // 关联工厂ID（可选，工厂订单账单使用）
  factoryName?: string; // 工厂名称（冗余字段，工厂订单账单使用）
  
  // 账单明细
  totalAmount: number; // 账单总金额（消耗金额）
  currency: "USD" | "CNY" | "HKD"; // 币种
  rebateAmount: number; // 返点金额
  netAmount: number; // 净金额（应付款：净应付金额；应收款：净应收金额）
  
  // 关联数据
  consumptionIds: string[]; // 关联的消耗记录ID列表
  rechargeIds?: string[]; // 关联的充值记录ID列表（可选）
  
  // 状态机
  status: BillStatus; // 账单状态
  
  // 审批信息
  createdBy: string; // 创建人（部门同事）
  createdAt: string; // 创建时间
  submittedToFinanceAt?: string; // 提交给财务审批时间
  paymentApplicationVoucher?: string | string[]; // 付款申请书凭证（提交给财务审批时上传）
  financeReviewedBy?: string; // 财务审批人
  financeReviewedAt?: string; // 财务审批时间
  submittedAt?: string; // 提交给主管审批时间
  approvedBy?: string; // 审批人（公司主管）
  approvedAt?: string; // 审批时间
  cashierApprovedBy?: string; // 出纳审核人
  cashierApprovedAt?: string; // 出纳审核时间
  rejectionReason?: string; // 退回原因（如果被退回）
  
  // 付款信息
  paidBy?: string; // 付款人（出纳）
  paidAt?: string; // 付款时间
  paymentMethod?: string; // 付款方式
  paymentAccountId?: string; // 付款账户ID
  paymentAccountName?: string; // 付款账户名称
  paymentVoucher?: string | string[]; // 付款凭证（图片URL）
  paymentFlowId?: string; // 关联的财务流水ID
  paymentVoucherNumber?: string; // 付款单号（自动生成）
  paymentRemarks?: string; // 付款备注
  
  // 备注
  notes?: string; // 备注信息
};

/**
 * 获取所有月账单
 */
export async function getMonthlyBills(): Promise<MonthlyBill[]> {
  try {
    const response = await fetch("/api/monthly-bills?page=1&pageSize=500");
    if (!response.ok) {
      throw new Error("Failed to fetch monthly bills");
    }
    const json = await response.json();
    const bills = Array.isArray(json) ? json : (json?.data ?? []);
    return bills.map((bill: any) => ({
      ...bill,
      createdAt: bill.createdAt ? new Date(bill.createdAt).toISOString() : bill.createdAt,
      submittedToFinanceAt: bill.submittedToFinanceAt ? new Date(bill.submittedToFinanceAt).toISOString() : bill.submittedToFinanceAt,
      financeReviewedAt: bill.financeReviewedAt ? new Date(bill.financeReviewedAt).toISOString() : bill.financeReviewedAt,
      submittedAt: bill.submittedAt ? new Date(bill.submittedAt).toISOString() : bill.submittedAt,
      approvedAt: bill.approvedAt ? new Date(bill.approvedAt).toISOString() : bill.approvedAt,
      cashierApprovedAt: bill.cashierApprovedAt ? new Date(bill.cashierApprovedAt).toISOString() : bill.cashierApprovedAt,
      paidAt: bill.paidAt ? new Date(bill.paidAt).toISOString() : bill.paidAt,
    }));
  } catch (error) {
    console.error("Error fetching monthly bills:", error);
    return [];
  }
}

/**
 * 根据ID获取账单
 */
export async function getBillById(id: string): Promise<MonthlyBill | undefined> {
  try {
    const response = await fetch(`/api/monthly-bills/${id}`);
    if (!response.ok) {
      if (response.status === 404) return undefined;
      throw new Error("Failed to fetch monthly bill");
    }
    const bill = await response.json();
    // 转换日期字段为字符串
    return {
      ...bill,
      createdAt: bill.createdAt ? new Date(bill.createdAt).toISOString() : bill.createdAt,
      submittedToFinanceAt: bill.submittedToFinanceAt ? new Date(bill.submittedToFinanceAt).toISOString() : bill.submittedToFinanceAt,
      financeReviewedAt: bill.financeReviewedAt ? new Date(bill.financeReviewedAt).toISOString() : bill.financeReviewedAt,
      submittedAt: bill.submittedAt ? new Date(bill.submittedAt).toISOString() : bill.submittedAt,
      approvedAt: bill.approvedAt ? new Date(bill.approvedAt).toISOString() : bill.approvedAt,
      cashierApprovedAt: bill.cashierApprovedAt ? new Date(bill.cashierApprovedAt).toISOString() : bill.cashierApprovedAt,
      paidAt: bill.paidAt ? new Date(bill.paidAt).toISOString() : bill.paidAt,
    };
  } catch (error) {
    console.error("Error fetching monthly bill:", error);
    return undefined;
  }
}

/**
 * 根据状态获取账单列表
 */
export async function getBillsByStatus(status: BillStatus): Promise<MonthlyBill[]> {
  try {
    const response = await fetch(`/api/monthly-bills?status=${status}&page=1&pageSize=500`);
    if (!response.ok) {
      throw new Error("Failed to fetch monthly bills");
    }
    const json = await response.json();
    const bills = Array.isArray(json) ? json : (json?.data ?? []);
    return bills.map((bill: any) => ({
      ...bill,
      createdAt: bill.createdAt ? new Date(bill.createdAt).toISOString() : bill.createdAt,
      submittedToFinanceAt: bill.submittedToFinanceAt ? new Date(bill.submittedToFinanceAt).toISOString() : bill.submittedToFinanceAt,
      financeReviewedAt: bill.financeReviewedAt ? new Date(bill.financeReviewedAt).toISOString() : bill.financeReviewedAt,
      submittedAt: bill.submittedAt ? new Date(bill.submittedAt).toISOString() : bill.submittedAt,
      approvedAt: bill.approvedAt ? new Date(bill.approvedAt).toISOString() : bill.approvedAt,
      cashierApprovedAt: bill.cashierApprovedAt ? new Date(bill.cashierApprovedAt).toISOString() : bill.cashierApprovedAt,
      paidAt: bill.paidAt ? new Date(bill.paidAt).toISOString() : bill.paidAt,
    }));
  } catch (error) {
    console.error("Error fetching monthly bills by status:", error);
    return [];
  }
}

/**
 * 创建月账单
 */
export async function createMonthlyBill(bill: Omit<MonthlyBill, "id">): Promise<MonthlyBill> {
  try {
    const response = await fetch("/api/monthly-bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bill),
    });
    if (!response.ok) {
      throw new Error("Failed to create monthly bill");
    }
    const created = await response.json();
    // 转换日期字段为字符串
    return {
      ...created,
      createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : created.createdAt,
      submittedToFinanceAt: created.submittedToFinanceAt ? new Date(created.submittedToFinanceAt).toISOString() : created.submittedToFinanceAt,
      financeReviewedAt: created.financeReviewedAt ? new Date(created.financeReviewedAt).toISOString() : created.financeReviewedAt,
      submittedAt: created.submittedAt ? new Date(created.submittedAt).toISOString() : created.submittedAt,
      approvedAt: created.approvedAt ? new Date(created.approvedAt).toISOString() : created.approvedAt,
      cashierApprovedAt: created.cashierApprovedAt ? new Date(created.cashierApprovedAt).toISOString() : created.cashierApprovedAt,
      paidAt: created.paidAt ? new Date(created.paidAt).toISOString() : created.paidAt,
    };
  } catch (error) {
    console.error("Error creating monthly bill:", error);
    throw error;
  }
}

/**
 * 更新月账单
 */
export async function updateMonthlyBill(id: string, bill: Partial<MonthlyBill>): Promise<MonthlyBill> {
  try {
    const response = await fetch(`/api/monthly-bills/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bill),
    });
    if (!response.ok) {
      throw new Error("Failed to update monthly bill");
    }
    const updated = await response.json();
    // 转换日期字段为字符串
    return {
      ...updated,
      createdAt: updated.createdAt ? new Date(updated.createdAt).toISOString() : updated.createdAt,
      submittedToFinanceAt: updated.submittedToFinanceAt ? new Date(updated.submittedToFinanceAt).toISOString() : updated.submittedToFinanceAt,
      financeReviewedAt: updated.financeReviewedAt ? new Date(updated.financeReviewedAt).toISOString() : updated.financeReviewedAt,
      submittedAt: updated.submittedAt ? new Date(updated.submittedAt).toISOString() : updated.submittedAt,
      approvedAt: updated.approvedAt ? new Date(updated.approvedAt).toISOString() : updated.approvedAt,
      cashierApprovedAt: updated.cashierApprovedAt ? new Date(updated.cashierApprovedAt).toISOString() : updated.cashierApprovedAt,
      paidAt: updated.paidAt ? new Date(updated.paidAt).toISOString() : updated.paidAt,
    };
  } catch (error) {
    console.error("Error updating monthly bill:", error);
    throw error;
  }
}

/**
 * 保存月账单列表（批量更新，用于兼容旧代码）
 * 注意：此函数会逐个更新每个账单，建议直接使用 updateMonthlyBill
 */
export async function saveMonthlyBills(bills: MonthlyBill[]): Promise<void> {
  try {
    // 批量更新所有账单
    await Promise.all(
      bills.map((bill) => updateMonthlyBill(bill.id, bill))
    );
  } catch (error) {
    console.error("Error saving monthly bills:", error);
    throw error;
  }
}

/**
 * 获取待审批账单数量（包括月账单和付款申请）
 */
export async function getPendingApprovalCount(): Promise<number> {
  try {
    const bills = await getBillsByStatus("Pending_Approval");
    // 动态导入付款申请模块，避免循环依赖
    if (typeof window !== "undefined") {
      try {
        const paymentRequestStore = await import("./payment-request-store");
        if (paymentRequestStore?.getPaymentRequestsByStatus) {
          const requests = await paymentRequestStore.getPaymentRequestsByStatus("Pending_Approval");
          return bills.length + (requests?.length || 0);
        }
      } catch (e) {
        // 如果导入失败，只返回账单数量
        console.warn("Failed to load payment requests:", e);
      }
    }
    return bills.length;
  } catch (e) {
    console.error("Failed to get pending approval count:", e);
    return 0;
  }
}
