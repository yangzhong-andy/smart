import { createHmac } from "crypto";

export type ShopeeEnvironment = "sandbox" | "live";

export class ShopeeApiError extends Error {
  readonly code: string | null;
  readonly requestId: string | null;
  readonly status: number;

  constructor(message: string, options: { code?: unknown; requestId?: unknown; status: number }) {
    super(message);
    this.name = "ShopeeApiError";
    this.code = typeof options.code === "string" ? options.code : null;
    this.requestId = typeof options.requestId === "string" ? options.requestId : null;
    this.status = options.status;
  }
}

const AUTH_HOSTS: Record<ShopeeEnvironment, string> = {
  sandbox: "https://open.sandbox.test-stable.shopee.com.br",
  live: "https://open.shopee.com.br",
};
const API_HOSTS: Record<ShopeeEnvironment, string> = {
  sandbox: "https://partner.test-stable.shopeemobile.com",
  live: "https://openplatform.shopee.com.br",
};

export function getShopeeApiHost(environment: ShopeeEnvironment) {
  return API_HOSTS[environment];
}

export function getShopeeAuthUrl(environment: ShopeeEnvironment, partnerId: string, redirectUri: string, state: string) {
  const base = `${AUTH_HOSTS[environment]}/auth`;
  const query = new URLSearchParams({
    partner_id: partnerId,
    auth_type: "seller",
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });
  return `${base}?${query.toString()}`;
}

export function signShopeeRequest(partnerId: string, partnerKey: string, path: string, timestamp: number, accessToken = "", shopId = "") {
  return createHmac("sha256", partnerKey)
    .update(`${partnerId}${path}${timestamp}${accessToken}${shopId}`)
    .digest("hex");
}

type ShopeeQueryValue = string | number | boolean | null | undefined;

/** Preserve official 64-bit transaction identifiers that exceed JavaScript's
 * safe integer range. These identifiers are used as idempotency keys. */
export function parseShopeeResponseJson(text: string) {
  if (!text.trim()) return {};
  const safeText = text.replace(
    /("(?:transaction_id|withdrawal_id|root_withdrawal_id)"\s*:\s*)(-?\d{16,})/g,
    '$1"$2"',
  );
  return JSON.parse(safeText);
}

export type ShopeeShopRequestInput = {
  environment: ShopeeEnvironment;
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: string;
};

export type ShopeePartnerRequestInput = {
  environment: ShopeeEnvironment;
  partnerId: string;
  partnerKey: string;
};

