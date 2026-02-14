/**
 * 人力资源数据存储
 * 管理员工档案、提成规则、绩效数据等
 */

export type Department = "财务" | "采购" | "物流" | "BD" | "运营" | "剪辑";

export type Employee = {
  id: string;
  // 基本信息
  name: string; // 姓名
  employeeNumber?: string; // 工号
  department: Department; // 部门
  position: string; // 岗位
  joinDate: string; // 入职日期
  phone?: string; // 手机号
  email?: string; // 邮箱
  
  // 关联信息（用于提成计算）
  responsibleInfluencers?: string[]; // 负责的达人ID列表（BD岗位）
  responsibleSuppliers?: string[]; // 负责的供应商ID列表（采购岗位）
  responsibleStores?: string[]; // 负责的店铺ID列表（运营岗位）
  
  // 状态
  status: "在职" | "离职" | "试用期";
  
  // 元数据
  notes?: string; // 备注
  createdAt: string;
  updatedAt: string;
};

export type CommissionRuleType = 
  | "fixed_amount" // 固定金额：每完成1个单位 = X元
  | "percentage" // 百分比：按金额的X%
  | "tiered" // 阶梯提成：不同数量区间不同单价
  | "conditional" // 条件奖励：满足条件时额外奖励
  | "formula"; // 公式计算：自定义公式

export type CommissionRule = {
  id: string;
  // 规则基本信息
  name: string; // 规则名称
  department: Department; // 适用部门
  position?: string; // 适用岗位（可选，为空则适用整个部门）
  
  // 规则类型和配置
  type: CommissionRuleType;
  config: {
    // fixed_amount 配置
    unitAmount?: number; // 每单位金额
    
    // percentage 配置
    percentage?: number; // 百分比（如 0.05 表示 5%）
    baseField?: string; // 基于哪个字段计算（如 "amount", "orders"）
    
    // tiered 配置
    tiers?: Array<{
      min: number; // 最小数量
      max?: number; // 最大数量（可选，为空表示无上限）
      amount: number; // 该区间的单价或百分比
    }>;
    
    // conditional 配置
    condition?: {
      field: string; // 判断字段
      operator: ">" | ">=" | "<" | "<=" | "==" | "!="; // 操作符
      value: number; // 比较值
    };
    bonusAmount?: number; // 满足条件时的奖励金额
    
    // formula 配置
    formula?: string; // 公式表达式（如 "amount * 0.05 + orders * 10"）
  };
  
  // 数据源配置
  dataSource: {
    module: "influencer_bd" | "purchase_contract" | "logistics" | "finance" | "store" | "content"; // 数据来源模块
    field: string; // 提取的字段（如 "actualOrders", "totalAmount"）
    filter?: Record<string, any>; // 过滤条件
  };
  
  // 时间配置
  period: "monthly" | "quarterly" | "yearly" | "project"; // 提成周期
  startDate?: string; // 规则生效日期
  endDate?: string; // 规则失效日期
  
  // 状态
  enabled: boolean; // 是否启用
  
  // 元数据
  description?: string; // 规则说明
  createdAt: string;
  updatedAt: string;
};

export type CommissionRecord = {
  id: string;
  // 关联信息
  employeeId: string; // 员工ID
  employeeName: string; // 员工姓名
  ruleId: string; // 规则ID
  ruleName: string; // 规则名称
  
  // 计算数据
  period: string; // 周期（如 "2024-01" 表示2024年1月）
  dataSource: string; // 数据来源（如 "influencer_bd"）
  sourceIds: string[]; // 关联的业务数据ID列表
  
  // 计算明细
  baseValue: number; // 基础值（如订单数、金额等）
  commissionAmount: number; // 提成金额
  calculationDetails?: string; // 计算明细（JSON字符串，用于展示）
  
  // 状态
  status: "pending" | "approved" | "rejected" | "paid"; // 待审批/已批准/已拒绝/已发放
  approvedBy?: string; // 审批人
  approvedAt?: string; // 审批时间
  
  // 元数据
  notes?: string; // 备注
  createdAt: string;
  updatedAt: string;
};

const EMPLOYEES_KEY = "hr_employees";
const COMMISSION_RULES_KEY = "hr_commission_rules";
const COMMISSION_RECORDS_KEY = "hr_commission_records";

/**
 * 员工管理 - 同步版（localStorage）
 */
export function getEmployees(): Employee[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(EMPLOYEES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse employees", e);
    return [];
  }
}

/**
 * 从 API 获取员工列表
 */
