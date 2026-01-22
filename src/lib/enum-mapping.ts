// 映射 Prisma enum 值 <-> 中文展示
export const SETTLE_BASE_LABEL: Record<"SHIPMENT" | "INBOUND", string> = {
  SHIPMENT: "发货",
  INBOUND: "入库",
};

export const SETTLE_BASE_VALUE: Record<string, "SHIPMENT" | "INBOUND"> = {
  发货: "SHIPMENT",
  入库: "INBOUND",
};

export const INVOICE_REQUIREMENT_LABEL: Record<"SPECIAL_INVOICE" | "GENERAL_INVOICE" | "NO_INVOICE", string> = {
  SPECIAL_INVOICE: "专票",
  GENERAL_INVOICE: "普票",
  NO_INVOICE: "不开票",
};

export const INVOICE_REQUIREMENT_VALUE: Record<string, "SPECIAL_INVOICE" | "GENERAL_INVOICE" | "NO_INVOICE"> = {
  专票: "SPECIAL_INVOICE",
  普票: "GENERAL_INVOICE",
  不开票: "NO_INVOICE",
};

export const PRODUCT_STATUS_LABEL: Record<"ACTIVE" | "INACTIVE", string> = {
  ACTIVE: "在售",
  INACTIVE: "下架",
};

export const PRODUCT_STATUS_VALUE: Record<string, "ACTIVE" | "INACTIVE"> = {
  在售: "ACTIVE",
  下架: "INACTIVE",
};
