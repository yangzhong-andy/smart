import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeShopeeReturn,
  SHOPEE_RETURN_WINDOW_SECONDS,
  splitShopeeReturnWindows,
} from "./shopee-returns";

test("splits return history into Shopee 15-day windows", () => {
  const windows = splitShopeeReturnWindows(100, 100 + SHOPEE_RETURN_WINDOW_SECONDS + 5);
  assert.deepEqual(windows, [
    { timeFrom: 100, timeTo: 100 + SHOPEE_RETURN_WINDOW_SECONDS },
    { timeFrom: 101 + SHOPEE_RETURN_WINDOW_SECONDS, timeTo: 105 + SHOPEE_RETURN_WINDOW_SECONDS },
  ]);
});

test("normalizes a Shopee return and its returned SKU lines", () => {
  const normalized = normalizeShopeeReturn({
    return_sn: "RETURN-1",
    order_sn: "ORDER-1",
    status: "REQUESTED",
    refund_amount: 49.9,
    currency: "BRL",
    needs_logistics: true,
    image: ["https://example.com/a.jpg"],
    create_time: 1_788_000_000,
    user: { username: "buyer" },
    item: [{ item_id: 1, model_id: 2, item_sku: "F001", variation_sku: "F001-B", amount: 2, item_price: 24.95 }],
  }, { id: "setting-1", shopId: "shop-1" });

  assert.equal(normalized.returnSn, "RETURN-1");
  assert.equal(normalized.orderSn, "ORDER-1");
  assert.equal(normalized.data.refundAmount, "49.9");
  assert.equal(normalized.data.buyerUsername, "buyer");
  assert.equal(normalized.items[0].modelSku, "F001-B");
  assert.equal(normalized.items[0].quantity, 2);
});

test("rejects a return without a return number", () => {
  assert.throws(() => normalizeShopeeReturn({}, { id: "setting-1", shopId: "shop-1" }), /return_sn/);
});
