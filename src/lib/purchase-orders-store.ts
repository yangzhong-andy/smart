/**
 * 采购订单数据存储
 * 运营下单 → 风控评估 → 审批 → 推送给采购 → 创建采购合同
 */

export type PurchaseOrderStatus = 
  | "待风控"           // 运营刚下单，等待风控评估
  | "风控通过"         // 风控评估通过
  | "风控拒绝"         // 风控评估拒绝
  | "待审批"           // 风控通过后，等待审批
  | "审批通过"         // 审批通过
  | "审批拒绝"         // 审批拒绝
  | "已推送采购"       // 已推送给采购同事
  | "已创建合同"       // 采购已基于此订单创建合同
  | "已取消";          // 订单已取消

export type PurchaseOrder = {
  id: string; // 订单ID
  orderNumber: string; // 订单编号（如：PO-20250115-001）
  
  // 下单信息（运营填写）
  createdBy: string; // 创建人（运营姓名）
  platform: "TikTok" | "Amazon" | "其他"; // 目标平台
  storeId?: string; // 目标店铺ID
  storeName?: string; // 目标店铺名称（冗余字段）
  sku: string; // 产品SKU
  skuId?: string; // 产品SKU ID
  productName?: string; // 产品名称（冗余字段）
  quantity: number; // 采购数量
  expectedDeliveryDate?: string; // 期望到货日期（ISO date）
  urgency: "普通" | "紧急" | "加急"; // 紧急程度
  notes?: string; // 备注说明
  
  // 风控评估
  riskControlStatus: "待评估" | "通过" | "拒绝";
  riskControlBy?: string; // 风控评估人
  riskControlAt?: string; // 风控评估时间
  riskControlNotes?: string; // 风控评估备注
  // 风控时的库存快照
  riskControlSnapshot?: {
    atFactory: number; // 工厂现货
    atDomestic: number; // 国内仓库存
    inTransit: number; // 在途数量
    totalAvailable: number; // 总可用库存
    needsRestock: boolean; // 是否需要补货
  };
  
  // 审批流程
  approvalStatus: "待审批" | "通过" | "拒绝";
  approvedBy?: string; // 审批人
  approvedAt?: string; // 审批时间
  approvalNotes?: string; // 审批备注
  
  // 采购关联
  pushedToProcurementAt?: string; // 推送给采购的时间
  procurementAssignedTo?: string; // 分配给哪个采购同事
  relatedContractId?: string; // 关联的采购合同ID
  relatedContractNumber?: string; // 关联的采购合同编号（冗余字段）
  
  // 状态
  status: PurchaseOrderStatus;
  
  // 元数据
  createdAt: string;
  updatedAt: string;
};

const PURCHASE_ORDERS_KEY = "purchaseOrders";

/**
 * 生成订单编号
 */
function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const timestamp = now.getTime();
  return `PO-${year}${month}${day}-${String(timestamp).slice(-6)}`;
}

/**
 * 获取所有采购订单
 */
export function getPurchaseOrders(): PurchaseOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(PURCHASE_ORDERS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse purchase orders", e);
    return [];
  }
}

/**
 * 保存采购订单列表
 */
export function savePurchaseOrders(orders: PurchaseOrder[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PURCHASE_ORDERS_KEY, JSON.stringify(orders));
  } catch (e) {
    console.error("Failed to save purchase orders", e);
  }
}

/**
 * 根据ID获取采购订单
 */
export function getPurchaseOrderById(id: string): PurchaseOrder | undefined {
  const orders = getPurchaseOrders();
  return orders.find((o) => o.id === id);
}

/**
 * 根据状态获取采购订单
 */
export function getPurchaseOrdersByStatus(status: PurchaseOrderStatus): PurchaseOrder[] {
  const orders = getPurchaseOrders();
  return orders.filter((o) => o.status === status);
}

/**
 * 获取待风控的订单
 */
export function getPendingRiskControlOrders(): PurchaseOrder[] {
  return getPurchaseOrdersByStatus("待风控");
}

/**
 * 获取待审批的订单
 */
export function getPendingApprovalOrders(): PurchaseOrder[] {
  return getPurchaseOrdersByStatus("待审批");
}

/**
 * 获取已推送采购的订单
 */
export function getPushedToProcurementOrders(): PurchaseOrder[] {
  return getPurchaseOrdersByStatus("已推送采购");
}

/**
 * 创建或更新采购订单
 */
