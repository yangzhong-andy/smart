import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import * as api from "./kwai-api";
import * as records from "./kwai-records";

// Execute real route source against explicit isolated adapters; never connect to a DB.
function loadSource(file: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(resolve(process.cwd(), "src", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports: any = {};
  runInNewContext(code, { exports, Date, URL, Set, console, require: (id: string) => {
    if (id === "next/server") return { NextRequest, NextResponse };
    if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  } });
  return exports;
}
const service = {
  KWAI_COOKIE: "__Host-kwai-oauth",
  kwaiCookieOptions: { secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 },
  kwaiSafeError: (e: Error) => e instanceof api.KwaiError ? e.message : "safe-error",
  kwaiAdmin: async () => ({ user: { id: "admin" }, response: null }),
  tokenDates: () => ({ tokenExpireAt: new Date(Date.now() + 600000), refreshExpireAt: new Date(Date.now() + 86400000) }),
};
const request = (path: string, body?: unknown) => new NextRequest(`${api.KWAI_ORIGIN}${path}`, body ? { method: "POST", headers: { origin: api.KWAI_ORIGIN }, body: JSON.stringify(body) } : undefined);

test("Kwai service rejects non-admin and non-HTTPS origin before writes", async () => {
  let allowed = false;
  const mod = loadSource("lib/kwai-service.ts", {
    "node:crypto": {}, "./prisma": { prisma: {} }, "./kwai-api": api,
    "./api-auth": { requireApiUser: async (_req: unknown, options: any) => {
      assert.deepEqual(Array.from(options.roles), ["SUPER_ADMIN", "ADMIN"]);
      return allowed ? { user: { id: "admin" }, response: null } : { user: null, response: NextResponse.json({}, { status: 403 }) };
    } },
  });
  assert.equal((await mod.kwaiAdmin(request("/api/kwai/settings"), true)).response.status, 403);
  allowed = true;
  await assert.rejects(mod.kwaiAdmin(new NextRequest("http://149.88.87.208:3001/api/kwai/settings", { headers: { origin: "http://149.88.87.208:3001" } }), true), /HTTPS/);
  assert.equal((await mod.kwaiAdmin(request("/api/kwai/settings", {}), true)).user.id, "admin");
});

test("Kwai settings GET selects metadata only; unauthorized POST does not mutate", async () => {
  const selections: any[] = [];
  const delegate = { findMany: async ({ select }: any) => { selections.push(select); return []; } };
  const mod = loadSource("app/api/kwai/settings/route.ts", {
    "@/lib/prisma": { prisma: { kwaiAppConfig: delegate, kwaiShopSetting: delegate } },
    "@/lib/kwai-api": api, "@/lib/kwai-service": service,
  });
  assert.equal((await mod.GET(request("/api/kwai/settings"))).status, 200);
  assert.equal(selections[0].credentials, undefined);
  assert.equal(selections[1].tokenCipher, undefined);
  const blocked = loadSource("app/api/kwai/settings/route.ts", {
    "@/lib/prisma": { prisma: {} }, "@/lib/kwai-api": api,
    "@/lib/kwai-service": { ...service, kwaiAdmin: async () => ({ response: NextResponse.json({}, { status: 403 }) }) },
  });
  assert.equal((await blocked.POST(request("/api/kwai/settings", { action: "save" }))).status, 403);
});

function callbackFixture(overrides: any = {}, failure?: "token" | "save") {
  let exchanges = 0, shops = 0;
  const state = "a".repeat(64), browser = "b".repeat(64);
  const pending = { id: "state", userId: "admin", appId: "app", appRevision: 1, app: { revision: 1, credentials: "encrypted", appKey: "app" }, browserHash: api.hashKwai(browser), expiresAt: new Date(Date.now() + 600000), usedAt: null, ...overrides };
  const prisma: any = {
    kwaiOAuthState: { findUnique: async () => pending, updateMany: async () => { if (pending.usedAt) return { count: 0 }; pending.usedAt = new Date(); return { count: 1 }; } },
    user: { findUnique: async () => ({ isActive: true, role: "ADMIN" }) },
    $queryRaw: async (sql: TemplateStringsArray) => {
      assert.ok(!sql.join("").includes("pg_advisory_xact_lock"), "void-returning advisory locks must not be read with queryRaw");
      return [];
    },
    $executeRaw: async (sql: TemplateStringsArray) => {
      assert.ok(sql.join("").includes("pg_advisory_xact_lock"));
      if (failure === "save") throw new Error("private-database-error");
      return 1;
    },
    kwaiAppConfig: { findUnique: async () => ({ revision: 1 }) },
    kwaiShopSetting: { findUnique: async () => null, create: async () => { shops++; } },
    store: { findFirst: async () => null, create: async () => ({ id: "store" }) },
  };
  prisma.$transaction = async (fn: any) => fn(prisma);
  const mod = loadSource("app/api/kwai/oauth/callback/route.ts", {
    "@/lib/prisma": { prisma }, "@/lib/redis": { clearCacheByPrefix: async () => true },
    "@/lib/kwai-service": service,
    "@/lib/kwai-api": { ...api, openKwai: () => ({ appSecret: "test" }), sealKwai: () => "encrypted", kwaiExchange: async () => { exchanges++; if (failure === "token") throw new Error("private-token-error"); return { merchantId: "123", shopName: "test", scopes: "merchant_order" }; } },
  });
  const req = () => new NextRequest(`${api.KWAI_CALLBACK}?code=test&status=${state}`, { headers: { cookie: `__Host-kwai-oauth=${browser}` } });
  return { mod, req, counters: () => ({ exchanges, shops }) };
}
test("Kwai callback claims authorization once even when callbacks race", async () => {
  const f = callbackFixture();
  const results = await Promise.all([f.mod.GET(f.req()), f.mod.GET(f.req())]);
  assert.equal(results.filter((r) => r.headers.get("location")?.includes("success=1")).length, 1);
  assert.deepEqual(f.counters(), { exchanges: 1, shops: 1 });
  assert.match(results[0].headers.get("set-cookie"), /Secure/);
  assert.equal(results[0].headers.get("referrer-policy"), "no-referrer");
});
test("Kwai callback rejects expired, mismatched-browser, used and stale-config state", async () => {
  for (const overrides of [{ expiresAt: new Date(0) }, { browserHash: "wrong" }, { usedAt: new Date() }, { appRevision: 2 }]) {
    const f = callbackFixture(overrides);
    const result = await f.mod.GET(f.req());
    assert.match(result.headers.get("location"), /error=expired_state/);
    assert.deepEqual(f.counters(), { exchanges: 0, shops: 0 });
  }
  const f = callbackFixture();
  assert.equal((await f.mod.GET(request("/api/kwai/oauth/callback"))).status, 200);
  assert.deepEqual(f.counters(), { exchanges: 0, shops: 0 });
});
test("Kwai callback distinguishes token failures from persistence failures without exposing secrets", async () => {
  for (const stage of ["token", "save"] as const) {
    const f = callbackFixture({}, stage);
    const result = await f.mod.GET(f.req());
    assert.equal(result.headers.get("location"), `${api.KWAI_ORIGIN}/platforms/kwai?error=${stage}_failed`);
    assert.equal(f.counters().shops, 0);
    assert.equal(f.counters().exchanges, 1);
    assert.ok(!result.headers.get("location")?.includes("private"));
  }
});
test("Kwai records upsert snapshots idempotently and do not overwrite newer reads", async () => {
  const saved = new Map<string, any>(); let writes = 0;
  const prisma: any = { $queryRaw: async () => [], kwaiShopSetting: { findUnique: async () => ({ status: "active" }), update: async () => ({}) }, kwaiRecord: {
    findUnique: async ({ where }: any) => saved.get(where.shopId_kind_externalId.externalId),
    upsert: async ({ where, create, update }: any) => { writes++; const id = where.shopId_kind_externalId.externalId; saved.set(id, saved.has(id) ? { ...saved.get(id), ...update } : create); },
  } };
  prisma.$transaction = async (fn: any) => fn(prisma);
  const mod = loadSource("app/api/kwai/records/route.ts", {
    "@prisma/client": {}, "@/lib/prisma": { prisma }, "@/lib/kwai-records": records,
    "@/lib/kwai-service": { ...service, usableKwaiShop: async () => ({ shop: { id: "shop", app: { appKey: "app" } }, credentials: { signSecret: "test" }, token: { scopes: "merchant_item" } }) },
    "@/lib/kwai-api": { ...api, kwaiRead: async () => ({ totalCount: 1, itemList: [{ itemId: "123", title: "test", salePrice: 999 }] }) },
  });
  for (let i = 0; i < 2; i++) assert.equal((await mod.POST(request("/api/kwai/records", { shopId: "shop", kind: "products" }))).status, 200);
  assert.equal(saved.size, 1); assert.equal(writes, 2);
  saved.set("123", { ...saved.get("123"), fetchedAt: new Date(Date.now() + 600000), payload: { title: "newer", skus: [] } });
  await mod.POST(request("/api/kwai/records", { shopId: "shop", kind: "products" }));
  assert.equal(saved.get("123").payload.title, "newer"); assert.equal(writes, 2);
});
