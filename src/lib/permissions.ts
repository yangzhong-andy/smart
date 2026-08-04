/**
 * 权限工具函数（简化版 v2）
 * 菜单权限完全由数据库控制，代码不再内置任何默认限制
 */

export const DEPARTMENT_CODES = {
  BRAND_GROWTH: 'BRAND_GROWTH',
  MEDIA_STRATEGY: 'MEDIA_STRATEGY',
  GLOBAL_SUPPLY_CHAIN: 'GLOBAL_SUPPLY_CHAIN',
  FULFILLMENT_LOGISTICS: 'FULFILLMENT_LOGISTICS',
  VISUAL_COMMUNICATION: 'VISUAL_COMMUNICATION',
  CONTENT_PRODUCTION: 'CONTENT_PRODUCTION',
  FINANCE_CENTER: 'FINANCE_CENTER',
} as const;

export type DepartmentAccessRuntimeOptions = {
  dbConfig?: import("./department-access-config").DepartmentAccessRuleConfig | null;
  bypass?: boolean;
};

/**
 * 获取允许的一级菜单 labels，null=全部可见
 */
export function getAllowedNavLabels(
  _departmentCode: string | null,
  _departmentName: string | null | undefined,
  opts?: DepartmentAccessRuntimeOptions
): string[] | null {
  if (opts?.bypass) return null;
  const config = opts?.dbConfig ?? null;
  if (!config) return null;
  if (!config.menuLabels || config.menuLabels.length === 0) return null;
  return config.menuLabels;
}

/**
 * 过滤二级菜单
 */
export function filterSidebarNavChildren<T extends { href?: string; label: string }>(
  parentLabel: string,
  children: T[],
  _departmentCode: string | null,
  _departmentName: string | null | undefined,
  opts?: DepartmentAccessRuntimeOptions
): T[] {
  if (!Array.isArray(children)) return [];
  if (opts?.bypass) return children;
  const config = opts?.dbConfig ?? null;
  if (!config) return children;
  const hrefs = config.childHrefs?.[parentLabel];
  if (!hrefs || !Array.isArray(hrefs) || hrefs.length === 0) return children;
  const allowed = new Set(hrefs);
  return children.filter((c) => !c.href || allowed.has(c.href));
}

export const SENSITIVE_FIELDS = [
  'paymentPassword',      // 支付密码
  'bankPassword',         // 银行密码
  'apiKey',               // API密钥
  'secretKey',            // 密钥
] as const;

// 成本相关字段（财经中心专属）
export const COST_FIELDS = [
  'unitPrice',            // 单价
  'totalAmount',          // 总金额
  'depositAmount',        // 定金金额
  'tailAmount',           // 尾款金额
  'shippingFee',          // 运费
  'customsFee',           // 报关费
  'otherCosts',           // 其他成本
  'costPrice',            // 成本价
  'profit',               // 利润
  'profitMargin',         // 利润率
] as const;

// 部门字段权限配置
export interface FieldPermission {
  readable: boolean;  // 是否可读
  writable: boolean;  // 是否可写
}

export type DepartmentPermissions = Record<string, FieldPermission>;

// 权限配置：部门代码 -> 字段 -> 权限
export const DEPARTMENT_FIELD_PERMISSIONS: Record<string, DepartmentPermissions> = {
  // 媒介战略部：只能访问 kolContact
  [DEPARTMENT_CODES.MEDIA_STRATEGY]: {
    kolContact: { readable: true, writable: false },
  },
  
  // 履约物流中心：可以访问和修改 shippingNo 和 shippingFee
  [DEPARTMENT_CODES.FULFILLMENT_LOGISTICS]: {
    shippingNo: { readable: true, writable: true },
    shippingFee: { readable: true, writable: true },
    domesticTrackingNumber: { readable: true, writable: true },
    trackingNumber: { readable: true, writable: true },
  },
  
  // 财经中心：拥有 paymentStatus 和所有成本字段的唯一修改权
  [DEPARTMENT_CODES.FINANCE_CENTER]: {
    paymentStatus: { readable: true, writable: true },
    paymentPassword: { readable: true, writable: true }, // 高度敏感，仅财经中心可访问
  },
};

// 为财经中心添加所有成本字段的权限
COST_FIELDS.forEach(field => {
  if (!DEPARTMENT_FIELD_PERMISSIONS[DEPARTMENT_CODES.FINANCE_CENTER]) {
    DEPARTMENT_FIELD_PERMISSIONS[DEPARTMENT_CODES.FINANCE_CENTER] = {};
  }
  DEPARTMENT_FIELD_PERMISSIONS[DEPARTMENT_CODES.FINANCE_CENTER][field] = { readable: true, writable: true };
});

