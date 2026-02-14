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
 * 从 API 获取所有通知（支持 relatedId、relatedType、read 筛选）
 */
export async function getNotificationsFromAPI(params?: {
  relatedId?: string;
  relatedType?: Notification["relatedType"];
  read?: boolean;
}): Promise<Notification[]> {
  if (typeof window === "undefined") return [];
  try {
    const searchParams = new URLSearchParams();
    if (params?.relatedId) searchParams.set("relatedId", params.relatedId);
    if (params?.relatedType) searchParams.set("relatedType", params.relatedType);
    if (params?.read !== undefined) searchParams.set("read", String(params.read));
    const url = `/api/notifications${searchParams.toString() ? `?${searchParams}` : ""}`;
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + "page=1&pageSize=500");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data?.data ?? []);
  } catch (e) {
    console.error("Failed to fetch notifications from API", e);
    return [];
  }
}

/**
 * 获取所有通知（本地缓存，同步）
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
 * 创建新通知（优先走 API，失败时落本地）
 */
export async function createNotification(notification: Omit<Notification, "id" | "createdAt" | "read">): Promise<Notification> {
  try {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notification),
    });
    if (res.ok) {
      const created = await res.json();
      return { ...created, readAt: created.readAt ?? undefined };
    }
  } catch (e) {
    console.warn("Create notification API failed, fallback to local", e);
  }
  const newNotification: Notification = {
    ...notification,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  const notifications = getNotifications();
  notifications.unshift(newNotification);
  saveNotifications(notifications);
  return newNotification;
}

/**
 * 标记通知为已读（优先走 API，并更新本地）
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    const res = await fetch(`/api/notifications/${notificationId}`, { method: "PATCH" });
    if (res.ok) {
      const notifications = getNotifications();
      const updated = notifications.map((n) =>
        n.id === notificationId
          ? { ...n, read: true, readAt: new Date().toISOString() }
          : n
      );
      saveNotifications(updated);
      return;
    }
  } catch (e) {
    console.warn("Mark notification read API failed, fallback to local", e);
  }
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
 * 根据关联ID和类型查找通知（优先 API，失败则用本地）
 */
export async function findNotificationsByRelated(
  relatedId: string,
  relatedType: Notification["relatedType"]
): Promise<Notification[]> {
  try {
    const list = await getNotificationsFromAPI({ relatedId, relatedType });
    if (list.length >= 0) return list;
  } catch (_) {}
  const notifications = getNotifications();
  return notifications.filter(
    (n) => n.relatedId === relatedId && n.relatedType === relatedType
  );
}

/**
 * 创建出纳打款通知（审批通过后调用，异步）
 */
export async function createPaymentNotification(
  billId: string,
  billType: string,
  billMonth: string,
  amount: number,
  currency: string,
  payeeName: string
): Promise<Notification> {
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
