import test from "node:test";
import assert from "node:assert/strict";
import { chooseAiTool, resolveAiBusinessDateRange, resolveAiTimeRange, resolvePagoReconciliationGroups } from "./read-only-tools";

test("AI read-only router sends business questions to the matching safe tool", () => {
  assert.equal(chooseAiTool("近15天三个平台出了多少订单"), "sales_overview");
  assert.equal(chooseAiTool("Set+3 还能卖多久，库存和在途多少"), "inventory_overview");
  assert.equal(chooseAiTool("这个 SKU 的利润为什么下降，广告费多少"), "profit_overview");
  assert.equal(chooseAiTool("PAGO 钱包和系统流水差多少"), "finance_overview");
  assert.equal(chooseAiTool("PAGO 钱包和系统余额为什么对不上"), "wallet_reconciliation");
  assert.equal(chooseAiTool("有哪些待关联提款和异常流水明细"), "wallet_reconciliation");
  assert.equal(chooseAiTool("三个平台多久更新一次，有没有同步失败"), "sync_diagnostics");
  assert.equal(chooseAiTool("你说的数据包含取消和未支付订单吗"), "sales_overview");
});

test("AI time range prioritizes natural-language calendar dates over the UI day selector", () => {
  const now = new Date("2026-09-19T07:30:00.000Z");
  const yesterday = resolveAiTimeRange("昨天所有店铺出了多少订单", 15, now);
  assert.equal(yesterday.scope, "昨天（2026/09/18）");
  assert.equal(yesterday.from.toISOString(), "2026-09-17T16:00:00.000Z");
  assert.equal(yesterday.to.toISOString(), "2026-09-18T16:00:00.000Z");

  const recent = resolveAiTimeRange("近 7 天三个平台订单量", 15, now);
  assert.equal(recent.days, 7);
  assert.equal(recent.scope, "最近 7 个自然日");
});

test("AI sales dates follow each store's destination-country calendar day", () => {
  const now = new Date("2026-09-19T15:00:00.000Z");
  const brazilYesterday = resolveAiBusinessDateRange("昨天所有店铺出了多少订单", 15, "BR", now);
  assert.deepEqual(brazilYesterday, {
    startDate: "2026-09-18",
    endDate: "2026-09-18",
    days: 1,
    label: "昨天（2026-09-18）",
  });

  const recent = resolveAiBusinessDateRange("近 7 天三个平台订单量", 15, "BR", now);
  assert.equal(recent.days, 7);
  assert.equal(recent.endDate, "2026-09-19");
  assert.equal(recent.startDate, "2026-09-13");
});

test("PAGO reconciliation follows the bound account's parent group and excludes other subjects", () => {
  const now = new Date("2026-09-19T10:00:00.000Z");
  const official = [{ id: "meli-1", userId: "3438348964", nickname: "shop", storeId: "store-ml", currency: "BRL", officialBalance: 120596.88, officialAsOf: now, lastSyncAt: now }];
  const system = [
    { id: "linxi-ml", name: "美克多 PAGO", parentId: "linxi", storeId: "store-ml", platformAccount: "3438348964", currency: "BRL", accountCategory: "VIRTUAL", balance: 8712.67, parentName: "林曦主体 PAGO" },
    { id: "linxi-tt", name: "TikTok 02", parentId: "linxi", storeId: "store-tt", platformAccount: null, currency: "BRL", accountCategory: "VIRTUAL", balance: 46384.21, parentName: "林曦主体 PAGO" },
    { id: "linxi-sp", name: "Shopee PAGO", parentId: "linxi", storeId: "store-sp", platformAccount: null, currency: "BRL", accountCategory: "VIRTUAL", balance: 65500, parentName: "林曦主体 PAGO" },
    { id: "other", name: "其他主体 PAGO", parentId: "other-parent", storeId: "other-store", platformAccount: null, currency: "BRL", accountCategory: "VIRTUAL", balance: 2643.98, parentName: "其他主体" },
  ];
  const result = resolvePagoReconciliationGroups(official, system);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].systemAccounts.length, 3);
  assert.equal(result.groups[0].systemBalance, 120596.88);
  assert.equal(result.groups[0].difference, 0);
  assert.equal(result.mappedSystemIds.has("other"), false);
});
