/**
 * 权限配置系统
 * 定义各部门对订单字段的访问和修改权限
 */

// 部门代码常量（与 seed.ts 中的 code 字段对应）
export const DEPARTMENT_CODES = {
  BRAND_GROWTH: 'BRAND_GROWTH',                    // 品牌增长中心
  MEDIA_STRATEGY: 'MEDIA_STRATEGY',                // 媒介战略部
  GLOBAL_SUPPLY_CHAIN: 'GLOBAL_SUPPLY_CHAIN',      // 全球供应链部
  FULFILLMENT_LOGISTICS: 'FULFILLMENT_LOGISTICS',   // 履约物流中心
  VISUAL_COMMUNICATION: 'VISUAL_COMMUNICATION',     // 视觉传达部
  CONTENT_PRODUCTION: 'CONTENT_PRODUCTION',         // 内容生产工厂
  FINANCE_CENTER: 'FINANCE_CENTER',                // 财经中心
} as const;

/**
 * 侧栏菜单权限：按部门限制可见的一级菜单（label）
 * 若某部门在此配置中，则只显示列出的菜单；未配置的部门或 null 表示显示全部
 */
export const SIDEBAR_NAV_BY_DEPARTMENT: Record<string, string[]> = {
  [DEPARTMENT_CODES.GLOBAL_SUPPLY_CHAIN]: ['控制台', '产品中心', '供应链'],
};

/** 部门仅能访问的路径前缀（用于路由保护）。空数组表示不限制。 */
export const ALLOWED_PATH_PREFIXES_BY_DEPARTMENT: Record<string, string[]> = {
  [DEPARTMENT_CODES.GLOBAL_SUPPLY_CHAIN]: [
    '/',
    '/approval',
    '/product-center',
    '/procurement',
    '/supply-chain',
    '/inventory',
  ],
};

/** 判断该部门是否允许访问该路径（支持用 departmentName 解析部门，避免 code 为空时失效） */
export function isPathAllowedForDepartment(
  pathname: string,
  departmentCode: string | null,
  departmentName?: string | null
): boolean {
  const effective = getEffectiveDepartmentCode(departmentCode, departmentName ?? null);
  if (!effective || !ALLOWED_PATH_PREFIXES_BY_DEPARTMENT[effective]) return true;
  const prefixes = ALLOWED_PATH_PREFIXES_BY_DEPARTMENT[effective];
  if (prefixes.length === 0) return true;
  if (pathname === '/' || pathname === '') return prefixes.includes('/');
  return prefixes.some((p) => p !== '/' && (pathname === p || pathname.startsWith(p + '/')));
}

/**
 * 根据部门 code 或 name 解析出用于权限判断的部门代码（兼容 name 匹配，避免 code 未填时失效）
 */
export function getEffectiveDepartmentCode(
  departmentCode: string | null,
  departmentName: string | null
): string | null {
  if (departmentCode && SIDEBAR_NAV_BY_DEPARTMENT[departmentCode]) return departmentCode;
  const name = (departmentName || '').trim();
  if (name === '全球供应链部' || name === '全球供应链部门') return DEPARTMENT_CODES.GLOBAL_SUPPLY_CHAIN;
  return departmentCode;
}

/** 获取该部门在侧栏可见的一级菜单 label 列表；返回 null 表示全部可见 */
export function getAllowedNavLabels(departmentCode: string | null, departmentName?: string | null): string[] | null {
  const effective = getEffectiveDepartmentCode(departmentCode, departmentName ?? null);
  if (!effective || !SIDEBAR_NAV_BY_DEPARTMENT[effective]) return null;
  return SIDEBAR_NAV_BY_DEPARTMENT[effective];
}

// 敏感字段（高度敏感，需要特殊保护）
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

/**
 * 从请求头或token中获取用户信息
 */
import * as jwt from 'jsonwebtoken';
import { prisma } from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function getCurrentUserFromRequest(request: Request): Promise<{
  userId?: string;
  departmentId?: string;
  departmentCode?: string;
  departmentName?: string;
  role?: string;
} | null> {
  try {
    // 从 Authorization header 获取 token
    const authHeader = request.headers.get('authorization');
    
    // 调试日志
    if (process.env.NODE_ENV === 'development') {
      console.log('[getCurrentUserFromRequest] Auth header:', authHeader ? 'Present' : 'Missing');
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // 如果没有 token，返回 null（允许未登录用户访问基础字段）
      if (process.env.NODE_ENV === 'development') {
        console.log('[getCurrentUserFromRequest] No token provided, returning null');
      }
      return null;
    }
    
    const token = authHeader.substring(7);
    
    try {
      // 验证并解析 JWT token
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      if (!decoded.userId) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[getCurrentUserFromRequest] Token decoded but no userId');
        }
        return null;
      }
      
      // 从数据库获取用户信息（包含部门信息）
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          department: true
        }
      });
      
      if (!user || !user.isActive) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[getCurrentUserFromRequest] User not found or inactive:', { userId: decoded.userId, found: !!user, active: user?.isActive });
        }
        return null;
      }
      
      const userInfo = {
        userId: user.id,
        departmentId: user.departmentId || undefined,
        departmentCode: user.department?.code || undefined,
        departmentName: user.department?.name || undefined,
        role: user.role || undefined
      };
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[getCurrentUserFromRequest] User found:', userInfo);
      }
      
      return userInfo;
    } catch (jwtError) {
      // Token 无效或过期
      if (process.env.NODE_ENV === 'development') {
        console.error('[getCurrentUserFromRequest] JWT verification failed:', jwtError);
      }
      return null;
    }
  } catch (error) {
    console.error('[getCurrentUserFromRequest] Error:', error);
    return null;
  }
}
