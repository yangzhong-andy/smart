import assert from "node:assert/strict";
import test from "node:test";
import { calculateFirstMileUnitCosts, type FirstMileLogisticsCost } from "./first-mile-logistics";

test("uses the TikTok volume allocation formula for unit first-mile cost", () => {
  const costs: FirstMileLogisticsCost[] = [{
    amount: 300,
    currency: "CNY",
    costType: "SEA_FREIGHT",
    containerId: "container-1",
    outboundBatch: {
      containerId: "container-1",
      container: { id: "container-1" },
      outboundBatchItems: [
        { variantId: "small", sku: "SMALL", qty: 10, variant: { lengthCm: 10, widthCm: 10, heightCm: 10 } },
        { variantId: "large", sku: "LARGE", qty: 10, variant: { lengthCm: 20, widthCm: 10, heightCm: 10 } },
      ],
    },
  }];
  const result = calculateFirstMileUnitCosts(costs, (amount) => Number(amount));
  assert.ok(Math.abs((result.byVariant.get("small")?.cny || 0) - 10) < 1e-9);
  assert.ok(Math.abs((result.byVariant.get("large")?.cny || 0) - 20) < 1e-9);
  assert.ok(Math.abs((result.bySku.get("small")?.cny || 0) - 10) < 1e-9);
  assert.ok(Math.abs((result.byVariant.get("small")?.originalByCurrency.CNY || 0) - 10) < 1e-9);
  assert.ok(Math.abs((result.byVariant.get("large")?.originalByCurrency.CNY || 0) - 20) < 1e-9);
});
