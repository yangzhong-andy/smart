/**
 * 采购母单（合同）数据存储
 * 支持分批拿货业务模式
 */

export type PurchaseContractStatus = "待发货" | "部分发货" | "发货完成" | "已结清" | "已取消";

export type PurchaseContract = {
  id: string; // 合同ID
  contractNumber: string; // 合同编号
  supplierId: string; // 供应商ID
  supplierName: string; // 供应商名称
  sku: string; // SKU（商品代码/名称）
  skuId?: string; // 关联的产品SKU ID
  unitPrice: number; // 单价
  totalQty: number; // 合同总数
  pickedQty: number; // 已取货数
  finishedQty?: number; // 工厂完工数量（默认0）
  totalAmount: number; // 合同总额
  depositRate: number; // 定金比例（%）
  depositAmount: number; // 定金金额
  depositPaid: number; // 已付定金
  tailPeriodDays: number; // 尾款账期（天）
  deliveryDate?: string; // 交货日期（ISO date，用于跟进生产进度）
  status: PurchaseContractStatus; // 合同状态
  contractVoucher?: string | string[]; // 合同凭证（支持多图，Base64或URL）
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
  // 财务相关
  totalPaid: number; // 已付总额（定金+所有已付子单尾款）
  totalOwed: number; // 还欠金额（合同总额 - 已付总额）
  // 关联采购订单（支持多个订单合并）
  relatedOrderIds?: string[]; // 关联的采购订单ID列表
  relatedOrderNumbers?: string[]; // 关联的采购订单编号列表（冗余字段）
  // 向后兼容：保留单个订单关联
  relatedOrderId?: string; // 关联的采购订单ID（已废弃，使用 relatedOrderIds）
  relatedOrderNumber?: string; // 关联的采购订单编号（已废弃，使用 relatedOrderNumbers）
  // 合同明细（多 SKU/变体），API 返回时带上
  items?: PurchaseContractItem[];
};

export type PurchaseContractItem = {
  id: string;
  variantId?: string;
  sku: string;
  skuName?: string;
  spec?: string;
  unitPrice: number;
  qty: number;
  pickedQty: number;
  finishedQty: number;
  totalAmount: number;
  sortOrder?: number;
  /** SPU 名称（产品原型，如马扎05） */
  spuName?: string;
  /** SPU ID */
  spuId?: string;
};

const CONTRACTS_KEY = "purchaseContracts";

export function getPurchaseContracts(): PurchaseContract[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(CONTRACTS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse purchase contracts", e);
    return [];
  }
}

export async function getPurchaseContractsFromAPI(): Promise<PurchaseContract[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/purchase-contracts");
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch purchase contracts", e);
    return [];
  }
}

