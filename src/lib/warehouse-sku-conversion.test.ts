import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateOutputQuantities,
  cancelSourceReservation,
  completeSourceStock,
  normalizeConversionOutputs,
  reserveSourceStock,
} from "./warehouse-sku-conversion";

test("reserves source stock without changing physical quantity", () => {
  assert.deepEqual(reserveSourceStock({ qty: 100, reservedQty: 10 }, 30), {
    plannedQty: 30,
    qty: 100,
    reservedQty: 40,
    availableQty: 60,
  });
});

test("completes a partial conversion and unlocks the remainder", () => {
  assert.deepEqual(completeSourceStock({ qty: 100, reservedQty: 40 }, 30, 26, 1), {
    plannedQty: 30,
    completedQty: 26,
    damagedQty: 1,
    consumedQty: 27,
    uncompletedQty: 3,
    qty: 73,
    reservedQty: 10,
    availableQty: 63,
  });
});

test("expands each completed source unit by the configured output ratios", () => {
  assert.deepEqual(calculateOutputQuantities(20, [
    { variantId: "set3", quantityPerSource: 1 },
    { variantId: "head3", quantityPerSource: 1 },
  ]), [
    { variantId: "set3", quantityPerSource: 1, quantity: 20 },
    { variantId: "head3", quantityPerSource: 1, quantity: 20 },
  ]);
});

test("rejects duplicate or source output SKUs", () => {
  assert.throws(() => normalizeConversionOutputs("set6", [{ variantId: "set6", quantityPerSource: 1 }]), /母 SKU/);
  assert.throws(() => normalizeConversionOutputs("set6", [
    { variantId: "set3", quantityPerSource: 1 },
    { variantId: "set3", quantityPerSource: 1 },
  ]), /不能重复/);
});

test("cancels only the reservation", () => {
  assert.deepEqual(cancelSourceReservation({ qty: 80, reservedQty: 25 }, 20), {
    qty: 80,
    reservedQty: 5,
    availableQty: 75,
  });
});
