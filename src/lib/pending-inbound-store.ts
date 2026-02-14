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

/** 从 API 获取待入库列表 */
export async function getPendingInboundFromAPI(deliveryOrderId?: string, status?: string): Promise<PendingInbound[]> {
  if (typeof window === "undefined") return [];
  try {
    const params = new URLSearchParams();
    if (deliveryOrderId) params.set("deliveryOrderId", deliveryOrderId);
    if (status) params.set("status", status);
    const url = params.toString() ? `/api/pending-inbound?${params}` : "/api/pending-inbound";
    const fullUrl = url + (url.includes("?") ? "&" : "?") + "page=1&pageSize=500";
    const res = await fetch(fullUrl);
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data?.data ?? []);
    return list.map((i: any) => ({ ...i, batches: i.batches || [] }));
  } catch (e) {
    console.error("Failed to fetch pending inbound", e);
    return [];
  }
}

export async function savePendingInbound(items: PendingInbound[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const existing = await getPendingInboundFromAPI();
    const existingIds = new Set(existing.map((i) => i.id));
    const newIds = new Set(items.map((i) => i.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) await fetch(`/api/pending-inbound/${e.id}`, { method: "DELETE" });
    }
    for (const i of items) {
      const body = { ...i };
      if (existingIds.has(i.id)) {
        await fetch(`/api/pending-inbound/${i.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      } else {
        await fetch("/api/pending-inbound", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      }
    }
  } catch (e) {
    console.error("Failed to save pending inbound", e);
    throw e;
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

export async function upsertPendingInbound(item: PendingInbound): Promise<void> {
  const body = { ...item, updatedAt: new Date().toISOString() };
  const existing = await getPendingInboundFromAPI();
  const exists = existing.some((i) => i.id === item.id);
  if (exists) {
    const res = await fetch(`/api/pending-inbound/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to update pending inbound");
  } else {
    const res = await fetch("/api/pending-inbound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to create pending inbound");
  }
}

export async function deletePendingInbound(id: string): Promise<boolean> {
  const res = await fetch(`/api/pending-inbound/${id}`, { method: "DELETE" });
  return res.ok;
}

/** 从 API 根据 deliveryOrderId 查询是否已有待入库单 */
export async function getPendingInboundByDeliveryOrderIdFromAPI(deliveryOrderId: string): Promise<PendingInbound | undefined> {
  const items = await getPendingInboundFromAPI(deliveryOrderId);
  return items.find((i) => i.deliveryOrderId === deliveryOrderId);
}

/**
 * 从子单创建待入库单（子单创建后自动调用）
 */
export async function createPendingInboundFromDeliveryOrder(deliveryOrderId: string): Promise<{ success: boolean; inbound?: PendingInbound; error?: string }> {
  const { getDeliveryOrdersFromAPI } = await import("./delivery-orders-store");
  const { getPurchaseContractByIdFromAPI } = await import("./purchase-contracts-store");

  const orders = await getDeliveryOrdersFromAPI();
  const deliveryOrder = orders.find((o) => o.id === deliveryOrderId);
  if (!deliveryOrder) return { success: false, error: "拿货单不存在" };

  const contract = await getPurchaseContractByIdFromAPI(deliveryOrder.contractId);
  if (!contract) return { success: false, error: "关联的合同不存在" };

  const existing = await getPendingInboundByDeliveryOrderIdFromAPI(deliveryOrderId);
  if (existing) return { success: false, error: "该拿货单已存在待入库单" };

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

  await upsertPendingInbound(newInbound);
  return { success: true, inbound: newInbound };
}
