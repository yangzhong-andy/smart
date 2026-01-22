/**
 * 待入库数据存储
 * 用于衔接采购子单和库存入库
 */

export type PendingInboundStatus = "待入库" | "部分入库" | "已入库" | "已取消";

export type PendingInbound = {
  id: string; // 待入库单ID
  inboundNumber: string; // 入库单号
  deliveryOrderId: string; // 关联的拿货单（子单）ID
  deliveryNumber: string; // 拿货单号（冗余字段）
  contractId: string; // 关联的合同（母单）ID
  contractNumber: string; // 合同编号（冗余字段）
  sku: string; // SKU
  skuId?: string; // 关联的产品SKU ID
  qty: number; // 待入库数量
  receivedQty: number; // 已入库数量
  domesticTrackingNumber?: string; // 国内物流单号
  shippedDate?: string; // 发货日期
  status: PendingInboundStatus; // 状态
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
};

const PENDING_INBOUND_KEY = "pendingInbound";

export function getPendingInbound(): PendingInbound[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(PENDING_INBOUND_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse pending inbound", e);
    return [];
  }
}

export function savePendingInbound(items: PendingInbound[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_INBOUND_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("Failed to save pending inbound", e);
  }
}

export function getPendingInboundById(id: string): PendingInbound | undefined {
  const items = getPendingInbound();
  return items.find((i) => i.id === id);
}

export function getPendingInboundByDeliveryOrderId(deliveryOrderId: string): PendingInbound | undefined {
  const items = getPendingInbound();
  return items.find((i) => i.deliveryOrderId === deliveryOrderId);
}

export function upsertPendingInbound(item: PendingInbound): void {
  const items = getPendingInbound();
  const index = items.findIndex((i) => i.id === item.id);
  if (index >= 0) {
    items[index] = { ...item, updatedAt: new Date().toISOString() };
  } else {
    items.push({ ...item, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  savePendingInbound(items);
}

export function deletePendingInbound(id: string): boolean {
  const items = getPendingInbound();
  const index = items.findIndex((i) => i.id === id);
  if (index >= 0) {
    items.splice(index, 1);
    savePendingInbound(items);
    return true;
  }
  return false;
}

/**
 * 从子单创建待入库单（子单创建后自动调用）
 */
export function createPendingInboundFromDeliveryOrder(deliveryOrderId: string): { success: boolean; inbound?: PendingInbound; error?: string } {
  // 加载子单数据
  const deliveryOrdersKey = "deliveryOrders";
  const contractsKey = "purchaseContracts";
  let deliveryOrder: any = null;
  let contract: any = null;

  try {
    const storedOrders = typeof window !== "undefined" ? window.localStorage.getItem(deliveryOrdersKey) : null;
    if (storedOrders) {
      const orders = JSON.parse(storedOrders);
      deliveryOrder = orders.find((o: any) => o.id === deliveryOrderId);
    }

    if (deliveryOrder) {
      const storedContracts = typeof window !== "undefined" ? window.localStorage.getItem(contractsKey) : null;
      if (storedContracts) {
        const contracts = JSON.parse(storedContracts);
        contract = contracts.find((c: any) => c.id === deliveryOrder.contractId);
      }
    }
  } catch (e) {
    console.error("Failed to load delivery order or contract", e);
  }

  if (!deliveryOrder) {
    return { success: false, error: "拿货单不存在" };
  }

  if (!contract) {
    return { success: false, error: "关联的合同不存在" };
  }

  // 检查是否已存在待入库单
  const existing = getPendingInboundByDeliveryOrderId(deliveryOrderId);
  if (existing) {
    return { success: false, error: "该拿货单已存在待入库单" };
  }

  const newInbound: PendingInbound = {
    id: crypto.randomUUID(),
    inboundNumber: `IN-${Date.now()}`,
    deliveryOrderId,
    deliveryNumber: deliveryOrder.deliveryNumber,
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    sku: contract.sku,
    skuId: contract.skuId,
    qty: deliveryOrder.qty,
    receivedQty: 0,
    domesticTrackingNumber: deliveryOrder.domesticTrackingNumber,
    shippedDate: deliveryOrder.shippedDate,
    status: "待入库",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  upsertPendingInbound(newInbound);
  return { success: true, inbound: newInbound };
}
