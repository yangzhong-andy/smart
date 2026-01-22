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

export function saveDeliveryOrders(orders: DeliveryOrder[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DELIVERY_ORDERS_KEY, JSON.stringify(orders));
  } catch (e) {
    console.error("Failed to save delivery orders", e);
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

export function upsertDeliveryOrder(order: DeliveryOrder): void {
  const orders = getDeliveryOrders();
  const index = orders.findIndex((o) => o.id === order.id);
  if (index >= 0) {
    orders[index] = { ...order, updatedAt: new Date().toISOString() };
  } else {
    orders.push({ ...order, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  saveDeliveryOrders(orders);
}

export function deleteDeliveryOrder(id: string): boolean {
  const orders = getDeliveryOrders();
  const index = orders.findIndex((o) => o.id === id);
  if (index >= 0) {
    orders.splice(index, 1);
    saveDeliveryOrders(orders);
    return true;
  }
  return false;
}

/**
 * 创建新的拿货单（子单）
 * 会自动更新母单的已取货数量
 */
export function createDeliveryOrder(
  contractId: string,
  qty: number,
  domesticTrackingNumber?: string,
  shippedDate?: string
): { success: boolean; order?: DeliveryOrder; error?: string } {
  // 导入母单存储（避免循环依赖）
  const contractsKey = "purchaseContracts";
  let contract: any = null;
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(contractsKey) : null;
    if (stored) {
      const contracts = JSON.parse(stored);
      contract = contracts.find((c: any) => c.id === contractId);
    }
  } catch (e) {
    console.error("Failed to load contract", e);
  }

  if (!contract) {
    return { success: false, error: "合同不存在" };
  }

  // 检查剩余数量
  const remainingQty = contract.totalQty - contract.pickedQty;
  if (qty > remainingQty) {
    return { success: false, error: `本次拿货数量 ${qty} 超过剩余数量 ${remainingQty}` };
  }

  if (qty <= 0) {
    return { success: false, error: "拿货数量必须大于 0" };
  }

  // 计算本次尾款金额
  const tailBase = contract.totalAmount - contract.depositAmount;
  const tailAmount = tailBase * (qty / contract.totalQty);

  // 计算尾款到期日
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

  // 保存子单
  upsertDeliveryOrder(newOrder);

  // 更新母单的已取货数量
  try {
    const contracts = JSON.parse(typeof window !== "undefined" ? window.localStorage.getItem(contractsKey) || "[]" : "[]");
    const contractIndex = contracts.findIndex((c: any) => c.id === contractId);
    if (contractIndex >= 0) {
      contracts[contractIndex].pickedQty = (contracts[contractIndex].pickedQty || 0) + qty;
      contracts[contractIndex].status =
        contracts[contractIndex].pickedQty >= contracts[contractIndex].totalQty
          ? "发货完成"
          : contracts[contractIndex].pickedQty > 0
            ? "部分发货"
            : "待发货";
      contracts[contractIndex].updatedAt = new Date().toISOString();
      if (typeof window !== "undefined") {
        window.localStorage.setItem(contractsKey, JSON.stringify(contracts));
      }
    }
  } catch (e) {
    console.error("Failed to update contract picked qty", e);
  }

  return { success: true, order: newOrder };
}

/**
 * 更新子单尾款支付状态
 */
export function updateDeliveryOrderPayment(orderId: string, amount: number): boolean {
  const orders = getDeliveryOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) return false;

  order.tailPaid = (order.tailPaid || 0) + amount;
  order.updatedAt = new Date().toISOString();

  saveDeliveryOrders(orders);

  // 同时更新母单的财务信息
  try {
    const contractsKey = "purchaseContracts";
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(contractsKey) : null;
    if (stored) {
      const contracts = JSON.parse(stored);
      const contract = contracts.find((c: any) => c.id === order.contractId);
      if (contract) {
        contract.totalPaid = (contract.totalPaid || 0) + amount;
        contract.totalOwed = contract.totalAmount - contract.totalPaid;
        contract.updatedAt = new Date().toISOString();
        if (contract.totalPaid >= contract.totalAmount) {
          contract.status = "已结清";
        }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(contractsKey, JSON.stringify(contracts));
        }
      }
    }
  } catch (e) {
    console.error("Failed to update contract payment", e);
  }

  return true;
}
