import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeShopeeOrder,
  shopeeIncrementalRange,
  SHOPEE_ORDER_WINDOW_SECONDS,
  splitShopeeOrderWindows,
} from "./shopee-orders";

test("splits Shopee order history into contiguous API-safe windows", () => {
  const windows = splitShopeeOrderWindows(1_000, 1_000 + SHOPEE_ORDER_WINDOW_SECONDS * 2 + 9);
  assert.equal(windows.length, 3);
  assert.deepEqual(windows[0], { timeFrom: 1_000, timeTo: 1_000 + SHOPEE_ORDER_WINDOW_SECONDS });
  assert.equal(windows[1].timeFrom, windows[0].timeTo + 1);
  assert.equal(windows[2].timeFrom, windows[1].timeTo + 1);
  assert.equal(windows[2].timeTo, 1_000 + SHOPEE_ORDER_WINDOW_SECONDS * 2 + 9);
});

test("uses a ten-minute overlap after the last successful incremental sync", () => {
  const now = 1_788_000_000;
  const range = shopeeIncrementalRange(new Date((now - 120) * 1000), now);
  assert.deepEqual(range, { timeFrom: now - 720, timeTo: now });
});

test("uses the initial history window when no sync checkpoint exists", () => {
  const now = 1_788_000_000;
  const range = shopeeIncrementalRange(null, now);
  assert.deepEqual(range, { timeFrom: now - 30 * 24 * 60 * 60, timeTo: now });
});

test("normalizes a Shopee order and its SKU quantities", () => {
  const normalized = normalizeShopeeOrder({
    order_sn: "250830ABC",
    order_status: "READY_TO_SHIP",
    currency: "BRL",
    total_amount: 59.9,
    create_time: 1_788_000_000,
    checkout_shipping_carrier: "SPX Express",
    package_list: [{ tracking_number: "BR123" }],
    item_list: [{
      item_id: 101,
      model_id: 202,
      item_sku: "F001",
      model_sku: "F001-BLACK",
      item_name: "Brush",
      model_name: "Black",
      model_quantity_purchased: 3,
      model_original_price: 24.9,
      model_discounted_price: 19.966,
      image_info: { image_url: "https://example.com/item.jpg" },
    }],
  }, { id: "setting-1", shopId: "1842551792", currency: "BRL" });

  assert.equal(normalized.orderSn, "250830ABC");
  assert.equal(normalized.data.shopId, "1842551792");
  assert.equal(normalized.data.totalAmount, "59.9");
  assert.equal(normalized.data.trackingNumber, "BR123");
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.items[0].quantity, 3);
  assert.equal(normalized.items[0].modelSku, "F001-BLACK");
});

test("rejects an order detail without an order number", () => {
  assert.throws(
    () => normalizeShopeeOrder({}, { id: "setting-1", shopId: "shop-1", currency: "BRL" }),
    /order_sn/,
  );
});
