import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMercadoLivreOrder } from "./mercado-livre-order-sync";

test("uses gross_price as the Mercado Livre item original price", () => {
  const normalized = normalizeMercadoLivreOrder({
    id: 200000000001,
    order_items: [{
      item: { id: "MLB123", seller_sku: "SKU-01" },
      quantity: 2,
      unit_price: 75.04,
      gross_price: 89.9,
      full_unit_price: 80,
    }],
  }, "account-1");

  assert.equal(normalized.items[0].unitPrice, "75.04");
  assert.equal(normalized.items[0].fullUnitPrice, "89.9");
});

test("falls back to full_unit_price when gross_price is absent", () => {
  const normalized = normalizeMercadoLivreOrder({
    id: 200000000002,
    order_items: [{
      item: { id: "MLB124" },
      quantity: 1,
      unit_price: 42,
      full_unit_price: 50,
    }],
  }, "account-1");

  assert.equal(normalized.items[0].fullUnitPrice, "50");
});
