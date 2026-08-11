export const EXPORT_TAX_STATUSES = [
  "DRAFT",
  "DECLARING",
  "INVOICING",
  "TAX_POINT_PENDING",
  "REFUND_PENDING",
  "PARTIAL_REFUNDED",
  "COMPLETED",
  "CANCELLED",
] as const;

export const EXPORT_TAX_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  DECLARING: "申报中",
  INVOICING: "开票中",
  TAX_POINT_PENDING: "待付税点",
  REFUND_PENDING: "待退税",
  PARTIAL_REFUNDED: "部分退税",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  NOT_REQUIRED: "无需开票",
  PENDING: "待开票",
  PARTIAL: "部分开票",
  RECEIVED: "已收票",
};

export const TAX_POINT_STATUS_LABELS: Record<string, string> = {
  NOT_REQUIRED: "无需支付",
  PENDING: "待支付",
  PARTIAL: "部分支付",
  PAID: "已支付",
};

export const REFUND_STATUS_LABELS: Record<string, string> = {
  NOT_REQUIRED: "无需退税",
  PENDING: "待申请",
  APPLIED: "已申请",
  PARTIAL: "部分到账",
  RECEIVED: "已到账",
  REJECTED: "已退回",
};

export type ExportTaxSourceItem = {
  contractItemId: string;
  sku: string;
  skuName?: string;
  spec?: string;
  customsName?: string;
  purchaseUnitPrice: number;
  deliveryQty: number;
  invoiceUsedQty: number;
  refundUsedQty: number;
  invoiceAvailableQty: number;
  refundAvailableQty: number;
};

export type ExportTaxCaseItem = {
  id: string;
  contractItemId: string;
  sku: string;
  skuName?: string;
  spec?: string;
  qty: number;
  needsInvoice: boolean;
  needsTaxRefund: boolean;
  purchaseUnitPrice: number;
  purchaseAmount: number;
  declarationUnitPrice: number;
  declarationAmount: number;
  invoiceUnitPrice?: number;
  invoiceAmount: number;
  taxRate?: number;
  refundRate?: number;
  estimatedRefundAmount: number;
  hsCode?: string;
  customsName?: string;
};

export type ExportTaxCase = {
  id: string;
  caseNumber: string;
  deliveryOrderId: string;
  deliveryNumber: string;
  contractId: string;
  contractNumber: string;
  supplierId?: string;
  supplierName: string;
  exporterId?: string;
  exporterName?: string;
  destinationCountry?: string;
  status: string;
  declarationCurrency: string;
  declarationAmount: number;
  customsDeclarationNumber?: string;
  declarationDate?: string;
  declarationVouchers: string[];
  invoiceStatus: string;
  invoiceCurrency: string;
  invoiceAmount: number;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceReceivedDate?: string;
  invoiceVouchers: string[];
  taxPointStatus: string;
  taxPointRate?: number;
  taxPointAmount: number;
  taxPointPaidAmount: number;
  taxPointPaidDate?: string;
  taxPointVouchers: string[];
  refundStatus: string;
  refundCurrency: string;
  refundRate?: number;
  refundClaimAmount: number;
  refundReceivedAmount: number;
  refundApplicationDate?: string;
  refundReceivedDate?: string;
  refundVouchers: string[];
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: ExportTaxCaseItem[];
};
