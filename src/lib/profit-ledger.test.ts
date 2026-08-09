import assert from "node:assert/strict";
import test from "node:test";
import { profitLedgerInputHash, profitLedgerStatus, type ProfitLedgerRevisionInput } from "./profit-ledger";
import { defaultProfitComponents, buildProfitComponentAmounts } from "./profit-schemes";

function input(): ProfitLedgerRevisionInput {
  return {
    platform: "TIKTOK",
    externalShopId: "shop-a",
    storeId: "store-a",
    orderId: "order-a",
    businessDate: "2026-08-10",
    orderCurrency: "BRL",
    exchangeRateCny: 1.3,
    schemeId: "scheme-a",
    schemeVersion: 1,
    components: buildProfitComponentAmounts({ gmvCny: 100 }, defaultProfitComponents("BR", "TIKTOK")),
  };
}

test("ledger hashes are stable across metadata key order", () => {
  const left = { ...input(), metadata: { warehouse: "a", shop: "b" } };
  const right = { ...input(), metadata: { shop: "b", warehouse: "a" } };
  assert.equal(profitLedgerInputHash(left), profitLedgerInputHash(right));
});

test("required missing components mark a ledger incomplete", () => {
  const components = input().components;
  components[1] = { ...components[1], sourceStatus: "MISSING" };
  assert.equal(profitLedgerStatus(components), "INCOMPLETE");
});
