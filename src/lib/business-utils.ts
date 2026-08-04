/**
 * 业务工具函数
 * 提供便捷的业务实体创建、UID生成、关联关系建立等功能
 */

import {
  generateBusinessUID,
  createBusinessRelation,
  type BusinessEntityType,
  type BusinessRelation
} from "./business-core";
import { transitionStatus, type StatusTransitionResult } from "./state-machine";
import type { BusinessStatus } from "./business-core";

/**
 * 为业务实体自动生成并添加 UID
 */
export function enrichWithUID<T extends { id: string; uid?: string }>(
  entity: T,
  entityType: BusinessEntityType
): T & { uid: string } {
  if (entity.uid) {
    return entity as T & { uid: string };
  }
  return {
    ...entity,
    uid: generateBusinessUID(entityType)
  };
}

/**
 * 创建业务实体并建立关联关系
 */
export function createBusinessEntityWithRelations<T extends { id: string; uid?: string }>(
  entity: T,
  entityType: BusinessEntityType,
  relatedUIDs?: string[],
  relationTypes?: string[]
): T & { uid: string } {
  const enriched = enrichWithUID(entity, entityType);
  
  // 建立关联关系
  if (relatedUIDs && relationTypes) {
    relatedUIDs.forEach((relatedUID, index) => {
      const relationType = relationTypes[index] || "RELATED";
      createBusinessRelation(enriched.uid, relatedUID, relationType);
    });
  }
  
  return enriched;
}

/**
 * 状态转换包装器（带日志记录）
 */
export function safeTransitionStatus(
  currentStatus: BusinessStatus,
  targetStatus: BusinessStatus,
  entityUID: string,
  reason?: string
): StatusTransitionResult {
  const result = transitionStatus(currentStatus, targetStatus, reason);
  
  if (result.success) {
    console.log(`[状态转换] ${entityUID}: ${result.message}`);
  } else {
    console.warn(`[状态转换失败] ${entityUID}: ${result.message}`);
  }
  
  return result;
}

/**
 * 批量建立业务关联关系
 */
export function linkBusinessEntities(
  sourceUID: string,
  targetUIDs: string[],
  relationType: string
): void {
  targetUIDs.forEach((targetUID) => {
    createBusinessRelation(sourceUID, targetUID, relationType);
  });
}

/**
 * 从旧ID迁移到UID（兼容性处理）- 优先写 API，失败则落本地
 */
export function migrateToUID<T extends { id: string; uid?: string }>(
  entity: T,
  entityType: BusinessEntityType
): T & { uid: string } {
  if (entity.uid) {
    return entity as T & { uid: string };
  }

  const uid = generateBusinessUID(entityType);

  if (typeof window !== "undefined") {
    const writeLocal = () => {
      const mappingKey = "uidIdMapping";
      const stored = window.localStorage.getItem(mappingKey);
      const mapping: Record<string, string> = stored ? JSON.parse(stored) : {};
      mapping[entity.id] = uid;
      window.localStorage.setItem(mappingKey, JSON.stringify(mapping));
    };
    fetch("/api/business-uid-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, oldId: entity.id, uid }),
    })
      .then((res) => { if (res.ok) writeLocal(); })
      .catch(writeLocal);
  }

  return { ...entity, uid };
}

/**
 * 通过旧ID查找UID（同步：仅读本地；异步用 findUIDByOldIdFromAPI）
 */
export function findUIDByOldId(oldId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const mappingKey = "uidIdMapping";
    const stored = window.localStorage.getItem(mappingKey);
    if (!stored) return null;
    const mapping: Record<string, string> = JSON.parse(stored);
    return mapping[oldId] || null;
  } catch {
    return null;
  }
}

/**
 * 通过旧ID查找UID（优先 API，失败则读本地）
 */
export async function findUIDByOldIdFromAPI(oldId: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`/api/business-uid-mappings?oldId=${encodeURIComponent(oldId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.uid) return data.uid;
    }
  } catch (_) {}
  return findUIDByOldId(oldId);
}

/**
 * 业务实体类型到存储键的映射
 */
export const ENTITY_STORAGE_KEYS: Record<BusinessEntityType, string> = {
  ORDER: "purchaseOrders",
  RECHARGE: "adRecharges",
  CONSUMPTION: "adConsumptions",
  BILL: "monthlyBills",
  PAYMENT_REQUEST: "paymentRequests",
  CASH_FLOW: "cashFlow",
  SETTLEMENT: "settlements",
  REBATE: "rebateReceivables",
  TRANSFER: "transfers",
  ADJUSTMENT: "adjustments"
};
