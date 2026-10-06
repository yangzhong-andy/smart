import assert from "node:assert/strict";
import test from "node:test";
import { isMercadoLivreProfitOrder, mercadoLivreSaleFeeTotal } from "./mercado-livre-profit-report";

test("sums Mercado Livre sale_fee once per order line", () => {
  const total = mercadoLivreSaleFeeTotal([
    { saleFee: 12.5 },
    { saleFee: 7.25 },
  ]);

  assert.equal(total, 19.75);
});

test("does not invent commission when a line has no sale_fee", () => {
  assert.equal(mercadoLivreSaleFeeTotal([{ saleFee: null }]), 0);
});

test("excludes unpaid Mercado Livre orders from profit", () => {
  assert.equal(isMercadoLivreProfitOrder("paid"), true);
  assert.equal(isMercadoLivreProfitOrder("partially_refunded"), true);
  assert.equal(isMercadoLivreProfitOrder("payment_required"), false);
  assert.equal(isMercadoLivreProfitOrder("payment_in_process"), false);
  assert.equal(isMercadoLivreProfitOrder("cancelled"), false);
  assert.equal(isMercadoLivreProfitOrder("invalid"), false);
});
