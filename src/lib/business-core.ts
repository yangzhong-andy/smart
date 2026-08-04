/**
 * 业务核心架构 - 业财一体化基础
 * 
 * 1. 唯一标识符索引 (UID)：为每一笔订单、充值、回款生成全球唯一的业务 ID
 * 2. 状态机管理：将单据状态严格化（草稿、已提交、审批中、已结清、已冲销）
 * 3. 穿透查询：通过 UID 查询所有关联业务数据
 */

/**
 * 业务实体类型
 */
export type BusinessEntityType =
  | "ORDER"           // 采购订单
  | "RECHARGE"        // 充值记录
  | "CONSUMPTION"     // 消耗记录
  | "BILL"            // 账单
  | "PAYMENT_REQUEST" // 付款申请
  | "CASH_FLOW"       // 财务流水
  | "SETTLEMENT"      // 结算记录
  | "REBATE"          // 返点记录
  | "TRANSFER"        // 内部划拨
  | "ADJUSTMENT";     // 调整记录

/**
 * 统一状态机定义
 * 所有业务单据都遵循这个状态流转
 */
export type BusinessStatus =
  | "DRAFT"           // 草稿
  | "SUBMITTED"       // 已提交
  | "PENDING_APPROVAL" // 审批中
  | "APPROVED"        // 已批准
  | "REJECTED"        // 已退回
  | "SETTLED"         // 已结清
  | "REVERSED"        // 已冲销
  | "CANCELLED";      // 已取消

/**
 * 状态转换规则
 */
export const STATUS_TRANSITIONS: Record<BusinessStatus, BusinessStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["PENDING_APPROVAL", "DRAFT", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["SETTLED", "REVERSED"],
  REJECTED: ["DRAFT", "CANCELLED"],
  SETTLED: ["REVERSED"],
  REVERSED: [],
  CANCELLED: []
};

/**
 * 状态标签映射
 */
export const STATUS_LABELS: Record<BusinessStatus, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已提交",
  PENDING_APPROVAL: "审批中",
  APPROVED: "已批准",
  REJECTED: "已退回",
  SETTLED: "已结清",
  REVERSED: "已冲销",
  CANCELLED: "已取消"
};

/**
 * 状态颜色映射
 */
export const STATUS_COLORS: Record<BusinessStatus, string> = {
  DRAFT: "bg-slate-500/10 text-slate-300",
  SUBMITTED: "bg-blue-500/10 text-blue-300",
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-300",
  APPROVED: "bg-emerald-500/10 text-emerald-300",
  REJECTED: "bg-rose-500/10 text-rose-300",
  SETTLED: "bg-green-500/10 text-green-300",
  REVERSED: "bg-orange-500/10 text-orange-300",
  CANCELLED: "bg-gray-500/10 text-gray-300"
};

/**
 * 检查状态转换是否合法
 */
export function canTransitionStatus(
  currentStatus: BusinessStatus,
  targetStatus: BusinessStatus
): boolean {
  return STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
}

/**
 * 生成全局唯一业务ID (UID)
 * 格式：{ENTITY_TYPE}-{TIMESTAMP}-{RANDOM}
 * 例如：ORDER-1705123456789-a1b2c3d4
 */
