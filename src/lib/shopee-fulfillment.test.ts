import assert from "node:assert/strict";
import test from "node:test";
import { parseShopeePackages, shopeeFulfillmentStage } from "./shopee-fulfillment";

test("normalizes Shopee package snapshots and ignores invalid entries", () => {
  assert.deepEqual(parseShopeePackages({
    package_list: [
      {
        package_number: "PKG-1",
        tracking_number: "BR123",
        shipping_carrier: "SPX Express",
        logistics_status: "LOGISTICS_PICKUP_DONE",
      },
      null,
    ],
  }), [{
    packageNumber: "PKG-1",
    trackingNumber: "BR123",
    shippingCarrier: "SPX Express",
    logisticsStatus: "LOGISTICS_PICKUP_DONE",
  }]);
  assert.deepEqual(parseShopeePackages(null), []);
});

test("maps order status to fulfillment stages", () => {
  assert.equal(shopeeFulfillmentStage("READY_TO_SHIP"), "pending");
  assert.equal(shopeeFulfillmentStage("SHIPPED"), "shipping");
  assert.equal(shopeeFulfillmentStage("COMPLETED"), "completed");
  assert.equal(shopeeFulfillmentStage("CANCELLED"), "cancelled");
  assert.equal(shopeeFulfillmentStage("UNPAID"), "other");
});
