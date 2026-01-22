/**
 * 供应链数据中心化存储
 * 统一管理订单追踪、文档关联等逻辑
 */

export type OrderStatus = "采购中" | "生产中" | "已发货" | "部分到货" | "已到货" | "已完成";

export type OrderTracking = {
  id: string;
  poId: string;
  status: OrderStatus;
  statusDate: string; // 状态变更日期
  notes?: string; // 状态备注
  createdAt: string;
};

export type BatchReceipt = {
  id: string;
  poId: string;
  receiptId: string; // 关联到 PurchaseOrder.receipts[].id
  qty: number; // 本次拿货数量
  receivedQty: number; // 实际到货数量
  ownership: {
    storeId: string; // 货权归属店铺
    storeName: string;
    percentage: number; // 货权比例（0-100）
  }[];
  receivedDate: string;
  createdAt: string;
};

export type Document = {
  id: string;
  entityType: "factory" | "order"; // 关联类型：工厂/订单
  entityId: string; // 关联ID
  name: string; // 文档名称
  type: "contract" | "invoice" | "packing_list" | "other"; // 文档类型
  fileUrl?: string; // 文件URL（实际项目中可能是文件路径或云存储URL）
  uploadDate: string;
  uploadedBy?: string;
  notes?: string;
};

export type SalesVelocity = {
  storeId: string;
  storeName: string;
  sku: string;
  dailySales: number; // 日均销量
  currentStock: number; // 当前库存
  inTransitQty: number; // 在途数量
  daysUntilStockout: number; // 预计断货天数
  recommendedRestock: number; // 建议补货数量
  lastUpdated: string;
};

const TRACKING_KEY = "orderTracking";
const BATCH_RECEIPTS_KEY = "batchReceipts";
const DOCUMENTS_KEY = "documents";
const SALES_VELOCITY_KEY = "salesVelocity";

/**
 * 获取订单追踪记录
 */
export function getOrderTracking(poId?: string): OrderTracking[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(TRACKING_KEY);
    if (!stored) return [];
    const all = JSON.parse(stored);
    return poId ? all.filter((t: OrderTracking) => t.poId === poId) : all;
  } catch (e) {
    console.error("Failed to parse order tracking", e);
    return [];
  }
}

/**
 * 保存订单追踪记录
 */
export function saveOrderTracking(tracking: OrderTracking[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRACKING_KEY, JSON.stringify(tracking));
  } catch (e) {
    console.error("Failed to save order tracking", e);
  }
}

/**
 * 添加订单追踪记录
 */
export function addOrderTracking(poId: string, status: OrderStatus, notes?: string): OrderTracking {
  const tracking: OrderTracking = {
    id: crypto.randomUUID(),
    poId,
    status,
    statusDate: new Date().toISOString(),
    notes,
    createdAt: new Date().toISOString()
  };
  const all = getOrderTracking();
  all.push(tracking);
  saveOrderTracking(all);
  return tracking;
}

/**
 * 获取分批拿货记录
 */
export function getBatchReceipts(poId?: string): BatchReceipt[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(BATCH_RECEIPTS_KEY);
    if (!stored) return [];
    const all = JSON.parse(stored);
    return poId ? all.filter((b: BatchReceipt) => b.poId === poId) : all;
  } catch (e) {
    console.error("Failed to parse batch receipts", e);
    return [];
  }
}

/**
 * 保存分批拿货记录
 */
export function saveBatchReceipts(receipts: BatchReceipt[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BATCH_RECEIPTS_KEY, JSON.stringify(receipts));
  } catch (e) {
    console.error("Failed to save batch receipts", e);
  }
}

/**
 * 获取文档列表
 */
export function getDocuments(entityType?: "factory" | "order", entityId?: string): Document[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(DOCUMENTS_KEY);
    if (!stored) return [];
    const all = JSON.parse(stored);
    return all.filter((d: Document) => {
      if (entityType && d.entityType !== entityType) return false;
      if (entityId && d.entityId !== entityId) return false;
      return true;
    });
  } catch (e) {
    console.error("Failed to parse documents", e);
    return [];
  }
}

/**
 * 保存文档列表
 */
export function saveDocuments(documents: Document[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents));
  } catch (e) {
    console.error("Failed to save documents", e);
  }
}

/**
 * 添加文档
 */
export function addDocument(document: Omit<Document, "id" | "uploadDate">): Document {
  const newDoc: Document = {
    ...document,
    id: crypto.randomUUID(),
    uploadDate: new Date().toISOString()
  };
  const all = getDocuments();
  all.push(newDoc);
  saveDocuments(all);
  return newDoc;
}

/**
 * 删除文档
 */
export function deleteDocument(docId: string): void {
  const all = getDocuments();
  const filtered = all.filter((d) => d.id !== docId);
  saveDocuments(filtered);
}

/**
 * 获取销售速度数据
 */
export function getSalesVelocity(): SalesVelocity[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(SALES_VELOCITY_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse sales velocity", e);
    return [];
  }
}

/**
 * 保存销售速度数据
 */
export function saveSalesVelocity(velocity: SalesVelocity[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SALES_VELOCITY_KEY, JSON.stringify(velocity));
  } catch (e) {
    console.error("Failed to save sales velocity", e);
  }
}
