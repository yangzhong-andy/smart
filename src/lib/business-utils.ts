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
 * 从旧ID迁移到UID（兼容性处理）
 */
export function migrateToUID<T extends { id: string; uid?: string }>(
  entity: T,
  entityType: BusinessEntityType
): T & { uid: string } {
  if (entity.uid) {
    return entity as T & { uid: string };
  }
  
  // 为旧数据生成UID
  const uid = generateBusinessUID(entityType);
  
  // 建立旧ID到新UID的映射关系（用于查询兼容）
  if (typeof window !== "undefined") {
    const mappingKey = "uidIdMapping";
    const stored = window.localStorage.getItem(mappingKey);
    const mapping: Record<string, string> = stored ? JSON.parse(stored) : {};
    mapping[entity.id] = uid;
    window.localStorage.setItem(mappingKey, JSON.stringify(mapping));
  }
  
  return {
    ...entity,
    uid
  };
}

/**
 * 通过旧ID查找UID
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
