/**
 * 供应商对账与月结数据存储
 * 管理供应商档案、月度账单、付款记录等
 */

export type SupplierType = "广告代理商" | "物流商" | "供货商";

export type SupplierProfile = {
  id: string;
  name: string; // 供应商名称
  type: SupplierType; // 供应商类型
  contact: string; // 联系人
  phone: string; // 联系电话
  email?: string; // 邮箱
  address?: string; // 地址
  
  // 结算协议
  rebateRate?: number; // 返点比例（%，如 5 表示 5%）
  settlementDay?: number; // 结账日（每月几号，如 15 表示每月15号）
  creditTerm?: string; // 账期规则（如："本月消耗，次月第15天结算"）
  currency?: "USD" | "CNY" | "HKD"; // 默认结算币种
  
  // 关联信息
  agencyId?: string; // 关联的广告代理商ID（如果是广告代理商类型）
  supplierId?: string; // 关联的原始供应商ID（如果是物流商或供货商类型）
  
  // 元数据
  notes?: string; // 备注
  createdAt: string;
  updatedAt: string;
};

export type SupplierBillStatus = "Draft" | "Pending_Approval" | "Approved" | "Paid" | "Rejected";

export type SupplierMonthlyBill = {
  id: string;
  uid?: string; // 全局唯一业务ID
  supplierProfileId: string; // 关联的供应商档案ID
  supplierName: string; // 供应商名称（冗余字段）
  supplierType: SupplierType; // 供应商类型（冗余字段）
  
  // 账单基本信息
  month: string; // 账单月份，格式：YYYY-MM
  billNumber?: string; // 供应商账单编号
  billDate: string; // 账单日期
  
  // 金额信息
  supplierBillAmount: number; // 供应商账单金额（供应商提供的原始账单金额）
  systemAmount: number; // 系统流水金额（从系统流水计算得出）
  difference: number; // 差异金额 = 供应商账单金额 - 系统流水金额
  currency: "USD" | "CNY" | "HKD"; // 币种
  
  // 返点信息
  rebateAmount: number; // 返点金额（根据返点比例计算）
  rebateRate?: number; // 返点比例（从供应商档案继承）
  netAmount: number; // 净应付金额 = 供应商账单金额 - 返点金额
  
  // 关联数据
  relatedFlowIds: string[]; // 关联的系统流水ID列表（用于核对）
  uploadedBillFile?: string; // 上传的账单文件（base64 或 URL）
  
  // 状态机
  status: SupplierBillStatus;
  
  // 审批信息
  createdBy: string; // 创建人
  createdAt: string; // 创建时间
  submittedAt?: string; // 提交审批时间
  approvedBy?: string; // 审批人
  approvedAt?: string; // 审批时间
  rejectionReason?: string; // 退回原因
  
  // 付款信息
  paidBy?: string; // 付款人
  paidAt?: string; // 付款时间
  paymentAccountId?: string; // 付款账户ID
  paymentAccountName?: string; // 付款账户名称（冗余字段）
  paymentMethod?: string; // 付款方式
  paymentFlowId?: string; // 关联的财务流水ID
  paymentVoucher?: string; // 银行回单（base64 或 URL）
  
  // 备注
  notes?: string;
};

export type SupplierPayment = {
  id: string;
  billId: string; // 关联的账单ID
  supplierProfileId: string; // 供应商档案ID
  supplierName: string; // 供应商名称（冗余字段）
  
  // 付款信息
  amount: number; // 付款金额
  currency: "USD" | "CNY" | "HKD"; // 币种
  paymentDate: string; // 付款日期
  paymentAccountId: string; // 付款账户ID
  paymentAccountName: string; // 付款账户名称
  paymentMethod: string; // 付款方式
  paymentFlowId: string; // 关联的财务流水ID
  paymentVoucher?: string; // 银行回单
  
  // 元数据
  paidBy: string; // 付款人
  paidAt: string; // 付款时间
  notes?: string;
};

const SUPPLIER_PROFILES_KEY = "supplierProfiles";
const SUPPLIER_BILLS_KEY = "supplierMonthlyBills";
const SUPPLIER_PAYMENTS_KEY = "supplierPayments";

/**
 * 从 API 获取供应商档案列表（支持 type 筛选：广告代理商/物流商/供货商）
 */
export async function getSupplierProfilesFromAPI(type?: SupplierType): Promise<SupplierProfile[]> {
  if (typeof window === "undefined") return [];
  try {
    const url = type ? `/api/supplier-profiles?type=${encodeURIComponent(type)}` : "/api/supplier-profiles";
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Failed to fetch supplier profiles from API", e);
    return [];
  }
}

/**
 * 获取所有供应商档案（本地缓存，同步）
 */
export function getSupplierProfiles(): SupplierProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(SUPPLIER_PROFILES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse supplier profiles", e);
    return [];
  }
}

/**
 * 保存供应商档案列表
 */
export function saveSupplierProfiles(profiles: SupplierProfile[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SUPPLIER_PROFILES_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.error("Failed to save supplier profiles", e);
  }
}

/**
 * 根据ID获取供应商档案
 */
export function getSupplierProfileById(id: string): SupplierProfile | undefined {
  const profiles = getSupplierProfiles();
  return profiles.find((p) => p.id === id);
}