export function generateBusinessUID(entityType: BusinessEntityType): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${entityType}-${timestamp}-${random}`;
}

/**
 * 从 UID 解析实体类型
 */
export function parseBusinessUID(uid: string): {
  entityType: BusinessEntityType | null;
  timestamp: number | null;
  random: string | null;
} {
  const parts = uid.split("-");
  if (parts.length < 3) {
    return { entityType: null, timestamp: null, random: null };
  }
  
  const entityType = parts[0] as BusinessEntityType;
  const timestamp = parseInt(parts[1], 10);
  const random = parts.slice(2).join("-");
  
  return {
    entityType: isNaN(timestamp) ? null : entityType,
    timestamp: isNaN(timestamp) ? null : timestamp,
    random: random || null
  };
}

/**
 * 业务关联关系
 */
export type BusinessRelation = {
  sourceUID: string;      // 源业务UID
  targetUID: string;      // 目标业务UID
  relationType: string;   // 关联类型：如 "PAYMENT", "SETTLEMENT", "REVERSAL" 等
  createdAt: string;      // 关联创建时间
  metadata?: Record<string, any>; // 额外元数据
};

/**
 * 业务实体基础接口
 */
export interface IBusinessEntity {
  uid: string;                    // 全局唯一业务ID
  entityType: BusinessEntityType; // 实体类型
  status: BusinessStatus;          // 当前状态
  createdAt: string;              // 创建时间
  updatedAt: string;              // 更新时间
  createdBy?: string;             // 创建人
  updatedBy?: string;             // 更新人
  relatedUIDs?: string[];        // 关联的业务UID列表
  metadata?: Record<string, any>; // 业务元数据
}

/**
 * 穿透查询结果
 */
export type BusinessTraceResult = {
  uid: string;
  entityType: BusinessEntityType;
  status: BusinessStatus;
  data: any;                      // 原始业务数据
  relations: BusinessRelation[];  // 关联关系
  tracePath: string[];            // 查询路径
};

/**
 * 业务关联索引存储
 */
const RELATIONS_KEY = "businessRelations";

/**
 * 从 API 获取所有业务关联（支持 sourceUID、targetUID 筛选）
 */
export async function getBusinessRelationsFromAPI(params?: { sourceUID?: string; targetUID?: string }): Promise<BusinessRelation[]> {
  if (typeof window === "undefined") return [];
  try {
    const searchParams = new URLSearchParams();
    if (params?.sourceUID) searchParams.set("sourceUID", params.sourceUID);
    if (params?.targetUID) searchParams.set("targetUID", params.targetUID);
    const url = `/api/business-relations${searchParams.toString() ? `?${searchParams}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    return list.map((r: any) => ({
      sourceUID: r.sourceUID,
      targetUID: r.targetUID,
      relationType: r.relationType,
      createdAt: r.createdAt,
      metadata: r.metadata,
    }));
  } catch (e) {
    console.error("Failed to fetch business relations from API", e);
    return [];
  }
}

/**
 * 保存业务关联关系（优先走 API，失败则落本地）
 */
export async function saveBusinessRelation(relation: BusinessRelation): Promise<void> {
  try {
    const res = await fetch("/api/business-relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(relation),
    });
    if (res.ok) return;
  } catch (e) {
    console.warn("Save business relation API failed, fallback to local", e);
  }
  if (typeof window === "undefined") return;
  try {
    const stored = window.localStorage.getItem(RELATIONS_KEY);
    const relations: BusinessRelation[] = stored ? JSON.parse(stored) : [];
    // 检查是否已存在相同的关联
    const exists = relations.some(
      (r) => r.sourceUID === relation.sourceUID && 
             r.targetUID === relation.targetUID && 
             r.relationType === relation.relationType
    );
    if (!exists) {
      relations.push(relation);
      window.localStorage.setItem(RELATIONS_KEY, JSON.stringify(relations));
    }
  } catch (e) {
    console.error("Failed to save business relation", e);
  }
}

/**
 * 获取所有业务关联关系
 */
export function getBusinessRelations(): BusinessRelation[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(RELATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Failed to get business relations", e);
    return [];
  }
}

/**
 * 根据 UID 查询关联的业务实体（同步，读本地）
 */
export function getRelatedEntities(uid: string): BusinessRelation[] {
  const relations = getBusinessRelations();
  return relations.filter(
    (r) => r.sourceUID === uid || r.targetUID === uid
  );
}

/**
 * 根据 UID 查询关联的业务实体（优先 API，失败则用本地）
 */
export async function getRelatedEntitiesFromAPI(uid: string): Promise<BusinessRelation[]> {
  try {
    const [bySource, byTarget] = await Promise.all([
      fetch(`/api/business-relations?sourceUID=${encodeURIComponent(uid)}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/business-relations?targetUID=${encodeURIComponent(uid)}`).then((r) => (r.ok ? r.json() : [])),
    ]);
    const seen = new Set<string>();
    const merged: BusinessRelation[] = [];
    for (const r of [...(Array.isArray(bySource) ? bySource : []), ...(Array.isArray(byTarget) ? byTarget : [])]) {
      const key = `${r.sourceUID}-${r.targetUID}-${r.relationType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        sourceUID: r.sourceUID,
        targetUID: r.targetUID,
        relationType: r.relationType,
        createdAt: r.createdAt,
        metadata: r.metadata,
      });
    }
    return merged;
  } catch (e) {
    console.warn("getRelatedEntitiesFromAPI failed, fallback to local", e);
    return getRelatedEntities(uid);
  }
}

