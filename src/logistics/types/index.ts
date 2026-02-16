/**
 * 物流中心 - 统一类型定义
 */

// ==================== 物流渠道 ====================

export type LogisticsChannelType = "DOMESTIC" | "OVERSEAS";

export interface LogisticsChannel {
  id: string;
  name: string;           // 物流商名称
  channelCode: string;    // 渠道代码
  contact?: string;       // 联系人
  phone?: string;         // 联系电话
  queryUrl?: string;      // 官方查询网址
  isActive: boolean;      // 是否启用
  type: LogisticsChannelType;  // 国内/海外
  createdAt: string;
  updatedAt: string;
}

// ==================== 物流跟踪 ====================

export type TrackingStatus = "Pending" | "In Transit" | "Delivered" | "Exception";

export interface TrackingEvent {
  id: string;
  timestamp: string;      // ISO date string
  location?: string;       // 位置信息
  description: string;    // 状态描述
  status: TrackingStatus;  // 当前状态
}

export interface LogisticsTracking {
  id: string;
  trackingNumber: string;       // 物流单号
  channelId: string;             // 关联的物流渠道ID
  channelName: string;           // 物流商名称（冗余）
  channelCode?: string;          // 渠道代码（冗余）
  currentStatus: TrackingStatus; // 当前状态
  
  // 订单关联
  internalOrderNumber?: string;   // 内部订单号
  orderId?: string;              // 店铺订单ID
  
  // 时间信息
  shippedDate?: string;          // 发货日期
  estimatedDelivery?: string;    // 预计送达日期
  deliveredDate?: string;        // 实际送达日期
  lastUpdatedAt: string;        // 最后更新时间
  
  // 扩展信息
  transportDays?: number;        // 运输时长（天）
  weight?: number;               // 重量(kg)
  fee?: number;                  // 运费
  
  // 轨迹
  events: TrackingEvent[];       // 物流轨迹事件列表
  
  createdAt: string;
  updatedAt: string;
}

// ==================== 仓库管理 ====================

export type WarehouseLocation = "FACTORY" | "DOMESTIC" | "TRANSIT" | "OVERSEAS";

export interface Warehouse {
  id: string;
  name: string;            // 仓库名称
  code?: string;           // 仓库编码
  address?: string;        // 地址
  contact?: string;        // 联系人
  phone?: string;          // 联系电话
  email?: string;          // 邮箱
  manager?: string;        // 负责人
  capacity?: number;      // 容量(m²)
  
  location: WarehouseLocation;  // 位置类型
  type: LogisticsChannelType;  // 国内中转/海外分发
  
  isActive: boolean;       // 是否启用
  notes?: string;         // 备注
  
  // 统计数据（可选）
  totalSku?: number;       // SKU总数
  totalStock?: number;     // 总库存
  
  createdAt: string;
  updatedAt: string;
}

// ==================== 入库管理 ====================

export type InboundStatus = "待入库" | "部分入库" | "已入库" | "已取消";

// 入库订单
export interface InboundOrder {
  id: string;
  inboundNumber: string;   // 入库单号
  deliveryNumber: string;  // 拿货单号
  sku: string;             // SKU
  qty: number;             // 计划数量
  receivedQty: number;     // 已入库数量
  status: InboundStatus;   // 状态
  
  // 仓库信息
  warehouseId?: string;
  warehouseName?: string;
  
  // 批次信息
  batchNumber?: string;     // 批次号
  productionDate?: string; // 生产日期
  
  // 供应商信息
  supplierId?: string;
  supplierName?: string;
  
  // 时间
  expectedDate?: string;    // 预计到货日期
  receivedDate?: string;    // 实际收货日期
  
  notes?: string;
  
  createdAt: string;
  updatedAt: string;
}

// 待入库类型（兼容旧代码）
export type PendingInbound = InboundOrder;

// ==================== 出库管理 ====================

export type OutboundStatus = "待出库" | "已出库" | "已取消" | "部分出库";

// 出库批次
export interface OutboundBatch {
  id: string;
  outboundOrderId: string;
  batchNumber: string;
  warehouseId: string;
  warehouseName?: string;
  qty: number;
  shippedDate: string;
  destination?: string;
  trackingNumber?: string;
  notes?: string;
  createdAt: string;
}

// 出库订单
export interface OutboundOrder {
  id: string;
  outboundNumber: string;  // 出库单号
  orderNumber: string;     // 订单号
  sku: string;             // SKU
  qty: number;             // 计划数量
  shippedQty: number;      // 已发货数量
  status: OutboundStatus;  // 状态
  
  // 仓库信息
  warehouseId?: string;
  warehouseName?: string;
  
  // 物流信息
  trackingNumber?: string;  // 物流单号
  channelId?: string;
  channelName?: string;
  destination?: string;      // 目的地
  
  // 收货信息
  recipientName?: string;
  recipientAddress?: string;
  recipientPhone?: string;
  
  // 时间
  expectedDate?: string;
  shippedDate?: string;
  
  notes?: string;
  
  // 批次信息
  batches?: OutboundBatch[];
  
  createdAt: string;
  updatedAt: string;
}

// ==================== API 响应类型 ====================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
