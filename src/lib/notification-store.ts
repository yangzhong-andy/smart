/**
 * 通知系统数据存储
 * 管理审批通过后的付款通知等
 */

export type NotificationType = "payment_required" | "approval_rejected" | "payment_completed" | "cashier_review_required" | "finance_payment_required";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedId: string; // 关联的账单ID或其他业务ID
  relatedType: "monthly_bill" | "payment_request" | "other";
  createdAt: string;
  read: boolean;
  readAt?: string;
  actionUrl?: string; // 点击通知后跳转的URL
  priority: "high" | "medium" | "low";
};

const NOTIFICATIONS_KEY = "notifications";

/**
 * 获取所有通知
 */
export function getNotifications(): Notification[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(NOTIFICATIONS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * 保存通知列表
 */
export function saveNotifications(notifications: Notification[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
}

/**
 * 创建新通知
 */
export function createNotification(notification: Omit<Notification, "id" | "createdAt" | "read">): Notification {
  const newNotification: Notification = {
    ...notification,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  
  const notifications = getNotifications();
  notifications.unshift(newNotification); // 新通知放在最前面
  saveNotifications(notifications);
  
  return newNotification;
}

/**
 * 标记通知为已读
 */
export function markNotificationAsRead(notificationId: string): void {
  const notifications = getNotifications();
  const updated = notifications.map((n) =>
    n.id === notificationId
      ? { ...n, read: true, readAt: new Date().toISOString() }
      : n
  );
  saveNotifications(updated);
}

/**
 * 标记所有通知为已读
 */
export function markAllNotificationsAsRead(): void {
  const notifications = getNotifications();
  const updated = notifications.map((n) =>
    !n.read ? { ...n, read: true, readAt: new Date().toISOString() } : n
  );
  saveNotifications(updated);
}

/**
 * 删除通知
 */
export function deleteNotification(notificationId: string): void {
  const notifications = getNotifications();
  const filtered = notifications.filter((n) => n.id !== notificationId);
  saveNotifications(filtered);
}

/**
 * 获取未读通知数量
 */
export function getUnreadNotificationCount(): number {
  const notifications = getNotifications();
  return notifications.filter((n) => !n.read).length;
}

/**
 * 获取未读通知列表
 */
export function getUnreadNotifications(): Notification[] {
  const notifications = getNotifications();
  return notifications.filter((n) => !n.read);
}

/**
 * 根据关联ID和类型查找通知
 */
export function findNotificationsByRelated(
  relatedId: string,
  relatedType: Notification["relatedType"]
): Notification[] {
  const notifications = getNotifications();
  return notifications.filter(
    (n) => n.relatedId === relatedId && n.relatedType === relatedType
  );
}

/**
 * 创建出纳打款通知（审批通过后调用）
 */
export function createPaymentNotification(
  billId: string,
  billType: string,
  billMonth: string,
  amount: number,
  currency: string,
  payeeName: string
): Notification {
  return createNotification({
    type: "payment_required",
    title: "待出纳打款",
    message: `${billType} - ${payeeName} - ${billMonth}月账单已审批通过，金额：${currency} ${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}，请出纳进行打款。`,
    relatedId: billId,
    relatedType: "monthly_bill",
    actionUrl: `/finance/reconciliation?billId=${billId}&tab=PendingPayment`,
    priority: "high",
  });
}
