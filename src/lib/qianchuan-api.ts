type JsonObject = Record<string, unknown>;

export type QianchuanAdvertTotalRequest = {
  startDate: string;
  endDate: string;
  groupIds?: Array<string | number>;
  userIds?: Array<string | number>;
  type?: number;
  categoryId?: number;
};

export type QianchuanDailyMetricInput = {
  date: string;
  spend: number | null;
  conversions: number | null;
  attributedRevenue: number | null;
  roi: number | null;
  adCount: number | null;
  rawData: JsonObject;
};

const DEFAULT_TIMEOUT_MS = 30_000;

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") {
    const object = objectValue(value);
    if (!object) return null;
    for (const key of ["now", "num", "value", "count", "amount"]) {
      if (key in object) {
        const result = finiteNumber(object[key]);
        if (result !== null) return result;
      }
    }
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

function seriesRows(value: unknown): Array<{ date: string; value: number; raw: unknown }> {
  if (!Array.isArray(value)) return [];
  const rows: Array<{ date: string; value: number; raw: unknown }> = [];
  for (const item of value) {
    if (Array.isArray(item)) {
      const date = metricDate(item[0]);
      const metric = finiteNumber(item[1]);
      if (date && metric !== null) rows.push({ date, value: metric, raw: item });
      continue;
    }
    const object = objectValue(item);
    if (!object) continue;
    const date = metricDate(object.date ?? object.day ?? object.time ?? object.stat_date);
    const metric = finiteNumber(object.num ?? object.value ?? object.now ?? object.count ?? object.amount);
    if (date && metric !== null) rows.push({ date, value: metric, raw: item });
  }
  return rows;
}

export function normalizeQianchuanBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("未配置千川 API 服务地址");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("千川 API 服务地址无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("千川 API 服务地址仅支持 HTTP 或 HTTPS");
  }
  return url.toString().replace(/\/+$/, "");
}

export function getQianchuanConfigurationStatus() {
  const rawBaseUrl = process.env.QIANCHUAN_API_BASE_URL?.trim() || "";
  let baseUrl: string | null = null;
  let baseUrlValid = false;
  if (rawBaseUrl) {
    try {
      baseUrl = normalizeQianchuanBaseUrl(rawBaseUrl);
      baseUrlValid = true;
    } catch {
      baseUrl = rawBaseUrl;
    }
  }
  return {
    configured: baseUrlValid && Boolean(process.env.QIANCHUAN_API_TOKEN?.trim()),
    baseUrlConfigured: Boolean(rawBaseUrl),
    baseUrlValid,
    tokenConfigured: Boolean(process.env.QIANCHUAN_API_TOKEN?.trim()),
    baseUrl,
  };
}

