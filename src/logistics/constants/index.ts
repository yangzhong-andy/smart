/**
 * 物流中心 - 常量定义
 */

import { TrackingStatus, InboundStatus, OutboundStatus, WarehouseLocation } from "@/logistics/types";

// ==================== 状态映射 ====================

export const STATUS_COLORS: Record<TrackingStatus, { bg: string; text: string }> = {
  Pending: {
    text: "text-slate-300",
    bg: "bg-slate-500/10"
  },
  "In Transit": {
    text: "text-primary-300",
    bg: "bg-primary-500/10"
  },
  Delivered: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/10"
  },
  Exception: {
    text: "text-rose-300",
    bg: "bg-rose-500/10"
  }
};

export const STATUS_LABELS: Record<TrackingStatus, string> = {
  Pending: "待发货",
  "In Transit": "运输中",
  Delivered: "已送达",
  Exception: "异常"
};

export const INBOUND_STATUS_LABELS: Record<InboundStatus, string> = {
  "待入库": "待入库",
  "部分入库": "部分入库",
  "已入库": "已入库",
  "已取消": "已取消"
};

export const OUTBOUND_STATUS_LABELS: Record<OutboundStatus, string> = {
  "待出库": "待出库",
  "已出库": "已出库",
  "已取消": "已取消",
  "部分出库": "部分出库"
};

// ==================== 位置映射 ====================

export const LOCATION_MAP: Record<WarehouseLocation, string> = {
  FACTORY: "工厂仓",
  DOMESTIC: "国内仓",
  TRANSIT: "中转仓",
  OVERSEAS: "海外仓"
};

export const LOCATION_OPTIONS: { value: WarehouseLocation; label: string }[] = [
  { value: "FACTORY", label: "工厂仓" },
  { value: "DOMESTIC", label: "国内仓" },
  { value: "TRANSIT", label: "中转仓" },
  { value: "OVERSEAS", label: "海外仓" }
];

// ==================== 仓库类型映射 ====================

export const WAREHOUSE_TYPE_LABELS: Record<string, string> = {
  DOMESTIC: "国内仓（国内中转）",
  OVERSEAS: "海外仓（海外分发）"
};

export const CHANNEL_TYPE_LABELS: Record<string, string> = {
  DOMESTIC: "国内物流",
  OVERSEAS: "国际物流"
};

// ==================== 统计常量 ====================

export const LOGISTICS_STATS_CONFIG = {
  // 默认分页
  defaultPageSize: 500,
  maxPageSize: 1000,
  
  // 缓存时间（毫秒）
  cacheTime: 60000,  // 1分钟
  dedupingInterval: 60000,
  
  // 重试配置
  retryCount: 3,
  retryDelay: 1000
} as const;

// ==================== 分页默认值 ====================

export const DEFAULT_PAGINATION = {
  page: 1,
  pageSize: 20,
  total: 0
} as const;
