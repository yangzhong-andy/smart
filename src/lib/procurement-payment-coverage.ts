export const ACTIVE_PURCHASE_PAYMENT_STATUSES = [
  "Pending_Approval",
  "Approved",
  "Paid",
] as const;

export type ActivePurchasePaymentStatus =
  (typeof ACTIVE_PURCHASE_PAYMENT_STATUSES)[number];

export type PurchasePaymentRequestSummary = {
  id: string;
  relatedId: string | null;
  status: string;
  summary: string;
  category?: string;
  amount?: number;
  currency?: string;
  businessNumber?: string | null;
};

export type ProcurementPaymentCoverage = {
  blocked: boolean;
  linkedOrderCount: number;
  activeRequestCount: number;
  pendingApprovalCount: number;
  approvedCount: number;
  paidCount: number;
  requests: Array<{
    id: string;
    deliveryOrderId: string;
    status: ActivePurchasePaymentStatus;
    summary: string;
    amount?: number;
    currency?: string;
  }>;
};

const activeStatusSet = new Set<string>(ACTIVE_PURCHASE_PAYMENT_STATUSES);

function isPurchaseTailRequest(request: PurchasePaymentRequestSummary): boolean {
  return Boolean(
    request.category === "采购/采购尾款" ||
      request.summary.includes("采购尾款") ||
      request.summary.toLowerCase().includes("purchase tail")
  );
}

export function parseRelatedIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))
    );
  }
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    return parseRelatedIds(JSON.parse(value));
  } catch {
    return Array.from(
      new Set(value.split(",").map((id) => id.trim()).filter(Boolean))
    );
  }
}

export function isActivePurchaseTailRequest(
  request: PurchasePaymentRequestSummary
): request is PurchasePaymentRequestSummary & {
  relatedId: string;
  status: ActivePurchasePaymentStatus;
} {
  return Boolean(
    request.relatedId &&
      activeStatusSet.has(request.status) &&
      isPurchaseTailRequest(request)
  );
}

export function buildProcurementPaymentCoverage(
  deliveryOrderIds: string[],
  requests: PurchasePaymentRequestSummary[]
): ProcurementPaymentCoverage | undefined {
  const orderIdSet = new Set(deliveryOrderIds);
  const matched = requests
    .filter(isActivePurchaseTailRequest)
    .filter((request) => orderIdSet.has(request.relatedId));

  if (matched.length === 0) return undefined;

  const linkedOrderCount = new Set(matched.map((request) => request.relatedId)).size;
  return {
    blocked: true,
    linkedOrderCount,
    activeRequestCount: matched.length,
    pendingApprovalCount: matched.filter((request) => request.status === "Pending_Approval").length,
    approvedCount: matched.filter((request) => request.status === "Approved").length,
    paidCount: matched.filter((request) => request.status === "Paid").length,
    requests: matched.map((request) => ({
      id: request.id,
      deliveryOrderId: request.relatedId,
      status: request.status,
      summary: request.summary,
      amount: request.amount,
      currency: request.currency,
    })),
  };
}

export function procurementPaymentCoverageLabel(
  coverage: ProcurementPaymentCoverage
): string {
  if (coverage.approvedCount > 0) return "已由拿货单发起，待财务付款";
  if (coverage.pendingApprovalCount > 0) return "已由拿货单发起，待主管审批";
  return "已由拿货单付款";
}

export function extractDeliveryNumbers(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return Array.from(new Set(value.match(/DO-\d+/gi)?.map((item) => item.toUpperCase()) || []));
}

export function calculateProcurementActualPaidAmount(
  deliveryOrderIds: string[],
  deliveryNumbers: string[],
  requests: PurchasePaymentRequestSummary[],
  currency: string
): number | undefined {
  const orderIdSet = new Set(deliveryOrderIds);
  const deliveryNumberSet = new Set(deliveryNumbers.map((item) => item.toUpperCase()));
  const matched = requests.filter((request) => {
    if (request.status !== "Paid" || !isPurchaseTailRequest(request)) return false;
    if (request.currency && request.currency !== currency) return false;
    if (request.relatedId && orderIdSet.has(request.relatedId)) return true;
    const requestNumbers = [
      ...extractDeliveryNumbers(request.summary),
      ...extractDeliveryNumbers(request.businessNumber),
    ];
    return requestNumbers.some((number) => deliveryNumberSet.has(number));
  });

  if (matched.length === 0) return undefined;
  const paidCents = matched.reduce(
    (sum, request) => sum + Math.round(Math.abs(Number(request.amount) || 0) * 100),
    0
  );
  return paidCents / 100;
}