function qianchuanConfig() {
  const baseUrl = normalizeQianchuanBaseUrl(process.env.QIANCHUAN_API_BASE_URL || "");
  const token = process.env.QIANCHUAN_API_TOKEN?.trim();
  if (!token) throw new Error("未配置千川 API token");
  const configuredTimeout = Number(process.env.QIANCHUAN_API_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.min(120_000, Math.trunc(configuredTimeout))
    : DEFAULT_TIMEOUT_MS;
  return { baseUrl, token, timeoutMs };
}

async function qianchuanRequest(path: string, init: RequestInit): Promise<JsonObject> {
  const { baseUrl, token, timeoutMs } = qianchuanConfig();
  const normalizedPath = `/${path.replace(/^\/+/, "")}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${normalizedPath}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        token,
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    let payload: JsonObject = {};
    if (text) {
      try {
        payload = JSON.parse(text) as JsonObject;
      } catch {
        throw new Error(`千川 API 返回了非 JSON 内容（HTTP ${response.status}）`);
      }
    }
    if (!response.ok) {
      const message = String(payload.message ?? payload.msg ?? payload.error ?? "请求失败");
      throw new Error(`千川 API 请求失败（HTTP ${response.status}）：${message.slice(0, 300)}`);
    }
    const code = payload.code;
    if (code !== undefined && ![0, 200, 201, "0", "200", "201"].some((allowed) => allowed === code)) {
      const message = String(payload.message ?? payload.msg ?? payload.error ?? `业务状态码 ${String(code)}`);
      throw new Error(`千川 API 返回错误：${message.slice(0, 300)}`);
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`千川 API 请求超时（${timeoutMs}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function post(path: string, body: unknown) {
  return qianchuanRequest(path, { method: "POST", body: JSON.stringify(body) });
}

export function getQianchuanAdvertTotal(input: QianchuanAdvertTotalRequest) {
  return post("/p/l/user/qianchuanAllReport/advertTotal", {
    date: [input.startDate, input.endDate],
    group_ids: input.groupIds || [],
    user_ids: input.userIds || [],
    type: input.type ?? 1,
    cate_id: input.categoryId ?? 0,
  });
}

export function getQianchuanVideoData(input: {
  videoId: string | number;
  startDate: string;
  endDate: string;
  type?: number;
  isVoucher?: number;
}) {
  return post("/user/qianchuanAllReport/getVideoQianchuanData", {
    videoId: input.videoId,
    startDate: input.startDate,
    endDate: input.endDate,
    type: input.type ?? 1,
    isVoucher: input.isVoucher ?? 1,
  });
}

export function getQianchuanAdvertVideoReport(input: {
  videoId: string | number;
  startDate: string;
  endDate: string;
  advertAccountId: string | number;
  type?: number;
  isVoucher?: number;
}) {
  const query = new URLSearchParams({
    videoId: String(input.videoId),
    startTime: input.startDate,
    endTime: input.endDate,
    advertAccountId: String(input.advertAccountId),
    type: String(input.type ?? 1),
    isVoucher: String(input.isVoucher ?? 1),
  });
  return qianchuanRequest(`/home/advert/advertVideoReport?${query}`, { method: "GET" });
}

export function getQianchuanReportList(input: JsonObject) {
  return post("/home/report/qianchuanAllReportList", input);
}

export function normalizeQianchuanAdvertTotal(
  response: unknown,
  startDate: string,
  endDate: string,
): QianchuanDailyMetricInput[] {
  const root = objectValue(response) || {};
  const data = objectValue(root.data) || root;
  const chart = objectValue(data.reportChart) || {};
  const summary = objectValue(data.reportSum) || {};
  const definitions = [
    ["stat_cost", "spend"],
    ["ecp_convert_cnt", "conversions"],
    ["pay_order_amount", "attributedRevenue"],
    ["roi", "roi"],
    ["ad_num", "adCount"],
  ] as const;
  const rows = new Map<string, QianchuanDailyMetricInput>();
  for (const [sourceKey, targetKey] of definitions) {
    for (const item of seriesRows(chart[sourceKey])) {
      const current = rows.get(item.date) || {
        date: item.date,
        spend: null,
        conversions: null,
        attributedRevenue: null,
        roi: null,
        adCount: null,
        rawData: {},
      };
      current[targetKey] = targetKey === "conversions" || targetKey === "adCount"
        ? Math.max(0, Math.trunc(item.value))
        : item.value;
      current.rawData[sourceKey] = item.raw;
      rows.set(item.date, current);
    }
  }
  for (const row of rows.values()) row.rawData.reportSum = summary;

  // 汇总接口在单日查询时可能只返回 reportSum；多日汇总绝不能摊到每一天。
  if (startDate === endDate && !rows.has(startDate)) {
    const metric: QianchuanDailyMetricInput = {
      date: startDate,
      spend: finiteNumber(summary.stat_cost),
      conversions: finiteNumber(summary.ecp_convert_cnt),
      attributedRevenue: finiteNumber(summary.pay_order_amount),
      roi: finiteNumber(summary.roi),
      adCount: finiteNumber(summary.ad_num),
      rawData: { reportSum: summary },
    };
    metric.conversions = metric.conversions === null ? null : Math.max(0, Math.trunc(metric.conversions));
    metric.adCount = metric.adCount === null ? null : Math.max(0, Math.trunc(metric.adCount));
    if ([metric.spend, metric.conversions, metric.attributedRevenue, metric.roi, metric.adCount].some((value) => value !== null)) {
      rows.set(startDate, metric);
    }
  }
  return [...rows.values()].sort((left, right) => left.date.localeCompare(right.date));
}
