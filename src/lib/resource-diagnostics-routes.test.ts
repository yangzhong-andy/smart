import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { createResourceDiagnostics } from "./resource-diagnostics";

const nodeRequire = createRequire(import.meta.url);
function loadRoute(file: string, enabled: boolean, extra: Record<string, any> = {}) {
  const events: Array<Record<string, any>> = [];
  const diag = createResourceDiagnostics({ enabled, write: (event) => events.push(event), schedule: () => ({ unref() {} }), cancel() {} });
  const code = ts.transpileModule(readFileSync(resolve("src/app/api", file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: any = {};
  const mocks: Record<string, any> = {
    "next/server": { NextRequest, NextResponse },
    "@/lib/resource-diagnostics": { withResourceDiagnostics: diag.run },
    "@/lib/prisma": { prisma: new Proxy({}, { get(_target, table) {
      if (table === "tikTokShopSetting") return { findMany: async () => [] };
      throw new Error(`Unexpected database access: ${String(table)}`);
    } }) },
    "@/lib/api-auth": { requireApiUser: async () => ({ response: NextResponse.json({ error: "denied" }, { status: 403 }) }) },
    ...extra,
  };
  runInNewContext(code, { exports, console, Response, Buffer, TextDecoder, URL, process: { env: {} }, require: (id: string) => {
    if (id in mocks) return mocks[id];
    if (id === "crypto" || id === "buffer") return nodeRequire(id);
    // Other adapters are never invoked on these early-return paths.
    return {};
  } });
  return { ...exports, events, close: diag.close };
}

for (const enabled of [false, true]) {
  test(`TK empty-shop response remains unchanged with diagnostics ${enabled ? "enabled" : "disabled"}`, async () => {
    const route = loadRoute("tiktok/sync/route.ts", enabled);
    try {
      const response = await route.POST(new NextRequest("http://localhost/api/tiktok/sync", { method: "POST", body: "{}" }));
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "没有已授权的店铺" });
      if (enabled) {
        assert.equal(route.events.at(-1).status, 400);
        assert.equal(route.events.at(-1).activeCount, 0);
      } else assert.equal(route.events.length, 0);
    } finally { route.close(); }
  });

  test(`access denial remains unchanged and never starts sync/recovery with diagnostics ${enabled ? "enabled" : "disabled"}`, async () => {
    for (const path of ["shopee/webhook/process/route.ts", "mercado-livre/products/sync/route.ts", "shopee/profit/route.ts"]) {
      const route = loadRoute(path, enabled);
      try {
        const response = await (route.POST || route.GET)(new NextRequest("http://localhost/api/test", { method: route.POST ? "POST" : "GET" }));
        assert.equal(response.status, 403);
        if (enabled) assert.equal(route.events.at(-1).status, 403);
        else assert.equal(route.events.length, 0);
      } finally { route.close(); }
    }
  });

  test(`invalid TK webhook JSON returns the original 400 without database access with diagnostics ${enabled ? "enabled" : "disabled"}`, async () => {
    const route = loadRoute("tiktok/webhook/route.ts", enabled);
    try {
      const response = await route.POST(new NextRequest("http://localhost/api/tiktok/webhook", { method: "POST", body: "{" }));
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: 1, message: "invalid JSON" });
      if (enabled) assert.equal(route.events.at(-1).status, 400);
      else assert.equal(route.events.length, 0);
    } finally { route.close(); }
  });
}

test("successful TK order sync makes the same isolated persistence/cache calls and response in both modes", async () => {
  const results = [];
  for (const enabled of [false, true]) {
    const writes: any[] = [];
    const cleared: string[] = [];
    const order = { id: "private-order-id", status: "UNPAID", line_items: [], payment: { currency: "BRL", total_amount: 12 } };
    const shop = { shopId: "private-shop-id", shopName: "test-shop", accessToken: "private-token", shopCipher: "private-cipher" };
    const route = loadRoute("tiktok/sync/route.ts", enabled, {
      "@/lib/prisma": { prisma: {
        tikTokShopSetting: { findMany: async () => [shop], update: async (value: unknown) => { writes.push(value); } },
        tikTokAppConfig: { findMany: async () => [] },
        tikTokOrder: { upsert: async (value: unknown) => { writes.push(value); } },
      } },
      "@/lib/tiktok-shop-api": { searchOrders: async () => ({ orders: [order] }) },
      "@/lib/warehouse-fund-reconciliation": { isWarehouseShippedStatus: () => false },
      "@/lib/redis": { clearCacheByPrefix: async (value: string) => { cleared.push(value); } },
    });
    try {
      const response = await route.POST(new NextRequest("http://localhost/api/tiktok/sync", { method: "POST", body: JSON.stringify({ dataType: "orders" }) }));
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.results[0].orders, 1);
      assert.equal(body.results[0].success, true);
      // lastSyncAt legitimately changes between executions; compare its shape, not its value.
      assert.equal(writes.length, 2);
      assert.deepEqual(cleared, ["cash-flow", "profit-report"]);
      assert.doesNotMatch(JSON.stringify(route.events), /private-order-id|private-shop-id|private-token|private-cipher/);
      results.push({ body, orderWrite: JSON.parse(JSON.stringify(writes[0])), cleared });
    } finally { route.close(); }
  }
  assert.deepEqual(results[0], results[1]);
});

test("all intended routes and the real background processing path are instrumented", () => {
  const read = (file: string) => readFileSync(resolve(file), "utf8");
  for (const [file, task] of [
    ["src/app/api/tiktok/sync/route.ts", "tiktok.sync"],
    ["src/app/api/tiktok/webhook/route.ts", "tiktok.webhook.receive"],
    ["src/app/api/profit-report/route.ts", "profit.report"],
    ["src/app/api/shopee/profit/route.ts", "shopee.profit"],
    ["src/app/api/shopee/webhook/process/route.ts", "shopee.webhook.process"],
    ["src/app/api/mercado-livre/products/sync/route.ts", "mercado.products.sync"],
    ["src/lib/warehouse-fund-reconciliation.ts", "warehouse.tiktok.reconcile"],
  ]) assert.ok(read(file).includes(`withResourceDiagnostics("${task}"`), file);
  const webhook = read("src/app/api/tiktok/webhook/route.ts");
  assert.match(webhook, /processEvent\(typeNum, shopId, orderId, orderData, request.nextUrl.origin\)\.then/);
  assert.match(webhook, /async function processEvent[\s\S]*withResourceDiagnostics\("tiktok.webhook.process"/);
});
