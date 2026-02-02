/**
 * 采购子单（拿货单）数据存储
 * 关联母单，记录单次拿货信息
 */

export type DeliveryOrderStatus = "待发货" | "已发货" | "运输中" | "已入库" | "已取消";

export type DeliveryOrder = {
  id: string; // 子单ID
  deliveryNumber: string; // 拿货单号
  contractId: string; // 关联的母单（合同）ID
  contractNumber: string; // 合同编号（冗余字段）
  qty: number; // 本次拿货数量
  domesticTrackingNumber?: string; // 国内物流单号
  shippedDate?: string; // 发货日期（ISO date）
  status: DeliveryOrderStatus; // 子单状态
  // 财务相关
  tailAmount: number; // 本次尾款金额
  tailPaid: number; // 已付尾款
  tailDueDate?: string; // 尾款到期日（ISO date）
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
};

const DELIVERY_ORDERS_KEY = "deliveryOrders";

export function getDeliveryOrders(): DeliveryOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(DELIVERY_ORDERS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse delivery orders", e);
    return [];
  }
}

export async function getDeliveryOrdersFromAPI(contractId?: string): Promise<DeliveryOrder[]> {
  if (typeof window === "undefined") return [];
  try {
    const url = contractId ? `/api/delivery-orders?contractId=${encodeURIComponent(contractId)}` : "/api/delivery-orders";
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch delivery orders", e);
    return [];
  }
}

export async function saveDeliveryOrders(orders: DeliveryOrder[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const existing = await getDeliveryOrdersFromAPI();
    const existingIds = new Set(existing.map((o) => o.id));
    const newIds = new Set(orders.map((o) => o.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) {
        await fetch(`/api/delivery-orders/${e.id}`, { method: "DELETE" });
      }
    }
    for (const o of orders) {
      const body = { ...o };
      if (existingIds.has(o.id)) {
        await fetch(`/api/delivery-orders/${o.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      } else {
        await fetch("/api/delivery-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      }
    }
  } catch (e) {
    console.error("Failed to save delivery orders", e);
    throw e;
  }
}

export function getDeliveryOrderById(id: string): DeliveryOrder | undefined {
  const orders = getDeliveryOrders();
  return orders.find((o) => o.id === id);
}

export function getDeliveryOrdersByContractId(contractId: string): DeliveryOrder[] {
  const orders = getDeliveryOrders();
  return orders.filter((o) => o.contractId === contractId);
}

export async function upsertDeliveryOrder(order: DeliveryOrder): Promise<void> {
  const body = { ...order, updatedAt: new Date().toISOString() };
  const existing = await getDeliveryOrdersFromAPI();
  const exists = existing.some((o) => o.id === order.id);
  if (exists) {
    const res = await fetch(`/api/delivery-orders/${order.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to update delivery order");
  } else {
    const res = await fetch("/api/delivery-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to create delivery order");
  }
}

export async function deleteDeliveryOrder(id: string): Promise<boolean> {
  const res = await fetch(`/api/delivery-orders/${id}`, { method: "DELETE" });
  return res.ok;
}

/**
 * 创建新的拿货单（子单）
 * 会自动更新母单的已取货数量
 */
export async function createDeliveryOrder(
  contractId: string,
  qty: number,
  domesticTrackingNumber?: string,
  shippedDate?: string
): Promise<{ success: boolean; order?: DeliveryOrder; error?: string }> {
  const { getPurchaseContractByIdFromAPI } = await import("./purchase-contracts-store");
  const contract = await getPurchaseContractByIdFromAPI(contractId);
  if (!contract) return { success: false, error: "合同不存在" };

  const remainingQty = contract.totalQty - contract.pickedQty;
  if (qty > remainingQty) {
    return { success: false, error: `本次拿货数量 ${qty} 超过剩余数量 ${remainingQty}` };
  }
  if (qty <= 0) return { success: false, error: "拿货数量必须大于 0" };

  const tailBase = contract.totalAmount - contract.depositAmount;
  const tailAmount = tailBase * (qty / contract.totalQty);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + contract.tailPeriodDays);

  const newOrder: DeliveryOrder = {
    id: crypto.randomUUID(),
    deliveryNumber: `DO-${Date.now()}`,
    contractId,
    contractNumber: contract.contractNumber,
    qty,
    domesticTrackingNumber,
    shippedDate: shippedDate || new Date().toISOString().slice(0, 10),
    status: "待发货",
    tailAmount,
    tailPaid: 0,
    tailDueDate: dueDate.toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await upsertDeliveryOrder(newOrder);

  const { updateContractPickedQty } = await import("./purchase-contracts-store");
  await updateContractPickedQty(contractId, qty);

  return { success: true, order: newOrder };
}

/**
 * 更新子单尾款支付状态
 */
export async function updateDeliveryOrderPayment(orderId: string, amount: number): Promise<boolean> {
  const orders = await getDeliveryOrdersFromAPI();
  const order = orders.find((o) => o.id === orderId);
  if (!order) return false;

  const updated = { ...order, tailPaid: (order.tailPaid || 0) + amount, updatedAt: new Date().toISOString() };
  await upsertDeliveryOrder(updated);

  const { updateContractPayment } = await import("./purchase-contracts-store");
  await updateContractPayment(order.contractId, amount, "tail");

  return true;
}
