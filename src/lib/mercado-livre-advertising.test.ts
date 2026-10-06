import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMercadoLivreAdvertisingMetric } from "./mercado-livre-advertising";

test("normalizes Mercado Ads daily amounts, counts and percentage ratios", () => {
  const row = normalizeMercadoLivreAdvertisingMetric({
    date: "2026-09-02",
    clicks: 150,
    prints: 20409,
    cost: 148.52,
    cpc: 0.99,
    ctr: 0.73,
    acos: 6.83,
    roas: 14.63,
    cvr: 13.33,
    direct_amount: 1982.65,
    indirect_amount: 190.77,
    total_amount: 2173.42,
    units_quantity: 20,
    advertising_items_quantity: 20,
    sov: 95.24,
  }, "advertiser-1");

  assert.ok(row);
  assert.equal(row.advertisingAccountId, "advertiser-1");
  assert.equal(row.date.toISOString(), "2026-09-02T00:00:00.000Z");
  assert.equal(row.clicks, 150);
  assert.equal(row.prints, 20409);
  assert.equal(row.cost, "148.52");
  assert.equal(row.totalAmount, "2173.42");
  assert.equal(row.ctr, "0.0073");
  assert.equal(row.acos, "0.0683");
  assert.equal(row.roas, "14.63");
  assert.equal(row.impressionShare, "0.9524");
});

test("rejects malformed metric dates instead of creating a zero row", () => {
  assert.equal(normalizeMercadoLivreAdvertisingMetric({ date: "invalid", cost: 10 }, "advertiser-1"), null);
});