export async function getEmployeesFromAPI(): Promise<Employee[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/employees?page=1&pageSize=500");
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : (json?.data ?? []);
  } catch (e) {
    console.error("Failed to fetch employees", e);
    return [];
  }
}

export function saveEmployees(employees: Employee[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(employees));
  } catch (e) {
    console.error("Failed to save employees", e);
  }
}

export async function upsertEmployee(employee: Employee): Promise<void> {
  const body = { ...employee, updatedAt: new Date().toISOString() };
  const existing = await getEmployeesFromAPI();
  const exists = existing.some((e) => e.id === employee.id);
  if (exists) {
    const res = await fetch(`/api/employees/${employee.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to update employee");
  } else {
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, createdAt: new Date().toISOString() })
    });
    if (!res.ok) throw new Error("Failed to create employee");
  }
}

export async function deleteEmployee(id: string): Promise<boolean> {
  const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
  return res.ok;
}

export function getEmployeeById(id: string): Employee | undefined {
  return getEmployees().find((e) => e.id === id);
}

export function getEmployeesByDepartment(department: Department): Employee[] {
  return getEmployees().filter((e) => e.department === department && e.status === "在职");
}

/**
 * 提成规则管理 - 同步版（localStorage）
 */
export function getCommissionRules(): CommissionRule[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(COMMISSION_RULES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse commission rules", e);
    return [];
  }
}

/**
 * 从 API 获取提成规则
 */
export async function getCommissionRulesFromAPI(): Promise<CommissionRule[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/commission-rules?page=1&pageSize=500");
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : (json?.data ?? []);
  } catch (e) {
    console.error("Failed to fetch commission rules", e);
    return [];
  }
}

export function saveCommissionRules(rules: CommissionRule[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMMISSION_RULES_KEY, JSON.stringify(rules));
  } catch (e) {
    console.error("Failed to save commission rules", e);
  }
}

export async function upsertCommissionRule(rule: CommissionRule): Promise<void> {
  const body = { ...rule, updatedAt: new Date().toISOString() };
  const existing = await getCommissionRulesFromAPI();
  const exists = existing.some((r) => r.id === rule.id);
  if (exists) {
    const res = await fetch(`/api/commission-rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to update commission rule");
  } else {
    const res = await fetch("/api/commission-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, createdAt: new Date().toISOString() })
    });
    if (!res.ok) throw new Error("Failed to create commission rule");
  }
}

export async function deleteCommissionRule(id: string): Promise<boolean> {
  const res = await fetch(`/api/commission-rules/${id}`, { method: "DELETE" });
  return res.ok;
}

export function getCommissionRulesByDepartment(department: Department): CommissionRule[] {
  return getCommissionRules().filter((r) => r.department === department && r.enabled);
}

/**
 * 提成记录管理 - 同步版（localStorage）
 */
export function getCommissionRecords(): CommissionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(COMMISSION_RECORDS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse commission records", e);
    return [];
  }
}

/**
 * 从 API 获取提成记录
 */
export async function getCommissionRecordsFromAPI(): Promise<CommissionRecord[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/commission-records?page=1&pageSize=500");
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : (json?.data ?? []);
  } catch (e) {
    console.error("Failed to fetch commission records", e);
    return [];
  }
}

export function saveCommissionRecords(records: CommissionRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMMISSION_RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    console.error("Failed to save commission records", e);
  }
}

export async function upsertCommissionRecord(record: CommissionRecord): Promise<void> {
  const body = { ...record, updatedAt: new Date().toISOString() };
  const existing = await getCommissionRecordsFromAPI();
  const exists = existing.some((r) => r.id === record.id);
  if (exists) {
    const res = await fetch(`/api/commission-records/${record.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to update commission record");
  } else {
    const res = await fetch("/api/commission-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, createdAt: new Date().toISOString() })
    });
    if (!res.ok) throw new Error("Failed to create commission record");
  }
}

/**
 * 自动计算提成（基础框架）
 * 后续可以根据具体规则完善计算逻辑
 */
export function calculateCommission(
  employeeId: string,
  period: string,
  rules?: CommissionRule[]
): CommissionRecord[] {
  const employee = getEmployeeById(employeeId);
  if (!employee) return [];
  
  const applicableRules = rules || getCommissionRulesByDepartment(employee.department);
  const records: CommissionRecord[] = [];
  
  // TODO: 根据规则类型和数据源，从业务模块提取数据并计算
  // 这里先返回空数组，后续完善具体计算逻辑
  
  return records;
}
