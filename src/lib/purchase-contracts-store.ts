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

export function savePurchaseContracts(contracts: PurchaseContract[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONTRACTS_KEY, JSON.stringify(contracts));
  } catch (e) {
    console.error("Failed to save purchase contracts", e);
  }
}

export function getPurchaseContractById(id: string): PurchaseContract | undefined {
  const contracts = getPurchaseContracts();
  return contracts.find((c) => c.id === id);
}

export function upsertPurchaseContract(contract: PurchaseContract): void {
  const contracts = getPurchaseContracts();
  const index = contracts.findIndex((c) => c.id === contract.id);
  if (index >= 0) {
    contracts[index] = { ...contract, updatedAt: new Date().toISOString() };
  } else {
    contracts.push({ ...contract, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  savePurchaseContracts(contracts);
}

export function deletePurchaseContract(id: string): boolean {
  const contracts = getPurchaseContracts();
  const index = contracts.findIndex((c) => c.id === id);
  if (index >= 0) {
    contracts.splice(index, 1);
    savePurchaseContracts(contracts);
    return true;
  }
  return false;
}

/**
 * 更新合同已取货数量（子单创建后自动调用）
 */
export function updateContractPickedQty(contractId: string, additionalQty: number): boolean {
  const contracts = getPurchaseContracts();
  const contract = contracts.find((c) => c.id === contractId);
  if (!contract) return false;

  const newPickedQty = contract.pickedQty + additionalQty;
  if (newPickedQty > contract.totalQty) {
    console.error(`Cannot update picked qty: ${newPickedQty} exceeds total qty ${contract.totalQty}`);
    return false;
  }

  contract.pickedQty = newPickedQty;
  contract.status =
    newPickedQty >= contract.totalQty
      ? "发货完成"
      : newPickedQty > 0
        ? "部分发货"
        : "待发货";
  contract.updatedAt = new Date().toISOString();

  savePurchaseContracts(contracts);
  return true;
}

/**
 * 更新合同财务信息（支付后调用）
 */
export function updateContractPayment(contractId: string, amount: number, type: "deposit" | "tail"): boolean {
  const contracts = getPurchaseContracts();
  const contract = contracts.find((c) => c.id === contractId);
  if (!contract) return false;

  if (type === "deposit") {
    contract.depositPaid = (contract.depositPaid || 0) + amount;
  }
  contract.totalPaid = (contract.totalPaid || 0) + amount;
  contract.totalOwed = contract.totalAmount - contract.totalPaid;
  contract.updatedAt = new Date().toISOString();

  // 如果已付总额 >= 合同总额，标记为已结清
  if (contract.totalPaid >= contract.totalAmount) {
    contract.status = "已结清";
  }

  savePurchaseContracts(contracts);
  return true;
}