export function upsertPurchaseOrder(order: PurchaseOrder): void {
  const orders = getPurchaseOrders();
  const index = orders.findIndex((o) => o.id === order.id);
  if (index >= 0) {
    orders[index] = { ...order, updatedAt: new Date().toISOString() };
  } else {
    orders.push({ ...order, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  savePurchaseOrders(orders);
}

/**
 * 创建新的采购订单（运营下单）
 */
export function createPurchaseOrder(
  data: Omit<PurchaseOrder, "id" | "orderNumber" | "status" | "riskControlStatus" | "approvalStatus" | "createdAt" | "updatedAt">
): PurchaseOrder {
  const newOrder: PurchaseOrder = {
    id: crypto.randomUUID(),
    orderNumber: generateOrderNumber(),
    ...data,
    status: "待风控",
    riskControlStatus: "待评估",
    approvalStatus: "待审批",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  upsertPurchaseOrder(newOrder);
  return newOrder;
}

/**
 * 删除采购订单
 */
export function deletePurchaseOrder(id: string): boolean {
  const orders = getPurchaseOrders();
  const index = orders.findIndex((o) => o.id === id);
  if (index >= 0) {
    orders.splice(index, 1);
    savePurchaseOrders(orders);
    return true;
  }
  return false;
}

/**
 * 风控评估：检查库存情况
 */
export function checkInventoryForRiskControl(skuId: string): {
  atFactory: number;
  atDomestic: number;
  inTransit: number;
  totalAvailable: number;
  needsRestock: boolean;
} {
  // 导入产品存储（避免循环依赖）
  try {
    const productsKey = "products";
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(productsKey) : null;
    if (stored) {
      const products = JSON.parse(stored);
      const product = products.find((p: any) => p.sku_id === skuId);
      if (product) {
        const atFactory = product.at_factory || 0;
        const atDomestic = product.at_domestic || 0;
        const inTransit = product.in_transit || 0;
        const totalAvailable = atFactory + atDomestic + inTransit;
        
        // 简单规则：如果总可用库存少于100，认为需要补货
        const needsRestock = totalAvailable < 100;
        
        return {
          atFactory,
          atDomestic,
          inTransit,
          totalAvailable,
          needsRestock
        };
      }
    }
  } catch (e) {
    console.error("Failed to check inventory", e);
  }
  
  return {
    atFactory: 0,
    atDomestic: 0,
    inTransit: 0,
    totalAvailable: 0,
    needsRestock: true
  };
}

/**
 * 执行风控评估
 */
export function performRiskControl(
  orderId: string,
  result: "通过" | "拒绝",
  notes: string,
  riskControlBy: string
): boolean {
  const order = getPurchaseOrderById(orderId);
  if (!order) return false;
  
  // 获取库存快照
  const inventorySnapshot = order.skuId 
    ? checkInventoryForRiskControl(order.skuId)
    : undefined;
  
  const updatedOrder: PurchaseOrder = {
    ...order,
    riskControlStatus: result,
    riskControlBy,
    riskControlAt: new Date().toISOString(),
    riskControlNotes: notes,
    riskControlSnapshot: inventorySnapshot,
    status: result === "通过" ? "待审批" : "风控拒绝",
    updatedAt: new Date().toISOString()
  };
  
  upsertPurchaseOrder(updatedOrder);
  return true;
}

/**
 * 审批订单
 */
export function approvePurchaseOrder(
  orderId: string,
  result: "通过" | "拒绝",
  notes: string,
  approvedBy: string
): boolean {
  const order = getPurchaseOrderById(orderId);
  if (!order) return false;
  
  const updatedOrder: PurchaseOrder = {
    ...order,
    approvalStatus: result,
    approvedBy,
    approvedAt: new Date().toISOString(),
    approvalNotes: notes,
    status: result === "通过" ? "已推送采购" : "审批拒绝",
    pushedToProcurementAt: result === "通过" ? new Date().toISOString() : order.pushedToProcurementAt,
    updatedAt: new Date().toISOString()
  };
  
  upsertPurchaseOrder(updatedOrder);
  return true;
}

/**
 * 关联采购合同（单个订单）
 */
export function linkPurchaseContract(
  orderId: string,
  contractId: string,
  contractNumber: string
): boolean {
  const order = getPurchaseOrderById(orderId);
  if (!order) return false;
  
  const updatedOrder: PurchaseOrder = {
    ...order,
    relatedContractId: contractId,
    relatedContractNumber: contractNumber,
    status: "已创建合同",
    updatedAt: new Date().toISOString()
  };
  
  upsertPurchaseOrder(updatedOrder);
  return true;
}

/**
 * 批量关联采购合同（多个订单合并）
 */
export function linkPurchaseContractBatch(
  orderIds: string[],
  contractId: string,
  contractNumber: string
): boolean {
  const orders = getPurchaseOrders();
  let successCount = 0;
  
  orderIds.forEach(orderId => {
    const order = orders.find(o => o.id === orderId);
    if (order && !order.relatedContractId) {
      const updatedOrder: PurchaseOrder = {
        ...order,
        relatedContractId: contractId,
        relatedContractNumber: contractNumber,
        status: "已创建合同",
        updatedAt: new Date().toISOString()
      };
      
      const index = orders.findIndex(o => o.id === orderId);
      if (index >= 0) {
        orders[index] = updatedOrder;
        successCount++;
      }
    }
  });
  
  if (successCount > 0) {
    savePurchaseOrders(orders);
  }
  
  return successCount === orderIds.length;
}
