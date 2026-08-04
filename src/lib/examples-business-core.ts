/**
 * 业务核心架构使用示例
 * 展示如何在现有代码中使用UID和状态机
 */

import {
  generateBusinessUID,
  createBusinessRelation,
  traceBusinessUID,
  type BusinessEntityType
} from "./business-core";
import {
  enrichWithUID,
  createBusinessEntityWithRelations,
  safeTransitionStatus,
  linkBusinessEntities
} from "./business-utils";
import { transitionStatus, canPerformAction } from "./state-machine";
import type { BusinessStatus } from "./business-core";

/**
 * 示例1：创建账单时自动生成UID
 */
export function exampleCreateBillWithUID() {
  const bill = {
    id: "bill-123",
    month: "2026-01",
    billCategory: "Payable" as const,
    billType: "广告" as const,
    // ... 其他字段
  };

  // 方式1：使用 enrichWithUID 自动添加UID
  const billWithUID = enrichWithUID(bill, "BILL");
  console.log("账单UID:", billWithUID.uid);

  // 方式2：手动生成UID
  const uid = generateBusinessUID("BILL");
  const billWithManualUID = { ...bill, uid };
}

/**
 * 示例2：创建流水时建立与账单的关联
 */
export function exampleCreateCashFlowWithRelation() {
  const billUID = "BILL-1705123456789-A1B2C3D4";
  
  const cashFlow = {
    id: "flow-123",
    date: new Date().toISOString(),
    summary: "账单付款",
    // ... 其他字段
  };

  // 创建流水并建立关联
  const flowWithUID = createBusinessEntityWithRelations(
    cashFlow,
    "CASH_FLOW",
    [billUID],           // 关联的UID列表
    ["PAYMENT"]          // 关联类型列表
  );

  // 或者手动建立关联
  createBusinessRelation(
    flowWithUID.uid,
    billUID,
    "PAYMENT",
    { amount: 1000, currency: "USD" }
  );
}

/**
 * 示例3：状态转换
 */
export function exampleStatusTransition() {
  let currentStatus: BusinessStatus = "DRAFT";
  const entityUID = "BILL-1705123456789-A1B2C3D4";

  // 检查是否可以执行操作
  if (canPerformAction(currentStatus, "submit")) {
    // 执行状态转换
    const result = safeTransitionStatus(
      currentStatus,
      "SUBMITTED",
      entityUID,
      "提交审批"
    );

    if (result.success && result.newStatus) {
      currentStatus = result.newStatus;
      console.log("状态转换成功:", result.message);
    } else {
      console.error("状态转换失败:", result.message);
    }
  }
}

/**
 * 示例4：穿透查询
 */
export function exampleTraceBusiness() {
  const billUID = "BILL-1705123456789-A1B2C3D4";

  // 查询所有关联的业务数据
  const results = traceBusinessUID(billUID, 5);
  
  console.log("找到", results.length, "条关联记录");
  results.forEach((result) => {
    console.log(`- ${result.entityType}: ${result.status}`, result.data);
  });
}

/**
 * 示例5：批量建立关联关系
 */
export function exampleBatchRelations() {
  const billUID = "BILL-1705123456789-A1B2C3D4";
  const consumptionUIDs = [
    "CONSUMPTION-1705123456789-ABC123",
    "CONSUMPTION-1705123456789-DEF456"
  ];

  // 批量建立关联
  linkBusinessEntities(billUID, consumptionUIDs, "INCLUDES");
}

/**
 * 示例6：在审批流程中使用状态机
 */
export function exampleApprovalWorkflow() {
  const billUID = "BILL-1705123456789-A1B2C3D4";
  let status: BusinessStatus = "DRAFT";

  // 1. 提交审批
  if (canPerformAction(status, "submit")) {
    const result = transitionStatus(status, "SUBMITTED");
    if (result.success && result.newStatus) {
      status = result.newStatus;
    }
  }

  // 2. 进入审批中
  if (canPerformAction(status, "approve")) {
    const result = transitionStatus(status, "PENDING_APPROVAL");
    if (result.success && result.newStatus) {
      status = result.newStatus;
    }
  }

  // 3. 批准
  if (canPerformAction(status, "approve")) {
    const result = transitionStatus(status, "APPROVED");
    if (result.success && result.newStatus) {
      status = result.newStatus;
    }
  }

  // 4. 结清
  if (canPerformAction(status, "settle")) {
    const result = transitionStatus(status, "SETTLED");
    if (result.success && result.newStatus) {
      status = result.newStatus;
    }
  }
}
