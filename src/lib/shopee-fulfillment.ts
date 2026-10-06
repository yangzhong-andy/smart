export type ShopeePackageSnapshot = {
  packageNumber: string | null;
  trackingNumber: string | null;
  shippingCarrier: string | null;
  logisticsStatus: string | null;
};

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function parseShopeePackages(rawData: unknown): ShopeePackageSnapshot[] {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return [];
  const packages = (rawData as { package_list?: unknown }).package_list;
  if (!Array.isArray(packages)) return [];

  return packages.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    return [{
      packageNumber: text(item.package_number),
      trackingNumber: text(item.tracking_number),
      shippingCarrier: text(item.shipping_carrier),
      logisticsStatus: text(item.logistics_status),
    }];
  });
}

export function shopeeFulfillmentStage(status: string | null) {
  if (status === "READY_TO_SHIP" || status === "PROCESSED") return "pending";
  if (status === "SHIPPED" || status === "TO_CONFIRM_RECEIVE") return "shipping";
  if (status === "COMPLETED") return "completed";
  if (status === "CANCELLED" || status === "IN_CANCEL") return "cancelled";
  return "other";
}
