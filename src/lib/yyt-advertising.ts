import { spawn } from "node:child_process";

type JsonObject = Record<string, unknown>;

export type YytAdvertisingRow = {
  advertiserId: string;
  advertiserName: string;
  cost: number;
  orders: number;
  grossRevenue: number;
  costPerOrder: number;
  roi: number;
  productImpressions: number;
  productClicks: number;
  adConversion: number;
  adConversionRate: number;
  diggCount: number;
  collectCount: number;
  shareCount: number;
  commentCount: number;
  playCount: number;
  productAvgPrice: number;
  productPieceNum: number;
  itemNum: number;
  authorizationDate: string | null;
  relationName: string | null;
  categoryNames: string | null;
  rawData: JsonObject;
};

export type YytAdvertisingDayResult = {
  requestId: string | null;
  rows: YytAdvertisingRow[];
};

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integerValue(value: unknown): number {
  return Math.max(0, Math.trunc(numberValue(value)));
}

function stringValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function dateValue(value: unknown): string | null {
  const result = stringValue(value)?.slice(0, 10) || null;
  return result && /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
}

function runYytCli(request: JsonObject): Promise<JsonObject> {
  const executable = process.env.YYT_CLI_PATH?.trim() || "yyt-cli";
  const timeoutMs = Math.min(180_000, Math.max(10_000, Number(process.env.YYT_CLI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["api", "--stdin"], {
      env: process.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const collect = (chunk: Buffer, target: "stdout" | "stderr") => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill();
        return;
      }
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk: Buffer) => collect(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => collect(chunk, "stderr"));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`YYT CLI 无法启动：${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (outputBytes > MAX_OUTPUT_BYTES) return reject(new Error("YYT CLI 返回内容超过安全限制"));
      if (code !== 0) return reject(new Error(`YYT CLI 请求失败：${stderr.trim().slice(0, 500) || `退出码 ${code}`}`));
      try {
        resolve(JSON.parse(stdout) as JsonObject);
      } catch {
        reject(new Error("YYT CLI 返回内容不是有效 JSON"));
      }
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

export function normalizeYytAdvertisingRows(value: unknown): YytAdvertisingRow[] {
  const root = objectValue(value);
  const response = objectValue(root?.data);
  const payload = objectValue(response?.data);
  const list = Array.isArray(payload?.list) ? payload.list : [];
  return list.flatMap((item) => {
    const row = objectValue(item);
    const advertiserId = stringValue(row?.advertiser_id);
    if (!row || !advertiserId) return [];
    return [{
      advertiserId,
      advertiserName: stringValue(row.advertiser_name) || advertiserId,
      cost: Math.max(0, numberValue(row.cost)),
      orders: integerValue(row.orders),
      grossRevenue: Math.max(0, numberValue(row.gross_revenue)),
      costPerOrder: Math.max(0, numberValue(row.cost_per_order)),
      roi: numberValue(row.roi),
      productImpressions: integerValue(row.product_impressions),
      productClicks: integerValue(row.product_clicks),
      adConversion: integerValue(row.ad_conversion),
      adConversionRate: numberValue(row.ad_conversion_rate),
      diggCount: integerValue(row.digg_count),
      collectCount: integerValue(row.collect_count),
      shareCount: integerValue(row.share_count),
      commentCount: integerValue(row.comment_count),
      playCount: integerValue(row.play_count),
      productAvgPrice: Math.max(0, numberValue(row.productAvgPrice)),
      productPieceNum: Math.max(0, numberValue(row.productPieceNum)),
      itemNum: integerValue(row.item_num),
      authorizationDate: dateValue(row.authorization_date),
      relationName: stringValue(row.relation_name),
      categoryNames: stringValue(row.cateNames),
      rawData: row,
    }];
  });
}

export async function getYytAdvertisingDay(date: string): Promise<YytAdvertisingDayResult> {
  const response = await runYytCli({
    method: "POST",
    path: "/j/get/tiktok/advert/report",
    responseMode: "full",
    cacheTtlMs: 0,
    body: {
      promotionType: "",
      cateId: [],
      authorType: "",
      authorId: [],
      roleId: [],
      startTime: date,
      endTime: date,
      storeIds: [],
      advertiserIds: [],
      taskProjectId: [],
      page: 1,
      pageSize: 100,
      field: "",
      sort: "",
    },
  });
  const status = numberValue(response.status);
  const payload = objectValue(response.data);
  const businessCode = numberValue(payload?.code);
  if (status !== 200 || (businessCode !== 200 && businessCode !== 201)) {
    throw new Error(`YYT 广告接口返回失败（HTTP ${status || "未知"}，业务码 ${businessCode || "未知"}）`);
  }
  return {
    requestId: stringValue(response.requestId),
    rows: normalizeYytAdvertisingRows(response),
  };
}