async function shopeePartnerRequest<T>(
  input: ShopeePartnerRequestInput,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signShopeeRequest(input.partnerId, input.partnerKey, path, timestamp);
  const params = new URLSearchParams({
    partner_id: input.partnerId,
    timestamp: String(timestamp),
    sign,
  });
  const response = await fetch(`${getShopeeApiHost(input.environment)}${path}?${params}`, {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  assertShopeeResponse(response, payload, `Shopee partner request failed: ${path}`);
  return (payload.response || payload) as T;
}

export type ShopeePushConfig = {
  callback_url?: string;
  live_push_status?: string;
  blocked_shop_id_list?: number[];
  push_config_on_list?: number[];
  push_config_off_list?: number[];
};

export function getShopeePushConfig(input: ShopeePartnerRequestInput) {
  return shopeePartnerRequest<ShopeePushConfig>(input, "GET", "/api/v2/push/get_app_push_config");
}

export function setShopeePushConfig(input: ShopeePartnerRequestInput & {
  callbackUrl: string;
  enableCodes: number[];
  disableCodes?: number[];
  blockedShopIds?: number[];
}) {
  return shopeePartnerRequest<Record<string, unknown>>(input, "POST", "/api/v2/push/set_app_push_config", {
    callback_url: input.callbackUrl,
    set_push_config_on: input.enableCodes,
    set_push_config_off: input.disableCodes || [],
    blocked_shop_id_list: input.blockedShopIds || [],
  });
}

export type ShopeeLostPushMessage = {
  shop_id?: number | string;
  code?: number;
  timestamp?: number;
  data?: string;
};

export type ShopeeLostPushResponse = {
  push_message_list?: ShopeeLostPushMessage[];
  has_next_page?: boolean;
  last_message_id?: number;
};

export function getShopeeLostPushMessages(input: ShopeePartnerRequestInput) {
  return shopeePartnerRequest<ShopeeLostPushResponse>(input, "GET", "/api/v2/push/get_lost_push_message");
}

export function confirmShopeeLostPushMessages(input: ShopeePartnerRequestInput & { lastMessageId: number }) {
  return shopeePartnerRequest<Record<string, unknown>>(input, "POST", "/api/v2/push/confirm_consumed_lost_push_message", {
    last_message_id: input.lastMessageId,
  });
}

function signedShopUrl(
  input: ShopeeShopRequestInput,
  path: string,
  query: Record<string, ShopeeQueryValue> = {},
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signShopeeRequest(
    input.partnerId,
    input.partnerKey,
    path,
    timestamp,
    input.accessToken,
    input.shopId,
  );
  const params = new URLSearchParams({
    partner_id: input.partnerId,
    timestamp: String(timestamp),
    sign,
    shop_id: input.shopId,
    access_token: input.accessToken,
  });
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return `${getShopeeApiHost(input.environment)}${path}?${params.toString()}`;
}

export async function shopeeShopGet<T = any>(
  input: ShopeeShopRequestInput,
  path: string,
  query: Record<string, ShopeeQueryValue> = {},
): Promise<T> {
  const response = await fetch(signedShopUrl(input, path, query), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.text().then(parseShopeeResponseJson).catch(() => ({}));
  assertShopeeResponse(response, payload, `Shopee request failed: ${path}`);
  return (payload.response || payload) as T;
}

export async function shopeeShopPost<T = any>(
  input: ShopeeShopRequestInput,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(signedShopUrl(input, path), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  assertShopeeResponse(response, payload, `Shopee request failed: ${path}`);
  return (payload.response || payload) as T;
}

export type ShopeeOrderListResponse = {
  more?: boolean;
  next_cursor?: string;
  order_list?: Array<{ order_sn?: string; order_status?: string }>;
};

export function getShopeeOrderList(
  input: ShopeeShopRequestInput & {
    timeFrom: number;
    timeTo: number;
    cursor?: string;
    pageSize?: number;
    orderStatus?: string;
  },
) {
  return shopeeShopGet<ShopeeOrderListResponse>(input, "/api/v2/order/get_order_list", {
    time_range_field: "update_time",
    time_from: input.timeFrom,
    time_to: input.timeTo,
    page_size: Math.min(100, Math.max(1, input.pageSize || 100)),
    cursor: input.cursor,
    order_status: input.orderStatus,
  });
}

export type ShopeeOrderDetailResponse = {
  order_list?: Record<string, any>[];
};

const ORDER_DETAIL_OPTIONAL_FIELDS = [
  "buyer_user_id",
  "buyer_username",
  "total_amount",
  "payment_method",
  "estimated_shipping_fee",
  "recipient_address",
  "actual_shipping_fee",
  "item_list",
  "pay_time",
  "checkout_shipping_carrier",
  "package_list",
].join(",");

export function getShopeeOrderDetails(
  input: ShopeeShopRequestInput & { orderSns: string[] },
) {
  if (input.orderSns.length === 0 || input.orderSns.length > 50) {
    throw new Error("Shopee order detail requests require 1 to 50 order numbers");
  }
  return shopeeShopGet<ShopeeOrderDetailResponse>(input, "/api/v2/order/get_order_detail", {
    order_sn_list: input.orderSns.join(","),
    response_optional_fields: ORDER_DETAIL_OPTIONAL_FIELDS,
  });
}

export type ShopeeTrackingEvent = {
  update_time?: number;
  description?: string;
  logistics_status?: string;
};

export type ShopeeTrackingInfoResponse = {
  order_sn?: string;
  package_number?: string;
  logistics_status?: string;
  tracking_info?: ShopeeTrackingEvent[];
};

export function getShopeeTrackingInfo(
  input: ShopeeShopRequestInput & { orderSn: string; packageNumber?: string },
) {
  if (!input.orderSn.trim()) throw new Error("Shopee order number is required");
  return shopeeShopGet<ShopeeTrackingInfoResponse>(input, "/api/v2/logistics/get_tracking_info", {
    order_sn: input.orderSn.trim(),
    package_number: input.packageNumber?.trim(),
  });
}

export type ShopeeReturnListResponse = {
  more?: boolean;
  return?: Record<string, any>[];
};

export function getShopeeReturnList(
  input: ShopeeShopRequestInput & {
    pageNo?: number;
    pageSize?: number;
    createTimeFrom: number;
    createTimeTo: number;
    status?: string;
  },
) {
  return shopeeShopGet<ShopeeReturnListResponse>(input, "/api/v2/returns/get_return_list", {
    page_no: Math.max(1, input.pageNo || 1),
    page_size: Math.min(100, Math.max(1, input.pageSize || 100)),
    create_time_from: input.createTimeFrom,
    create_time_to: input.createTimeTo,
    status: input.status,
  });
}

export type ShopeeEscrowDetailResponse = {
  order_sn?: string;
  buyer_user_name?: string;
  return_order_sn_list?: string[];
  buyer_payment_info?: Record<string, any>;
  order_income?: Record<string, any>;
};

export function getShopeeEscrowDetail(
  input: ShopeeShopRequestInput & { orderSn: string },
) {
  if (!input.orderSn.trim()) throw new Error("Shopee order number is required");
  return shopeeShopGet<ShopeeEscrowDetailResponse>(input, "/api/v2/payment/get_escrow_detail", {
    order_sn: input.orderSn.trim(),
  });
}

export type ShopeeWalletTransactionRaw = {
  transaction_id?: string | number;
  status?: string;
  wallet_type?: string;
  transaction_type?: string;
  amount?: string | number;
  current_balance?: string | number;
  create_time?: string | number;
  reason?: string;
  order_sn?: string;
  refund_sn?: string;
  withdrawal_type?: string;
  transaction_fee?: string | number;
  description?: string;
  buyer_name?: string;
  pay_order_list?: unknown[];
  withdrawal_id?: string | number;
  root_withdrawal_id?: string | number;
  remarks?: Record<string, unknown>;
  transaction_tab_type?: string;
  money_flow?: string;
  outlet_shop_name?: string;
  txn_title?: string;
  [key: string]: unknown;
};

export type ShopeeWalletTransactionListResponse = {
  transaction_list?: ShopeeWalletTransactionRaw[];
  more?: boolean;
};

export function getShopeeWalletTransactionList(
  input: ShopeeShopRequestInput & {
    createTimeFrom: number;
    createTimeTo: number;
    pageNo?: number;
    pageSize?: number;
  },
) {
  return shopeeShopGet<ShopeeWalletTransactionListResponse>(
    input,
    "/api/v2/payment/get_wallet_transaction_list",
    {
      create_time_from: input.createTimeFrom,
      create_time_to: input.createTimeTo,
      page_no: Math.max(1, Math.trunc(input.pageNo || 1)),
      page_size: Math.min(100, Math.max(1, Math.trunc(input.pageSize || 100))),
    },
  );
}

export type ShopeeItemListResponse = { item?: Array<{ item_id?: number; item_status?: string; update_time?: number }>; total_count?: number; has_next_page?: boolean; next_offset?: number };
export function getShopeeItemList(input: ShopeeShopRequestInput & { offset?: number; pageSize?: number; itemStatus: string }) {
  return shopeeShopGet<ShopeeItemListResponse>(input, "/api/v2/product/get_item_list", {
    offset: Math.max(0, input.offset || 0), page_size: Math.min(100, Math.max(1, input.pageSize || 100)), item_status: input.itemStatus,
  });
}

export type ShopeeItemBaseInfoResponse = { item_list?: Record<string, any>[] };
export function getShopeeItemBaseInfo(input: ShopeeShopRequestInput & { itemIds: string[] }) {
  if (!input.itemIds.length || input.itemIds.length > 50) throw new Error("Shopee item base info requires 1 to 50 item IDs");
  return shopeeShopGet<ShopeeItemBaseInfoResponse>(input, "/api/v2/product/get_item_base_info", { item_id_list: input.itemIds.join(",") });
}

export type ShopeeItemExtraInfoResponse = { item_list?: Record<string, any>[] };
export function getShopeeItemExtraInfo(input: ShopeeShopRequestInput & { itemIds: string[] }) {
  if (!input.itemIds.length || input.itemIds.length > 50) throw new Error("Shopee item extra info requires 1 to 50 item IDs");
  return shopeeShopGet<ShopeeItemExtraInfoResponse>(input, "/api/v2/product/get_item_extra_info", { item_id_list: input.itemIds.join(",") });
}

export type ShopeeModelListResponse = { tier_variation?: Record<string, any>[]; model?: Record<string, any>[] };
export function getShopeeModelList(input: ShopeeShopRequestInput & { itemId: string }) {
  if (!input.itemId.trim()) throw new Error("Shopee item ID is required");
  return shopeeShopGet<ShopeeModelListResponse>(input, "/api/v2/product/get_model_list", { item_id: input.itemId.trim() });
}

export function getShopeeShippingParameter(input: ShopeeShopRequestInput & { orderSn: string }) {
  if (!input.orderSn.trim()) throw new Error("Shopee order number is required");
  return shopeeShopGet<Record<string, any>>(input, "/api/v2/logistics/get_shipping_parameter", { order_sn: input.orderSn.trim() });
}

export function getShopeeTrackingNumber(input: ShopeeShopRequestInput & { orderSn: string; packageNumber?: string }) {
  if (!input.orderSn.trim()) throw new Error("Shopee order number is required");
  return shopeeShopGet<Record<string, any>>(input, "/api/v2/logistics/get_tracking_number", { order_sn: input.orderSn.trim(), package_number: input.packageNumber?.trim(), response_optional_fields: "first_mile_tracking_number" });
}

export function setShopeeOrderNote(input: ShopeeShopRequestInput & { orderSn: string; note: string }) {
  return shopeeShopPost<Record<string, any>>(input, "/api/v2/order/set_note", { order_sn: input.orderSn.trim(), note: input.note.trim() });
}

export function handleShopeeBuyerCancellation(input: ShopeeShopRequestInput & { orderSn: string; operation: "ACCEPT" | "REJECT" }) {
  return shopeeShopPost<Record<string, any>>(input, "/api/v2/order/handle_buyer_cancellation", { order_sn: input.orderSn.trim(), operation: input.operation });
}

export function shipShopeeOrder(input: ShopeeShopRequestInput & { orderSn: string; packageNumber?: string; pickup?: Record<string, unknown>; dropoff?: Record<string, unknown>; nonIntegrated?: Record<string, unknown> }) {
  return shopeeShopPost<Record<string, any>>(input, "/api/v2/logistics/ship_order", { order_sn: input.orderSn.trim(), ...(input.packageNumber ? { package_number: input.packageNumber.trim() } : {}), ...(input.pickup ? { pickup: input.pickup } : {}), ...(input.dropoff ? { dropoff: input.dropoff } : {}), ...(input.nonIntegrated ? { non_integrated: input.nonIntegrated } : {}) });
}

export function splitShopeeOrder(input: ShopeeShopRequestInput & { orderSn: string; packageList: Record<string, unknown>[] }) {
  return shopeeShopPost<Record<string, any>>(input, "/api/v2/order/split_order", { order_sn: input.orderSn.trim(), package_list: input.packageList });
}

export function unsplitShopeeOrder(input: ShopeeShopRequestInput & { orderSn: string }) {
  return shopeeShopPost<Record<string, any>>(input, "/api/v2/order/unsplit_order", { order_sn: input.orderSn.trim() });
}

function assertShopeeResponse(response: Response, payload: any, fallback: string) {
  if (response.ok && !payload?.error) return;
  throw new ShopeeApiError(payload?.message || `${fallback} (${response.status})`, {
    code: payload?.error,
    requestId: payload?.request_id,
    status: response.status,
  });
}

export async function exchangeShopeeCode(input: {
  environment: ShopeeEnvironment;
  partnerId: string;
  partnerKey: string;
  code: string;
  shopId: string;
}) {
  const path = "/api/v2/auth/token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ code: input.code, shop_id: Number(input.shopId), partner_id: Number(input.partnerId) });
  const sign = signShopeeRequest(input.partnerId, input.partnerKey, path, timestamp);
  const url = `${getShopeeApiHost(input.environment)}${path}?partner_id=${encodeURIComponent(input.partnerId)}&timestamp=${timestamp}&sign=${sign}`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const payload = await response.json().catch(() => ({}));
  assertShopeeResponse(response, payload, "Shopee token exchange failed");
  return payload.response || payload;
}

export async function refreshShopeeToken(input: {
  environment: ShopeeEnvironment;
  partnerId: string;
  partnerKey: string;
  refreshToken: string;
  shopId: string;
}) {
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ refresh_token: input.refreshToken, shop_id: Number(input.shopId), partner_id: Number(input.partnerId) });
  const sign = signShopeeRequest(input.partnerId, input.partnerKey, path, timestamp);
  const url = `${getShopeeApiHost(input.environment)}${path}?partner_id=${encodeURIComponent(input.partnerId)}&timestamp=${timestamp}&sign=${sign}`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const payload = await response.json().catch(() => ({}));
  assertShopeeResponse(response, payload, "Shopee token refresh failed");
  return payload.response || payload;
}

export async function getShopeeShopInfo(input: {
  environment: ShopeeEnvironment;
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: string;
}) {
  return shopeeShopGet(input, "/api/v2/shop/get_shop_info");
}
