/**
 * 库存变动记录系统
 * 记录所有库存变动操作，实现完整的可追溯性
 */

export type InventoryMovementType = 
  | "工厂完工"           // 工厂生产完成，增加工厂现货
  | "工厂发货"           // 从工厂发货，减少工厂现货，增加待入库
  | "国内入库"           // 国内仓库入库，增加国内库存
  | "国内出库"           // 国内仓库出库，减少国内库存
  | "海运发货"           // 从国内发货到海外，减少国内库存，增加海运中
  | "海运到货"           // 海运到达，减少海运中（可增加海外仓库存，如果未来支持）
  | "库存调拨"           // 仓库间调拨
  | "库存盘点"           // 盘点调整
  | "库存调整"           // 其他调整（如损耗、退货等）
  | "寄样出库";          // 达人寄样出库

export type InventoryLocation = 
  | "factory"      // 工厂现货
  | "domestic"     // 国内待发
  | "transit"      // 海运中
  | "overseas";    // 海外仓（未来支持）

export type InventoryMovement = {
  id: string;                    // 唯一ID
  skuId: string;                 // SKU ID
  skuName?: string;              // SKU名称（冗余，方便查询）
  movementType: InventoryMovementType;  // 变动类型
  location: InventoryLocation;    // 变动位置
  qty: number;                   // 变动数量（正数=增加，负数=减少）
  qtyBefore: number;             // 变动前数量
  qtyAfter: number;              // 变动后数量
  unitCost?: number;             // 单位成本（用于成本核算）
  totalCost?: number;            // 总成本（qty * unitCost）
  currency?: string;             // 币种
  
  // 关联信息
  relatedOrderId?: string;      // 关联订单ID（如采购合同ID、出库单ID等）
  relatedOrderNumber?: string;   // 关联订单号（如采购合同号、出库单号等）
  relatedOrderType?: string;     // 关联订单类型（如"采购合同"、"出库单"等）
  
  // 操作信息
  operator?: string;             // 操作人
  operationDate: string;          // 操作日期
  notes?: string;                 // 备注
  
  // 元数据
  createdAt: string;              // 创建时间
};

const INVENTORY_MOVEMENTS_KEY = "inventoryMovements";

/**
 * 获取所有库存变动记录（同步，localStorage）
 */
export function getInventoryMovements(): InventoryMovement[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(INVENTORY_MOVEMENTS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse inventory movements", e);
    return [];
  }
}

/**
 * 从 API 获取库存变动记录
 */
export async function getInventoryMovementsFromAPI(params?: {
  variantId?: string;
  location?: InventoryLocation;
  movementType?: InventoryMovementType;
}): Promise<InventoryMovement[]> {
  if (typeof window === "undefined") return [];
  try {
    const query = new URLSearchParams();
    if (params?.variantId) query.set("variantId", params.variantId);
    if (params?.location) query.set("location", params.location);
    if (params?.movementType) query.set("movementType", params.movementType);
    const url = query.toString() ? `/api/inventory-movements?${query}` : "/api/inventory-movements";
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch inventory movements", e);
    return [];
  }
}

/**
 * 保存库存变动记录（同步到 API）
 */
export async function saveInventoryMovements(movements: InventoryMovement[]): Promise<void> {
  if (typeof window === "undefined") return;
  // 简化：只用于 localStorage 向后兼容；新数据走 addInventoryMovement
  window.localStorage.setItem(INVENTORY_MOVEMENTS_KEY, JSON.stringify(movements));
}

/**
 * 添加库存变动记录（同步到 API）
 */
export async function addInventoryMovement(movement: Omit<InventoryMovement, "id" | "createdAt">): Promise<InventoryMovement> {
  const newMovement: InventoryMovement = {
    ...movement,
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `movement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  try {
    const res = await fetch("/api/inventory-movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId: movement.skuId,
        location: movement.location,
        movementType: movement.movementType,
        qty: movement.qty,
        qtyBefore: movement.qtyBefore,
        qtyAfter: movement.qtyAfter,
        unitCost: movement.unitCost,
        totalCost: movement.totalCost,
        currency: movement.currency,
        relatedOrderId: movement.relatedOrderId,
        relatedOrderType: movement.relatedOrderType,
        relatedOrderNumber: movement.relatedOrderNumber,
        operator: movement.operator,
        operationDate: movement.operationDate,
        notes: movement.notes
      })
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Failed to add inventory movement to API", e);
  }
  // 回退到 localStorage
  const movements = getInventoryMovements();
  movements.push(newMovement);
  window.localStorage.setItem(INVENTORY_MOVEMENTS_KEY, JSON.stringify(movements));
  return newMovement;
}

/**
 * 根据SKU ID获取变动记录
 */
export function getMovementsBySkuId(skuId: string): InventoryMovement[] {
  const movements = getInventoryMovements();
  return movements
    .filter((m) => m.skuId === skuId)
    .sort((a, b) => new Date(b.operationDate).getTime() - new Date(a.operationDate).getTime());
}

/**
 * 根据订单ID获取变动记录
 */
export function getMovementsByOrderId(orderId: string): InventoryMovement[] {
  const movements = getInventoryMovements();
  return movements
    .filter((m) => m.relatedOrderId === orderId)
    .sort((a, b) => new Date(b.operationDate).getTime() - new Date(a.operationDate).getTime());
}

/**
 * 根据日期范围获取变动记录
 */
export function getMovementsByDateRange(startDate: string, endDate: string): InventoryMovement[] {
  const movements = getInventoryMovements();
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  return movements
    .filter((m) => {
      const date = new Date(m.operationDate).getTime();
      return date >= start && date <= end;
    })
    .sort((a, b) => new Date(b.operationDate).getTime() - new Date(a.operationDate).getTime());
}

/**
 * 根据变动类型获取变动记录
 */
export function getMovementsByType(movementType: InventoryMovementType): InventoryMovement[] {
  const movements = getInventoryMovements();
  return movements
    .filter((m) => m.movementType === movementType)
    .sort((a, b) => new Date(b.operationDate).getTime() - new Date(a.operationDate).getTime());
}

/**
 * 获取库存变动统计
 */
export function getMovementStats(skuId?: string) {
  const movements = skuId ? getMovementsBySkuId(skuId) : getInventoryMovements();
  
  const stats = {
    totalMovements: movements.length,
    totalIn: 0,      // 总入库数量
    totalOut: 0,     // 总出库数量
    totalCost: 0,    // 总成本
    byType: {} as Record<InventoryMovementType, number>,
  };
  
  movements.forEach((m) => {
    if (m.qty > 0) {
      stats.totalIn += m.qty;
    } else {
      stats.totalOut += Math.abs(m.qty);
    }
    
    if (m.totalCost) {
      stats.totalCost += m.totalCost;
    }
    
    if (!stats.byType[m.movementType]) {
      stats.byType[m.movementType] = 0;
    }
    stats.byType[m.movementType] += Math.abs(m.qty);
  });
  
  return stats;
}
