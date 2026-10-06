export type MercadoLivreTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  user_id?: number | string;
  refresh_token?: string;
};

export type MercadoLivreUser = {
  id: number | string;
  nickname?: string;
  country_id?: string;
  site_id?: string;
  permalink?: string;
};

export type MercadoLivreOrderSummary = {
  id: number | string;
  status?: string;
  date_created?: string;
  last_updated?: string;
  total_amount?: number | string;
  currency_id?: string;
};

export type MercadoLivreOrder = MercadoLivreOrderSummary & {
  substatus?: string | null;
  paid_amount?: number | string;
  buyer?: { nickname?: string | null } | null;
  shipping?: { id?: number | string | null } | null;
  pack_id?: number | string | null;
  date_closed?: string | null;
  order_items?: Array<{
    item?: { id?: string | number; title?: string; seller_sku?: string | null; variation_id?: string | number | null };
    quantity?: number;
    unit_price?: number | string;
    gross_price?: number | string;
    full_unit_price?: number | string;
    sale_fee?: number | string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export type MercadoLivreShipment = {
  id?: number | string;
  status?: string | null;
  substatus?: string | null;
  mode?: string | null;
  logistic_type?: string | null;
  tracking_number?: string | null;
  tracking_method?: string | null;
  date_created?: string | null;
  last_updated?: string | null;
  date_first_printed?: string | null;
  type?: string | null;
  service_id?: number | string | null;
  shipping_option?: Record<string, unknown> | null;
  status_history?: Record<string, unknown> | null;
  substatus_history?: Array<Record<string, unknown>> | null;
  [key: string]: unknown;
};

export type MercadoLivreShipmentCosts = {
  gross_amount?: number | string | null;
  base_exchange?: number | string | null;
  senders?: Array<Record<string, unknown>>;
  receiver?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type MercadoPagoPayment = {
  id?: number | string;
  status?: string | null;
  status_detail?: string | null;
  currency_id?: string | null;
  transaction_amount?: number | string | null;
  transaction_amount_refunded?: number | string | null;
  coupon_amount?: number | string | null;
  shipping_amount?: number | string | null;
  taxes_amount?: number | string | null;
  installments?: number | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  date_created?: string | null;
  date_approved?: string | null;
  date_last_updated?: string | null;
  money_release_date?: string | null;
  money_release_status?: string | null;
  transaction_details?: Record<string, unknown> | null;
  charges_details?: Array<Record<string, unknown>>;
  refunds?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type MercadoLivreOrderSearchResponse = {
  results?: MercadoLivreOrderSummary[];
  paging?: { total?: number; limit?: number; offset?: number };
};

export type MercadoLivreItemSearchResponse = {
  seller_id?: number | string;
  results?: string[];
  paging?: { total?: number; limit?: number; offset?: number };
};

export type MercadoLivreItemVariation = {
  id?: number | string;
  price?: number | string | null;
  available_quantity?: number | null;
  sold_quantity?: number | null;
  inventory_id?: string | null;
  catalog_product_id?: string | null;
  seller_custom_field?: string | null;
  picture_ids?: string[];
  attribute_combinations?: Array<{ id?: string; name?: string; value_id?: string | null; value_name?: string | null }>;
  attributes?: Array<{ id?: string; name?: string; value_id?: string | null; value_name?: string | null }>;
  [key: string]: unknown;
};

export type MercadoLivreItem = {
  id?: string;
  site_id?: string;
  user_product_id?: string | null;
  title?: string;
  family_name?: string | null;
  category_id?: string | null;
  status?: string | null;
  sub_status?: string[];
  condition?: string | null;
  currency_id?: string | null;
  price?: number | string | null;
  base_price?: number | string | null;
  original_price?: number | string | null;
  available_quantity?: number | null;
  initial_quantity?: number | null;
  sold_quantity?: number | null;
  listing_type_id?: string | null;
  catalog_product_id?: string | null;
  inventory_id?: string | null;
  permalink?: string | null;
  thumbnail?: string | null;
  buying_mode?: string | null;
  warranty?: string | null;
  date_created?: string | null;
  start_time?: string | null;
  stop_time?: string | null;
  end_time?: string | null;
  last_updated?: string | null;
  seller_custom_field?: string | null;
  shipping?: { free_shipping?: boolean; logistic_type?: string | null; [key: string]: unknown } | null;
  variations?: MercadoLivreItemVariation[];
  [key: string]: unknown;
};

export type MercadoLivreItemDescription = {
  plain_text?: string | null;
  text?: string | null;
  last_updated?: string | null;
  [key: string]: unknown;
};

export type MercadoLivreItemVisitDay = {
  date?: string;
  total?: number | string;
  visits_detail?: Array<{ company?: string; quantity?: number | string }>;
};

export type MercadoLivreItemVisitsResponse = {
  item_id?: string;
  date_from?: string;
  date_to?: string;
  total_visits?: number | string;
  last?: number;
  unit?: string;
  results?: MercadoLivreItemVisitDay[];
};

export type MercadoLivreAdvertisingAdvertiser = {
  advertiser_id?: number | string;
  site_id?: string;
  advertiser_name?: string;
  account_name?: string;
  [key: string]: unknown;
};

export type MercadoLivreAdvertisingAdvertisersResponse = {
  advertisers?: MercadoLivreAdvertisingAdvertiser[];
};

export type MercadoLivreAdvertisingDailyMetric = {
  date?: string;
  clicks?: number | string | null;
  prints?: number | string | null;
  ctr?: number | string | null;
  cost?: number | string | null;
  cpc?: number | string | null;
  acos?: number | string | null;
  roas?: number | string | null;
  tacos?: number | string | null;
  cvr?: number | string | null;
  direct_amount?: number | string | null;
  indirect_amount?: number | string | null;
  total_amount?: number | string | null;
  direct_units_quantity?: number | string | null;
  indirect_units_quantity?: number | string | null;
  units_quantity?: number | string | null;
  organic_units_quantity?: number | string | null;
  advertising_items_quantity?: number | string | null;
  direct_items_quantity?: number | string | null;
  indirect_items_quantity?: number | string | null;
  organic_items_quantity?: number | string | null;
  organic_units_amount?: number | string | null;
  organic_items_amount?: number | string | null;
  impression_share?: number | string | null;
  sov?: number | string | null;
  [key: string]: unknown;
};

export type MercadoLivreAdvertisingSearchResponse = {
  paging?: { total?: number; limit?: number; offset?: number };
  results?: MercadoLivreAdvertisingDailyMetric[];
};

export class MercadoLivreApiError extends Error {
  readonly status: number;
  readonly errorCode: string | null;
  readonly causeData: unknown;

  constructor(message: string, options: { status: number; errorCode?: unknown; data?: unknown }) {
    super(message);
    this.name = "MercadoLivreApiError";
    this.status = options.status;
    this.errorCode = typeof options.errorCode === "string" ? options.errorCode : null;
    this.causeData = options.data;
  }
}

const AUTHORIZATION_URL = "https://auth.mercadolivre.com.br/authorization";
const API_BASE_URL = "https://api.mercadolibre.com";

export function getMercadoLivreAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: "offline_access read",
  });
  if (input.codeChallenge) {
    params.set("code_challenge", input.codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

function assertResponse(response: Response, payload: any, fallback: string) {
  if (response.ok) return;
  if (response.status === 403 && payload?.code === "PA_UNAUTHORIZED_RESULT_FROM_POLICIES") {
    throw new MercadoLivreApiError("Mercado Livre 订单接口权限不足，请在开发者后台启用订单读取权限后重新授权店铺", {
      status: response.status,
      errorCode: payload?.code,
      data: payload,
    });
  }
  const message = payload?.message || payload?.error_description || payload?.error || fallback;
  throw new MercadoLivreApiError(String(message), {
    status: response.status,
    errorCode: payload?.error,
    data: payload,
  });
}

export async function exchangeMercadoLivreCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
}) {
  const response = await fetch(`${API_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      ...(input.codeVerifier ? { code_verifier: input.codeVerifier } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await readJson(response);
  assertResponse(response, payload, "Mercado Livre 授权码兑换失败");
  return payload as MercadoLivreTokenResponse;
}

export async function refreshMercadoLivreToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const response = await fetch(`${API_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await readJson(response);
  assertResponse(response, payload, "Mercado Livre Token 续期失败");
  return payload as MercadoLivreTokenResponse;
}

export async function mercadoLivreGet<T>(
  accessToken: string,
  path: string,
  query?: Record<string, string | number | undefined>,
  options?: { apiVersion?: string },
) {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options?.apiVersion ? { "api-version": options.apiVersion } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await readJson(response);
  assertResponse(response, payload, `Mercado Livre 请求失败：${path}`);
  return payload as T;
}

export function getMercadoLivreUser(accessToken: string) {
  return mercadoLivreGet<MercadoLivreUser>(accessToken, "/users/me");
}

export function searchMercadoLivreOrders(
  accessToken: string,
  sellerId: string,
  query?: Record<string, string | number | undefined>,
) {
  return mercadoLivreGet<MercadoLivreOrderSearchResponse>(accessToken, "/orders/search", {
    seller: sellerId,
    sort: "date_desc",
    limit: 50,
    ...query,
  });
}

export function getMercadoLivreOrder(accessToken: string, orderId: string) {
  return mercadoLivreGet<MercadoLivreOrder>(accessToken, `/orders/${encodeURIComponent(orderId)}`);
}

export function searchMercadoLivreItems(
  accessToken: string,
  sellerId: string,
  query?: Record<string, string | number | undefined>,
) {
  return mercadoLivreGet<MercadoLivreItemSearchResponse>(
    accessToken,
    `/users/${encodeURIComponent(sellerId)}/items/search`,
    { limit: 50, ...query },
  );
}

export function getMercadoLivreItem(accessToken: string, itemId: string) {
  return mercadoLivreGet<MercadoLivreItem>(accessToken, `/items/${encodeURIComponent(itemId)}`);
}

export function getMercadoLivreItemDescription(accessToken: string, itemId: string) {
  return mercadoLivreGet<MercadoLivreItemDescription>(accessToken, `/items/${encodeURIComponent(itemId)}/description`);
}

export function getMercadoLivreItemVisits(
  accessToken: string,
  itemId: string,
  query: { last: number; unit?: "day"; ending?: string },
) {
  return mercadoLivreGet<MercadoLivreItemVisitsResponse>(
    accessToken,
    `/items/${encodeURIComponent(itemId)}/visits/time_window`,
    { last: Math.max(1, Math.min(150, Math.trunc(query.last))), unit: query.unit || "day", ending: query.ending },
  );
}

export function getMercadoLivreAdvertisingAdvertisers(accessToken: string, productId = "PADS") {
  return mercadoLivreGet<MercadoLivreAdvertisingAdvertisersResponse>(
    accessToken,
    "/advertising/advertisers",
    { product_id: productId },
    { apiVersion: "1" },
  );
}

export function searchMercadoLivreAdvertisingDailyMetrics(
  accessToken: string,
  siteId: string,
  advertiserId: string,
  query: { dateFrom: string; dateTo: string },
) {
  return mercadoLivreGet<MercadoLivreAdvertisingSearchResponse>(
    accessToken,
    `/advertising/${encodeURIComponent(siteId)}/advertisers/${encodeURIComponent(advertiserId)}/product_ads/campaigns/search`,
    {
      limit: 100,
      offset: 0,
      date_from: query.dateFrom,
      date_to: query.dateTo,
      metrics: [
        "clicks",
        "prints",
        "ctr",
        "cost",
        "cpc",
        "acos",
        "roas",
        "cvr",
        "direct_amount",
        "indirect_amount",
        "total_amount",
        "direct_units_quantity",
        "indirect_units_quantity",
        "units_quantity",
        "organic_units_quantity",
        "advertising_items_quantity",
        "direct_items_quantity",
        "indirect_items_quantity",
        "organic_items_quantity",
        "organic_units_amount",
        "sov",
      ].join(","),
      aggregation_type: "DAILY",
    },
    { apiVersion: "2" },
  );
}

export function getMercadoLivreShipment(accessToken: string, shipmentId: string) {
  return mercadoLivreGet<MercadoLivreShipment>(accessToken, `/shipments/${encodeURIComponent(shipmentId)}`);
}

export function getMercadoLivreShipmentCosts(accessToken: string, shipmentId: string) {
  return mercadoLivreGet<MercadoLivreShipmentCosts>(accessToken, `/shipments/${encodeURIComponent(shipmentId)}/costs`);
}

export async function getMercadoPagoPayment(accessToken: string, paymentId: string) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await readJson(response);
  assertResponse(response, payload, `Mercado Pago 支付详情读取失败：${paymentId}`);
  return payload as MercadoPagoPayment;
}

export function getMercadoLivreApiBaseUrl() {
  return API_BASE_URL;
}