// 默认权限（所有部门都可以访问的基础字段）
export const DEFAULT_READABLE_FIELDS = [
  'id',
  'orderNumber',
  'uid',
  'createdBy',
  'platform',
  'storeId',
  'storeName',
  'sku',
  'skuId',
  'productName',
  'quantity',
  'expectedDeliveryDate',
  'urgency',
  'notes',
  'status',
  'createdAt',
  'updatedAt',
];

// 默认可写字段（运营等基础部门）
export const DEFAULT_WRITABLE_FIELDS = [
  'createdBy',
  'platform',
  'storeId',
  'storeName',
  'sku',
  'skuId',
  'productName',
  'quantity',
  'expectedDeliveryDate',
  'urgency',
  'notes',
];

/**
 * 检查用户是否有权限读取某个字段
 */
export function canReadField(
  departmentCode: string | null,
  fieldName: string
): boolean {
  // 敏感字段：只有财经中心可以访问
  if (SENSITIVE_FIELDS.includes(fieldName as any)) {
    const allowed = departmentCode === DEPARTMENT_CODES.FINANCE_CENTER;
    if (process.env.NODE_ENV === 'development' && !allowed) {
      console.log(`[canReadField] Blocked sensitive field "${fieldName}" for department: ${departmentCode}`);
    }
    return allowed;
  }
  
  // 默认可读字段（所有用户都可以访问）
  if (DEFAULT_READABLE_FIELDS.includes(fieldName)) {
    return true;
  }
  
  // 检查部门特定权限
  if (departmentCode && DEPARTMENT_FIELD_PERMISSIONS[departmentCode]) {
    const permission = DEPARTMENT_FIELD_PERMISSIONS[departmentCode][fieldName];
    if (permission) {
      return permission.readable;
    }
  }
  
  // 如果用户未登录（departmentCode 为 null），默认不允许读取特殊字段
  // 如果用户已登录但没有权限，也不允许读取
  if (process.env.NODE_ENV === 'development') {
    console.log(`[canReadField] Blocked field "${fieldName}" for department: ${departmentCode || 'null (not logged in)'}`);
  }
  return false;
}

/**
 * 检查用户是否有权限修改某个字段
 */
export function canWriteField(
  departmentCode: string | null,
  fieldName: string
): boolean {
  // 敏感字段：只有财经中心可以修改
  if (SENSITIVE_FIELDS.includes(fieldName as any)) {
    return departmentCode === DEPARTMENT_CODES.FINANCE_CENTER;
  }
  
  // 成本字段：只有财经中心可以修改
  if (COST_FIELDS.includes(fieldName as any)) {
    return departmentCode === DEPARTMENT_CODES.FINANCE_CENTER;
  }
  
  // paymentStatus：只有财经中心可以修改
  if (fieldName === 'paymentStatus') {
    return departmentCode === DEPARTMENT_CODES.FINANCE_CENTER;
  }
  
  // 默认可写字段
  if (DEFAULT_WRITABLE_FIELDS.includes(fieldName)) {
    return true;
  }
  
  // 检查部门特定权限
  if (departmentCode && DEPARTMENT_FIELD_PERMISSIONS[departmentCode]) {
    const permission = DEPARTMENT_FIELD_PERMISSIONS[departmentCode][fieldName];
    if (permission) {
      return permission.writable;
    }
  }
  
  // 默认不允许修改
  return false;
}

/**
 * 根据部门权限过滤对象字段（数据脱敏）
 */
export function filterFieldsByPermission<T extends Record<string, any>>(
  data: T,
  departmentCode: string | null
): Partial<T> {
  const filtered: any = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (canReadField(departmentCode, key)) {
      filtered[key] = value;
    }
  }
  
  return filtered as Partial<T>;
}

/**
 * 检查更新操作中的字段权限
 * 返回不允许修改的字段列表
 */
export function validateUpdatePermissions(
  updateData: Record<string, any>,
  departmentCode: string | null
): { allowed: Record<string, any>; forbidden: string[] } {
  const allowed: Record<string, any> = {};
  const forbidden: string[] = [];
  
  for (const [field, value] of Object.entries(updateData)) {
    // 跳过系统字段（如 updatedAt）
    if (field === 'updatedAt' || field === 'createdAt') {
      continue;
    }
    
    if (canWriteField(departmentCode, field)) {
      allowed[field] = value;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[validateUpdatePermissions] Allowed field "${field}" for department: ${departmentCode || 'null'}`);
      }
    } else {
      forbidden.push(field);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[validateUpdatePermissions] Forbidden field "${field}" for department: ${departmentCode || 'null'}`);
      }
    }
  }
  
  return { allowed, forbidden };
}
