/**
 * 采购中心 - 统一类型定义
 */

import type { PurchaseOrderStatus, Platform } from "@prisma/client";

// ==================== 采购订单 ====================

export interface OrderItem {
  id: string;
  productId: string;
  sku: string;
  skuName: string;
  spec?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  uid?: string;
  
  // 下单信息
  createdBy: string;
  platform: string;
  storeId?: string;
  storeName?: string;
  
  // 兼容旧单
  sku?: string;
  skuId?: string;
  productName?: string;
  quantity?: number;
  expectedDeliveryDate?: string;
  urgency: string;
  notes?: string;
  
  // 订单明细
  items?: OrderItem[];
  
  // 风控评估
  riskControlStatus: string;
  riskControlBy?: string;
  riskControlAt?: string;
  riskControlNotes?: string;
  
  // 审批流程
  approvalStatus: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalNotes?: string;
  
  // 合同关联
  contractId?: string;
  
  // 推送采购
  pushedToProcurementAt?: string;
  pushedBy?: string;
  procurementNotes?: string;
  
  // 状态
  status: string;
  
  // 时间
  createdAt: string;
  updatedAt: string;
}

// ==================== 采购合同 ====================

export interface PurchaseContract {
  id: string;
  contractNumber: string;
  supplierId: string;
  supplierName: string;
  
  // 金额
  totalAmount: number;
  depositRate: number;
  depositAmount: number;
  tailAmount: number;
  currency: string;
  
  // 时间
  contractDate: string;
  deliveryDate?: string;
  settlementDate?: string;
  
  // 状态
  status: string;
  
  // 明细
  items?: ContractItem[];
  
  createdAt: string;
  updatedAt: string;
}

export interface ContractItem {
  id: string;
  productId: string;
  sku: string;
  skuName: string;
  spec?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// ==================== 送货单 ====================

export interface DeliveryOrder {
  id: string;
  deliveryNumber: string;
  contractId: string;
  supplierId: string;
  supplierName: string;
  
  // 物流信息
  trackingNumber?: string;
  channelId?: string;
  channelName?: string;
  shippedDate?: string;
  
  // 状态
  status: string;
  
  // 明细
  items?: DeliveryOrderItem[];
  
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryOrderItem {
  id: string;
  productId: string;
  sku: string;
  quantity: number;
  receivedQuantity?: number;
}

// ==================== 待入库 ====================

export interface PendingInbound {
  id: string;
  inboundNumber: string;
  deliveryNumber: string;
  sku: string;
  qty: number;
  receivedQty: number;
  status: string;
  
  warehouseId?: string;
  warehouseName?: string;
  
  createdAt: string;
  updatedAt: string;
}

// ==================== 供应商 ====================

export type SupplierLevel = "S" | "A" | "B" | "C";
export type InvoiceRequirement = "SPECIAL_INVOICE" | "GENERAL_INVOICE" | "NO_INVOICE";
export type SettleBase = "SHIPMENT" | "INBOUND";

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  
  // 财务信息
  depositRate: number;
  tailPeriodDays: number;
  settleBase: SettleBase;
  
  // 银行信息
  bankAccount?: string;
  bankName?: string;
  taxId?: string;
  
  // 发票信息
  invoiceRequirement?: InvoiceRequirement;
  invoicePoint?: number;
  
  // 供应能力
  level?: SupplierLevel;
  category?: string;
  defaultLeadTime?: number;
  moq?: number;
  
  // 图片
  factoryImages?: string[];
  
  // 状态
  isActive: boolean;
  
  createdAt: string;
  updatedAt: string;
}

// 供应商扩展类型（页面使用）
export interface SupplierExt extends Supplier {
  // 统计字段
  productCount?: number;
  mainCategory?: string;
}

// 供应商表单数据
export interface SupplierFormData {
  name: string;
  contact: string;
  phone: string;
  depositRate: string;
  tailPeriodDays: string;
  settleBase: SettleBase;
  level: SupplierLevel | "";
  category: string;
  address: string;
  bankAccount: string;
  bankName: string;
  taxId: string;
  invoiceRequirement: InvoiceRequirement | "";
  invoicePoint: string;
  defaultLeadTime: string;
  moq: string;
  factoryImages: string;
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

// ==================== 统计类型 ====================

export interface PurchaseStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  inProgress: number;
  completed: number;
}

export interface ContractStats {
  total: number;
  active: number;
  pending: number;
  completed: number;
}

export interface DeliveryStats {
  total: number;
  pending: number;
  shipped: number;
  received: number;
}
