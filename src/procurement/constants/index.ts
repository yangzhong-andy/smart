/**
 * 采购中心 - 常量定义
 */

import type { PurchaseOrderStatus } from "@prisma/client";

// ==================== 采购订单状态 ====================

export const PURCHASE_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_RISK: "待风控",
  RISK_APPROVED: "风控通过",
  RISK_REJECTED: "风控拒绝",
  PENDING_APPROVAL: "待审批",
  APPROVED: "审批通过",
  REJECTED: "审批拒绝",
  PUSHED_TO_PROCUREMENT: "已推送采购",
  PROCUREMENT_IN_PROGRESS: "采购中",
  PARTIALLY_RECEIVED: "部分收货",
  COMPLETED: "已完成",
  CANCELLED: "已取消"
};

export const PURCHASE_ORDER_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING_RISK: { bg: "bg-slate-500/20", text: "text-slate-300" },
  RISK_APPROVED: { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  RISK_REJECTED: { bg: "bg-rose-500/20", text: "text-rose-300" },
  PENDING_APPROVAL: { bg: "bg-blue-500/20", text: "text-blue-300" },
  APPROVED: { bg: "bg-green-500/20", text: "text-green-300" },
  REJECTED: { bg: "bg-red-500/20", text: "text-red-300" },
  PUSHED_TO_PROCUREMENT: { bg: "bg-amber-500/20", text: "text-amber-300" },
  PROCUREMENT_IN_PROGRESS: { bg: "bg-yellow-500/20", text: "text-yellow-300" },
  PARTIALLY_RECEIVED: { bg: "bg-orange-500/20", text: "text-orange-300" },
  COMPLETED: { bg: "bg-primary-500/20", text: "text-primary-300" },
  CANCELLED: { bg: "bg-gray-500/20", text: "text-gray-300" }
};

// ==================== 合同状态 ====================

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PENDING_DEPOSIT: "待付定金",
  DEPOSIT_PAID: "定金已付",
  IN_PRODUCTION: "生产中",
  SHIPPED: "已发货",
  PARTIALLY_RECEIVED: "部分收货",
  COMPLETED: "已完成",
  CANCELLED: "已取消"
};

export const CONTRACT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "bg-slate-500/20", text: "text-slate-300" },
  PENDING_DEPOSIT: { bg: "bg-amber-500/20", text: "text-amber-300" },
  DEPOSIT_PAID: { bg: "bg-blue-500/20", text: "text-blue-300" },
  IN_PRODUCTION: { bg: "bg-yellow-500/20", text: "text-yellow-300" },
  SHIPPED: { bg: "bg-purple-500/20", text: "text-purple-300" },
  PARTIALLY_RECEIVED: { bg: "bg-orange-500/20", text: "text-orange-300" },
  COMPLETED: { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  CANCELLED: { bg: "bg-slate-500/20", text: "text-slate-300" }
};

// ==================== 送货单状态 ====================

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: "待发货",
  SHIPPED: "已发货",
  PARTIALLY_RECEIVED: "部分收货",
  RECEIVED: "已收货",
  CANCELLED: "已取消"
};

export const DELIVERY_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "bg-slate-500/20", text: "text-slate-300" },
  SHIPPED: { bg: "bg-blue-500/20", text: "text-blue-300" },
  PARTIALLY_RECEIVED: { bg: "bg-amber-500/20", text: "text-amber-300" },
  RECEIVED: { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  CANCELLED: { bg: "bg-slate-500/20", text: "text-slate-300" }
};

// ==================== 入库状态 ====================

export const INBOUND_STATUS_LABELS: Record<string, string> = {
  PENDING: "待入库",
  PARTIALLY_RECEIVED: "部分入库",
  RECEIVED: "已入库",
  CANCELLED: "已取消"
};

export const INBOUND_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "bg-slate-500/20", text: "text-slate-300" },
  PARTIALLY_RECEIVED: { bg: "bg-amber-500/20", text: "text-amber-300" },
  RECEIVED: { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  CANCELLED: { bg: "bg-slate-500/20", text: "text-slate-300" }
};

// ==================== 紧急程度 ====================

export const URGENCY_LABELS: Record<string, string> = {
  普通: "普通",
  紧急: "紧急",
  特急: "特急"
};

export const URGENCY_COLORS: Record<string, { bg: string; text: string }> = {
  普通: { bg: "bg-slate-500/20", text: "text-slate-300" },
  紧急: { bg: "bg-amber-500/20", text: "text-amber-300" },
  特急: { bg: "bg-rose-500/20", text: "text-rose-300" }
};

// ==================== 配置常量 ====================

export const PROCUREMENT_CONFIG = {
  // 分页默认值
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  
  // 缓存时间
  CACHE_TTL: 300000, // 5分钟
  DEDUPING_INTERVAL: 60000, // 1分钟
  
  // 日期格式
  DATE_FORMAT: "yyyy-MM-dd",
  DATETIME_FORMAT: "yyyy-MM-dd HH:mm:ss"
} as const;

// ==================== 工具函数 ====================

export function formatCurrency(amount: number, currency: string = "CNY"): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatDate(dateString?: string): string {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString?: string): string {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleString("zh-CN");
  } catch {
    return dateString;
  }
}

export function calculateProgress(
  createdAt: string,
  expectedDate?: string,
  today: Date = new Date()
): number {
  if (!expectedDate) return 0;
  
  const start = new Date(createdAt).getTime();
  const end = new Date(expectedDate).getTime();
  const now = today.getTime();
  
  if (now <= start) return 0;
  if (now >= end) return 100;
  
  return Math.round(((now - start) / (end - start)) * 100);
}