/**
 * 穿透查询：通过UID查询所有关联的业务数据
 * 支持递归查询，返回完整的业务链路
 */
export function traceBusinessUID(
  uid: string,
  maxDepth: number = 5,
  visited: Set<string> = new Set()
): BusinessTraceResult[] {
  if (visited.has(uid) || visited.size >= maxDepth) {
    return [];
  }
  
  visited.add(uid);
  const results: BusinessTraceResult[] = [];
  
  // 解析UID获取实体类型
  const parsed = parseBusinessUID(uid);
  if (!parsed.entityType) {
    return results;
  }
  
  // 根据实体类型从对应的存储中查询数据
  let entityData: any = null;
  let status: BusinessStatus = "DRAFT";
  
  try {
    switch (parsed.entityType) {
      case "ORDER": {
        const stored = window.localStorage.getItem("purchaseOrders");
        if (stored) {
          try {
            const orders = JSON.parse(stored);
            entityData = orders.find((o: any) => o.uid === uid || o.id === uid);
            if (entityData) {
              // 映射订单状态到统一状态
              status = mapOrderStatusToBusinessStatus(entityData.status);
            }
          } catch (e) {
            console.error("Failed to parse purchaseOrders", e);
          }
        }
        break;
      }
      case "RECHARGE": {
        const stored = window.localStorage.getItem("adRecharges");
        if (stored) {
          try {
            const recharges = JSON.parse(stored);
            entityData = recharges.find((r: any) => r.uid === uid || r.id === uid);
            if (entityData) {
              status = mapRechargeStatusToBusinessStatus(entityData.paymentStatus);
            }
          } catch (e) {
            console.error("Failed to parse adRecharges", e);
          }
        }
        break;
      }
      case "BILL": {
        const stored = window.localStorage.getItem("monthlyBills");
        if (stored) {
          try {
            const bills = JSON.parse(stored);
            entityData = bills.find((b: any) => b.uid === uid || b.id === uid);
            if (entityData) {
              status = mapBillStatusToBusinessStatus(entityData.status);
            }
          } catch (e) {
            console.error("Failed to parse monthlyBills", e);
          }
        }
        break;
      }
      case "CONSUMPTION": {
        const stored = window.localStorage.getItem("adConsumptions");
        if (stored) {
          try {
            const consumptions = JSON.parse(stored);
            entityData = consumptions.find((c: any) => c.uid === uid || c.id === uid);
            if (entityData) {
              status = entityData.isSettled ? "SETTLED" : "PENDING_APPROVAL";
            }
          } catch (e) {
            console.error("Failed to parse adConsumptions", e);
          }
        }
        break;
      }
      case "PAYMENT_REQUEST": {
        const stored = window.localStorage.getItem("paymentRequests");
        if (stored) {
          try {
            const requests = JSON.parse(stored);
            entityData = requests.find((r: any) => r.uid === uid || r.id === uid);
            if (entityData) {
              status = mapBillStatusToBusinessStatus(entityData.status);
            }
          } catch (e) {
            console.error("Failed to parse paymentRequests", e);
          }
        }
        break;
      }
      case "CASH_FLOW": {
        const stored = window.localStorage.getItem("cashFlow");
        if (stored) {
          try {
            const flows = JSON.parse(stored);
            entityData = flows.find((f: any) => f.uid === uid || f.id === uid);
            if (entityData) {
              status = mapCashFlowStatusToBusinessStatus(entityData.status, entityData.isReversal);
            }
          } catch (e) {
            console.error("Failed to parse cashFlow", e);
          }
        }
        break;
      }
      case "REBATE": {
        const stored = window.localStorage.getItem("rebateReceivables");
        if (stored) {
          try {
            const rebates = JSON.parse(stored);
            entityData = rebates.find((r: any) => r.uid === uid || r.id === uid);
            if (entityData) {
              status = entityData.status === "待核销" ? "PENDING_APPROVAL" : "SETTLED";
            }
          } catch (e) {
            console.error("Failed to parse rebateReceivables", e);
          }
        }
        break;
      }
      // 可以继续添加其他实体类型的查询逻辑
    }
  } catch (e) {
    console.error(`Failed to query entity ${uid}`, e);
  }
  
  if (entityData) {
    const relations = getRelatedEntities(uid);
    results.push({
      uid,
      entityType: parsed.entityType,
      status,
      data: entityData,
      relations,
      tracePath: Array.from(visited)
    });
    
    // 递归查询关联的实体
    relations.forEach((rel) => {
      const relatedUID = rel.sourceUID === uid ? rel.targetUID : rel.sourceUID;
      const subResults = traceBusinessUID(relatedUID, maxDepth, new Set(visited));
      results.push(...subResults);
    });
  }
  
  return results;
}

