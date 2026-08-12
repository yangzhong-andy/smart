import assert from "node:assert/strict";
import test from "node:test";
import {
  hasVoucher,
  isProcurementPayment,
  isProcurementTailPayment,
  serializeVoucher,
} from "./procurement-payment-voucher";

test("recognizes non-empty single and multiple vouchers", () => {
  assert.equal(hasVoucher("data:image/png;base64,abc"), true);
  assert.equal(hasVoucher(["", "https://example.test/voucher.png"]), true);
  assert.equal(hasVoucher(["", "   "]), false);
  assert.equal(hasVoucher(null), false);
});

test("recognizes procurement deposit and tail payments", () => {
  assert.equal(isProcurementPayment({ category: "采购" }), true);
  assert.equal(isProcurementPayment({ summary: "采购合同定金 - PC-1" }), true);
  assert.equal(isProcurementTailPayment({ category: "采购/采购尾款" }), true);
  assert.equal(isProcurementTailPayment({ summary: "采购尾款 - PC-1 - DO-1" }), true);
  assert.equal(isProcurementTailPayment({ category: "物流" }), false);
});

test("serializes voucher arrays without empty entries", () => {
  assert.equal(
    serializeVoucher(["data:image/png;base64,one", "", "data:image/png;base64,two"]),
    JSON.stringify(["data:image/png;base64,one", "data:image/png;base64,two"]),
  );
  assert.equal(serializeVoucher("   "), null);
});