export async function savePurchaseContracts(contracts: PurchaseContract[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const existing = await getPurchaseContractsFromAPI();
    const existingIds = new Set(existing.map((c) => c.id));
    const newIds = new Set(contracts.map((c) => c.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) {
        await fetch(`/api/purchase-contracts/${e.id}`, { method: "DELETE" });
      }
    }
    for (const c of contracts) {
      const body = { ...c };
      if (existingIds.has(c.id)) {
        await fetch(`/api/purchase-contracts/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      } else {
        await fetch("/api/purchase-contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      }
    }
  } catch (e) {
    console.error("Failed to save purchase contracts", e);
    throw e;
  }
}

export function getPurchaseContractById(id: string): PurchaseContract | undefined {
  const contracts = getPurchaseContracts();
  return contracts.find((c) => c.id === id);
}

export async function upsertPurchaseContract(contract: PurchaseContract): Promise<void> {
  const body = { ...contract, updatedAt: new Date().toISOString() };
  const existing = await getPurchaseContractsFromAPI();
  const exists = existing.some((c) => c.id === contract.id);
  if (exists) {
    const res = await fetch(`/api/purchase-contracts/${contract.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to update purchase contract");
  } else {
    const res = await fetch("/api/purchase-contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to create purchase contract");
  }
}

export async function deletePurchaseContract(id: string): Promise<boolean> {
  const res = await fetch(`/api/purchase-contracts/${id}`, { method: "DELETE" });
  return res.ok;
}

/**
 * 从 API 根据 ID 获取采购合同
 */
export async function getPurchaseContractByIdFromAPI(id: string): Promise<PurchaseContract | undefined> {
  try {
    const res = await fetch(`/api/purchase-contracts/${id}`);
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

/**
 * 更新合同已取货数量（子单创建后自动调用）
 */
export async function updateContractPickedQty(contractId: string, additionalQty: number): Promise<boolean> {
  const contract = await getPurchaseContractByIdFromAPI(contractId);
  if (!contract) return false;
  const newPickedQty = contract.pickedQty + additionalQty;
  if (newPickedQty > contract.totalQty) return false;
  const updated: PurchaseContract = {
    ...contract,
    pickedQty: newPickedQty,
    status: (newPickedQty >= contract.totalQty ? "发货完成" : newPickedQty > 0 ? "部分发货" : "待发货") as PurchaseContractStatus,
    updatedAt: new Date().toISOString()
  };
  await upsertPurchaseContract(updated);
  return true;
}

/** 财务/工厂页使用的「旧版 PO」格式（合同 + 发货单汇总） */
export type LegacyPurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  totalAmount: number;
  depositRate: number;
  depositAmount: number;
  depositPaid: number;
  tailPeriodDays: number;
  receivedQty: number;
  status: "待收货" | "部分收货" | "收货完成，待结清" | "已清款";
  receipts: Array<{ id: string; qty: number; tailAmount: number; dueDate: string; createdAt: string }>;
  createdAt: string;
};

const CONTRACT_STATUS_TO_LEGACY: Record<string, "待收货" | "部分收货" | "收货完成，待结清" | "已清款"> = {
  待发货: "待收货",
  部分发货: "部分收货",
  发货完成: "收货完成，待结清",
  已结清: "已清款",
  已取消: "已清款"
};

/** 从 API 获取并转为财务/工厂页使用的旧版 PO 列表 */
export async function getLegacyPurchaseOrdersFromAPI(): Promise<LegacyPurchaseOrder[]> {
  const { getDeliveryOrdersFromAPI } = await import("./delivery-orders-store");
  const [contracts, deliveryOrders] = await Promise.all([
    getPurchaseContractsFromAPI(),
    getDeliveryOrdersFromAPI()
  ]);
  return contracts.map((c: PurchaseContract) => {
    const dos = deliveryOrders.filter((o: { contractId: string }) => o.contractId === c.id);
    const receivedQty = dos.reduce((sum: number, o: { qty: number }) => sum + o.qty, 0);
    const receipts = dos.map((o: { id: string; qty: number; tailAmount: number; tailDueDate?: string; createdAt: string }) => ({
      id: o.id,
      qty: o.qty,
      tailAmount: o.tailAmount,
      dueDate: o.tailDueDate || o.createdAt,
      createdAt: o.createdAt
    }));
    return {
      id: c.id,
      poNumber: c.contractNumber,
      supplierId: c.supplierId || "",
      supplierName: c.supplierName,
      sku: c.sku,
      unitPrice: c.unitPrice,
      quantity: c.totalQty,
      totalAmount: c.totalAmount,
      depositRate: c.depositRate,
      depositAmount: c.depositAmount,
      depositPaid: c.depositPaid || 0,
      tailPeriodDays: c.tailPeriodDays,
      receivedQty,
      status: (CONTRACT_STATUS_TO_LEGACY[c.status] || "待收货") as "待收货" | "部分收货" | "收货完成，待结清" | "已清款",
      receipts,
      createdAt: c.createdAt
    };
  });
}

/**
 * 更新合同财务信息（支付后调用）
 */
export async function updateContractPayment(contractId: string, amount: number, type: "deposit" | "tail"): Promise<boolean> {
  const contract = await getPurchaseContractByIdFromAPI(contractId);
  if (!contract) return false;
  const totalPaid = (contract.totalPaid || 0) + amount;
  const updated = {
    ...contract,
    ...(type === "deposit" ? { depositPaid: (contract.depositPaid || 0) + amount } : {}),
    totalPaid,
    totalOwed: contract.totalAmount - totalPaid,
    status: totalPaid >= contract.totalAmount ? "已结清" : contract.status,
    updatedAt: new Date().toISOString()
  };
  await upsertPurchaseContract(updated);
  return true;
}
