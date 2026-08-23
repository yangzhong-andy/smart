import assert from "node:assert/strict";
import test from "node:test";
import { quantityBySellerSku, totalOrderQuantity } from "./tiktok-order-quantity";

test("uses TikTok line-item quantity instead of row count", () => {
  const items = [
    { seller_sku: "F002", quantity: 3 },
    { seller_sku: "F003", quantity: "2" },
    { seller_sku: "F002" },
  ];
  assert.equal(totalOrderQuantity(items), 6);
  assert.deepEqual([...quantityBySellerSku(items)], [["F002", 4], ["F003", 2]]);
});