/**
 * 状态映射函数：将各业务实体的状态映射到统一状态机
 */
function mapOrderStatusToBusinessStatus(orderStatus: string): BusinessStatus {
  const statusMap: Record<string, BusinessStatus> = {
    "待收货": "PENDING_APPROVAL",
    "部分收货": "PENDING_APPROVAL",
    "收货完成，待结清": "APPROVED"
  };
  return statusMap[orderStatus] || "DRAFT";
}

function mapRechargeStatusToBusinessStatus(paymentStatus: string): BusinessStatus {
  const statusMap: Record<string, BusinessStatus> = {
    "Pending": "PENDING_APPROVAL",
    "Paid": "SETTLED",
    "Cancelled": "CANCELLED"
  };
  return statusMap[paymentStatus] || "DRAFT";
}

function mapBillStatusToBusinessStatus(billStatus: string): BusinessStatus {
  const statusMap: Record<string, BusinessStatus> = {
    "Draft": "DRAFT",
    "Pending_Approval": "PENDING_APPROVAL",
    "Approved": "APPROVED",
    "Paid": "SETTLED"
  };
  return statusMap[billStatus] || "DRAFT";
}

function mapCashFlowStatusToBusinessStatus(
  flowStatus: string | undefined,
  isReversal: boolean | undefined
): BusinessStatus {
  if (isReversal) return "REVERSED";
  if (flowStatus === "confirmed") return "SETTLED";
  if (flowStatus === "pending") return "PENDING_APPROVAL";
  return "DRAFT";
}

/**
 * 创建业务关联关系
 */
export function createBusinessRelation(
  sourceUID: string,
  targetUID: string,
  relationType: string,
  metadata?: Record<string, any>
): void {
  const relation: BusinessRelation = {
    sourceUID,
    targetUID,
    relationType,
    createdAt: new Date().toISOString(),
    metadata
  };
  void saveBusinessRelation(relation);
}

/**
 * 批量创建业务关联关系（异步）
 */
export async function createBusinessRelations(relations: Omit<BusinessRelation, "createdAt">[]): Promise<void> {
  await Promise.all(
    relations.map((rel) =>
      saveBusinessRelation({
        ...rel,
        createdAt: new Date().toISOString()
      })
    )
  );
}

/**
 * 获取业务实体的完整链路（向上和向下追溯）
 */
export function getBusinessChain(uid: string): {
  upstream: BusinessTraceResult[];  // 上游业务（来源）
  downstream: BusinessTraceResult[]; // 下游业务（去向）
} {
  const relations = getRelatedEntities(uid);
  const upstream: BusinessTraceResult[] = [];
  const downstream: BusinessTraceResult[] = [];
  
  relations.forEach((rel) => {
    if (rel.targetUID === uid) {
      // 上游：指向当前实体的
      const results = traceBusinessUID(rel.sourceUID, 3);
      upstream.push(...results);
    } else if (rel.sourceUID === uid) {
      // 下游：当前实体指向的
      const results = traceBusinessUID(rel.targetUID, 3);
      downstream.push(...results);
    }
  });
  
  return { upstream, downstream };
}
