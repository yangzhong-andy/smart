export const DELIVERY_ALERT_DAYS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export function deliveryAlertCutoff(now = new Date()) {
  return new Date(now.getTime() - DELIVERY_ALERT_DAYS * DAY_MS);
}

export function isDeliveryOverdue(
  status: string | null | undefined,
  createTime: Date | string | null | undefined,
  now = new Date(),
) {
  if (status !== "IN_TRANSIT" || !createTime) return false;
  const createdAt = new Date(createTime);
  if (Number.isNaN(createdAt.getTime())) return false;
  return createdAt.getTime() < deliveryAlertCutoff(now).getTime();
}

export function deliveryAlertAgeDays(
  createTime: Date | string | null | undefined,
  now = new Date(),
) {
  if (!createTime) return null;
  const createdAt = new Date(createTime);
  if (Number.isNaN(createdAt.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS));
}