/**
 * 根据类型获取供应商档案
 */
export function getSupplierProfilesByType(type: SupplierType): SupplierProfile[] {
  const profiles = getSupplierProfiles();
  return profiles.filter((p) => p.type === type);
}

/**
 * 从 API 获取供应商月度账单
 */
export async function getSupplierMonthlyBillsFromAPI(params?: {
  supplierProfileId?: string;
  month?: string;
  status?: SupplierBillStatus;
}): Promise<SupplierMonthlyBill[]> {
  if (typeof window === "undefined") return [];
  try {
    const searchParams = new URLSearchParams();
    if (params?.supplierProfileId) searchParams.set("supplierProfileId", params.supplierProfileId);
    if (params?.month) searchParams.set("month", params.month);
    if (params?.status) searchParams.set("status", params.status);
    const url = `/api/supplier-monthly-bills${searchParams.toString() ? `?${searchParams}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Failed to fetch supplier monthly bills from API", e);
    return [];
  }
}

/**
 * 获取所有供应商月度账单（本地缓存，同步）
 */
export function getSupplierMonthlyBills(): SupplierMonthlyBill[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(SUPPLIER_BILLS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse supplier monthly bills", e);
    return [];
  }
}

/**
 * 保存供应商月度账单列表
 */
export function saveSupplierMonthlyBills(bills: SupplierMonthlyBill[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SUPPLIER_BILLS_KEY, JSON.stringify(bills));
  } catch (e) {
    console.error("Failed to save supplier monthly bills", e);
  }
}

/**
 * 根据ID获取账单
 */
export function getSupplierBillById(id: string): SupplierMonthlyBill | undefined {
  const bills = getSupplierMonthlyBills();
  return bills.find((b) => b.id === id);
}

/**
 * 根据状态获取账单列表
 */
export function getSupplierBillsByStatus(status: SupplierBillStatus): SupplierMonthlyBill[] {
  const bills = getSupplierMonthlyBills();
  return bills.filter((b) => b.status === status);
}

/**
 * 根据供应商档案ID获取账单列表
 */
export function getSupplierBillsByProfileId(profileId: string): SupplierMonthlyBill[] {
  const bills = getSupplierMonthlyBills();
  return bills.filter((b) => b.supplierProfileId === profileId);
}

/**
 * 从 API 获取供应商付款记录
 */
export async function getSupplierPaymentsFromAPI(params?: { billId?: string; supplierProfileId?: string }): Promise<SupplierPayment[]> {
  if (typeof window === "undefined") return [];
  try {
    const searchParams = new URLSearchParams();
    if (params?.billId) searchParams.set("billId", params.billId);
    if (params?.supplierProfileId) searchParams.set("supplierProfileId", params.supplierProfileId);
    const url = `/api/supplier-payments${searchParams.toString() ? `?${searchParams}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Failed to fetch supplier payments from API", e);
    return [];
  }
}

/**
 * 获取所有供应商付款记录（本地缓存，同步）
 */
export function getSupplierPayments(): SupplierPayment[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(SUPPLIER_PAYMENTS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse supplier payments", e);
    return [];
  }
}

/**
 * 保存供应商付款记录列表
 */
export function saveSupplierPayments(payments: SupplierPayment[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SUPPLIER_PAYMENTS_KEY, JSON.stringify(payments));
  } catch (e) {
    console.error("Failed to save supplier payments", e);
  }
}

/**
 * 根据账单ID获取付款记录
 */
export function getPaymentByBillId(billId: string): SupplierPayment | undefined {
  const payments = getSupplierPayments();
  return payments.find((p) => p.billId === billId);
}

/**
 * 计算汇总统计数据
 */
export function getSupplierReconciliationStats(month?: string) {
  const bills = getSupplierMonthlyBills();
  const payments = getSupplierPayments();
  
  // 如果指定了月份，则筛选该月份的账单
  const filteredBills = month 
    ? bills.filter((b) => b.month === month)
    : bills;
  
  // 本月应付总额（所有已审批和已付款的账单的净应付金额）
  const totalPayable = filteredBills
    .filter((b) => b.status === "Approved" || b.status === "Paid")
    .reduce((sum, b) => sum + (b.netAmount || 0), 0);
  
  // 已付总额（所有已付款的账单的付款金额）
  const totalPaid = filteredBills
    .filter((b) => b.status === "Paid")
    .reduce((sum, b) => sum + (b.netAmount || 0), 0);
  
  // 待收返点总额（所有已审批和已付款的账单的返点金额）
  const totalRebateReceivable = filteredBills
    .filter((b) => b.status === "Approved" || b.status === "Paid")
    .reduce((sum, b) => sum + (b.rebateAmount || 0), 0);
  
  // 待审批账单数量
  const pendingApprovalCount = filteredBills.filter((b) => b.status === "Pending_Approval").length;
  
  // 待付款账单数量（已审批但未付款）
  const pendingPaymentCount = filteredBills.filter((b) => b.status === "Approved").length;
  
  return {
    totalPayable,
    totalPaid,
    totalRebateReceivable,
    pendingApprovalCount,
    pendingPaymentCount,
    totalBills: filteredBills.length
  };
}
