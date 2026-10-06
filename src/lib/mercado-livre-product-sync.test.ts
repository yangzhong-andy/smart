import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMercadoLivreProduct } from "./mercado-livre-product-sync";

test("normalizes Mercado Livre listing, variation SKU and daily visits", () => {
  const result = normalizeMercadoLivreProduct(
    {
      id: "MLB123",
      site_id: "MLB",
      title: "Produto teste",
      status: "active",
      price: 79.9,
      available_quantity: 12,
      sold_quantity: 8,
      shipping: { free_shipping: true, logistic_type: "fulfillment" },
      variations: [{
        id: 456,
        available_quantity: 7,
        sold_quantity: 3,
        attributes: [{ id: "SELLER_SKU", value_name: "SKU-BR-01" }],
        attribute_combinations: [{ id: "COLOR", value_name: "Preto" }],
      }],
    },
    "account-1",
    { plain_text: "Descricao completa" },
    {
      date_from: "2026-05-01T00:00:00Z",
      date_to: "2026-09-03T00:00:00Z",
      total_visits: 999,
      results: [
        { date: "2026-08-01T00:00:00Z", total: 100 },
        { date: "2026-08-31T00:00:00Z", total: 40 },
        { date: "2026-09-03T00:00:00Z", total: 63 },
      ],
    },
  );

  assert.equal(result.itemId, "MLB123");
  assert.equal(result.data.title, "Produto teste");
  assert.equal(result.data.visits30d, 103);
  assert.equal(result.data.logisticType, "fulfillment");
  assert.equal(result.variations[0]?.variationId, "456");
  assert.equal(result.variations[0]?.sellerSku, "SKU-BR-01");
  assert.equal(result.variations[0]?.name, "Preto");
  assert.deepEqual(result.visitDays.map((row) => [row.date.toISOString().slice(0, 10), row.visits]), [
    ["2026-08-01", 100],
    ["2026-08-31", 40],
    ["2026-09-03", 63],
  ]);
});
