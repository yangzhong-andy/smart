type WanziEnvelope<T = unknown> = {
  Code: number;
  Message: string;
  Data: T;
};

const DEFAULT_BASE_URL = "https://api.wanzihk.com/api/N1";

function getEnv() {
  const baseUrl = process.env.WANZI_BASE_URL || DEFAULT_BASE_URL;
  const userId = process.env.WANZI_USER_ID;
  const token = process.env.WANZI_TOKEN;
  if (!userId || !token) {
    throw new Error("WANZI_USER_ID 或 WANZI_TOKEN 未配置");
  }
  return { baseUrl, userId, token };
}

export async function wanziServerRequest<T>(endpoint: string, payload: Record<string, unknown>) {
  const { baseUrl, userId, token } = getEnv();
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      UserId: userId,
      Token: token,
      ...payload,
    }),
  });
  if (!res.ok) {
    throw new Error(`万子接口请求失败: HTTP ${res.status}`);
  }
  const json = (await res.json()) as WanziEnvelope<T>;
  if (json.Code !== 1000) {
    throw new Error(`${json.Message || "万子接口错误"} (Code: ${json.Code})`);
  }
  return json.Data;
}
