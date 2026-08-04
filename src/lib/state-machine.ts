/**
 * 状态机管理工具
 * 提供统一的状态转换、验证和管理功能
 */

import {
  type BusinessStatus,
  STATUS_TRANSITIONS,
  STATUS_LABELS,
  STATUS_COLORS,
  canTransitionStatus
} from "./business-core";

/**
 * 状态转换结果
 */
export type StatusTransitionResult = {
  success: boolean;
  message: string;
  previousStatus?: BusinessStatus;
  newStatus?: BusinessStatus;
};

/**
 * 执行状态转换
 */
export function transitionStatus(
  currentStatus: BusinessStatus,
  targetStatus: BusinessStatus,
  reason?: string
): StatusTransitionResult {
  if (currentStatus === targetStatus) {
    return {
      success: true,
      message: "状态未变化",
      previousStatus: currentStatus,
      newStatus: targetStatus
    };
  }

  if (!canTransitionStatus(currentStatus, targetStatus)) {
    return {
      success: false,
      message: `无法从"${STATUS_LABELS[currentStatus]}"转换到"${STATUS_LABELS[targetStatus]}"。允许的转换：${STATUS_TRANSITIONS[currentStatus]?.map(s => STATUS_LABELS[s]).join("、") || "无"}`,
      previousStatus: currentStatus
    };
  }

  return {
    success: true,
    message: reason || `状态已从"${STATUS_LABELS[currentStatus]}"转换为"${STATUS_LABELS[targetStatus]}"`,
    previousStatus: currentStatus,
    newStatus: targetStatus
  };
}

/**
 * 获取状态的所有可能转换
 */
export function getAvailableTransitions(currentStatus: BusinessStatus): BusinessStatus[] {
  return STATUS_TRANSITIONS[currentStatus] || [];
}

/**
 * 获取状态的显示信息
 */
export function getStatusInfo(status: BusinessStatus) {
  return {
    label: STATUS_LABELS[status],
    color: STATUS_COLORS[status],
    availableTransitions: getAvailableTransitions(status)
  };
}

/**
 * 检查状态是否允许操作
 */
export function canPerformAction(
  status: BusinessStatus,
  action: "edit" | "submit" | "approve" | "reject" | "settle" | "reverse" | "cancel"
): boolean {
  switch (action) {
    case "edit":
      return status === "DRAFT" || status === "REJECTED";
    case "submit":
      return status === "DRAFT" || status === "REJECTED";
    case "approve":
      return status === "PENDING_APPROVAL";
    case "reject":
      return status === "PENDING_APPROVAL";
    case "settle":
      return status === "APPROVED";
    case "reverse":
      return status === "SETTLED" || status === "APPROVED";
    case "cancel":
      return status !== "SETTLED" && status !== "REVERSED" && status !== "CANCELLED";
    default:
      return false;
  }
}
