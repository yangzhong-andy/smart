import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest, NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/auth-secret";

export const AI_PROVIDER_COOKIE = "smart-erp-ai-provider";
const SERVER_CONFIG_NAME = "ai-provider.enc";

export type AiProviderConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
};

export function resolveAiProviderUrl(endpoint: string) {
  const url = new URL(endpoint);
  const cleanPath = url.pathname.replace(/\/+$/, "");
  if (!cleanPath) url.pathname = "/responses";
  else if (cleanPath === "/v1") url.pathname = "/v1/responses";
  return url;
}

export async function verifyAiProviderConnection(config: AiProviderConfig) {
  const url = resolveAiProviderUrl(config.endpoint);
  const chatCompletions = /\/chat\/completions\/?$/.test(url.pathname);
  const body = chatCompletions
    ? { model: config.model, messages: [{ role: "user", content: "只回复 OK" }], max_tokens: 12 }
    : { model: config.model, input: "只回复 OK", max_output_tokens: 12 };
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  } catch { throw new Error("连接中转站失败，请检查地址或网络"); }
  const raw = await response.text();
  if (response.status === 401 || response.status === 403) throw new Error("Token 无效或没有该模型权限");
  if (response.status === 404) throw new Error("接口或模型不存在，请确认 Responses API 地址和模型名称");
  if (response.status === 429) throw new Error("中转站额度不足或触发限流");
  if (!response.ok) throw new Error(`中转站连接失败（HTTP ${response.status}）`);
  if (!raw.trim()) throw new Error("中转站返回空内容");
  try { JSON.parse(raw); } catch { throw new Error("中转站没有返回 JSON，请检查 API 地址"); }
}

function key() {
  return crypto.createHash("sha256").update(getAuthSecret()).digest();
}

export function validateAiProviderConfig(input: Partial<AiProviderConfig>): AiProviderConfig {
  const endpoint = typeof input.endpoint === "string" ? input.endpoint.trim() : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const model = typeof input.model === "string" ? input.model.trim() : "";
  if (!endpoint || !apiKey || !model) throw new Error("请填写 API 地址、密钥和模型");
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("API 地址格式不正确"); }
  if (url.protocol !== "https:") throw new Error("API 地址必须使用 HTTPS");
  if (apiKey.length < 8 || /\s/.test(apiKey)) throw new Error("API 密钥格式不正确");
  return { endpoint: url.toString().replace(/\/$/, ""), apiKey, model };
}

export function encryptAiProviderConfig(config: AiProviderConfig) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((value) => value.toString("base64url")).join(".");
}

export function decryptAiProviderConfig(value: string | undefined | null): AiProviderConfig | null {
  if (!value) return null;
  try {
    const [ivRaw, tagRaw, ciphertextRaw] = value.split(".");
    if (!ivRaw || !tagRaw || !ciphertextRaw) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const raw = Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
    return validateAiProviderConfig(JSON.parse(raw));
  } catch { return null; }
}

function serverConfigPath() {
  const override = process.env.ERP_AI_SERVER_CONFIG_FILE;
  if (override) return path.resolve(override);
  // The real PM2 working directory is <app>/releases/<version>; keep secrets
  // outside releases so a deployment, backup or rollback never copies them.
  const cwd = process.cwd();
  if (path.basename(path.dirname(cwd)) === "releases") {
    return path.join(path.dirname(path.dirname(path.dirname(cwd))), "private", SERVER_CONFIG_NAME);
  }
  return path.join(cwd, "data", "private", SERVER_CONFIG_NAME);
}

export async function readServerAiProviderConfig(): Promise<AiProviderConfig | null> {
  const file = serverConfigPath();
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error("服务器 AI 授权文件权限不安全");
    const config = decryptAiProviderConfig(await fs.readFile(file, "utf8"));
    if (!config) throw new Error("服务器 AI 授权文件无法解密");
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveServerAiProviderConfig(config: AiProviderConfig) {
  const file = serverConfigPath();
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStat = await fs.lstat(directory);
  if (!directoryStat.isDirectory() || (directoryStat.mode & 0o077) !== 0) throw new Error("服务器 AI 授权目录权限不安全");
  const temporary = path.join(directory, `.${SERVER_CONFIG_NAME}.${crypto.randomBytes(8).toString("hex")}.tmp`);
  try {
    await fs.writeFile(temporary, encryptAiProviderConfig(config), { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function configFromRequest(request: NextRequest): Promise<AiProviderConfig | null> {
  const serverConfig = await readServerAiProviderConfig();
  if (serverConfig) return serverConfig;
  const cookieConfig = decryptAiProviderConfig(request.cookies.get(AI_PROVIDER_COOKIE)?.value);
  if (cookieConfig) return cookieConfig;
  const endpoint = process.env.ERP_AI_RESPONSES_URL;
  const apiKey = process.env.ERP_AI_API_KEY;
  const model = process.env.ERP_AI_MODEL;
  return endpoint && apiKey && model ? validateAiProviderConfig({ endpoint, apiKey, model }) : null;
}

export async function aiProviderStatus(request: NextRequest) {
  const server = await readServerAiProviderConfig();
  if (server) return { configured: true, source: "server" as const, model: server.model, endpoint: server.endpoint };
  const browser = decryptAiProviderConfig(request.cookies.get(AI_PROVIDER_COOKIE)?.value);
  if (browser) return { configured: true, source: "browser" as const, model: browser.model, endpoint: browser.endpoint };
  const environment = await configFromRequest(request);
  return { configured: Boolean(environment), source: environment ? "environment" as const : "none" as const, model: environment?.model ?? null, endpoint: environment?.endpoint ?? null };
}

export function setAiProviderCookie(response: NextResponse, config: AiProviderConfig) {
  response.cookies.set(AI_PROVIDER_COOKIE, encryptAiProviderConfig(config), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}
