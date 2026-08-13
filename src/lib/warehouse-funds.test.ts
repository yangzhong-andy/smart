import assert from "node:assert/strict";
import test from "node:test";
import { isWarehouseRechargeCategory } from "./warehouse-funds";

test("recognizes only the warehouse prepaid recharge category", () => {
  assert.equal(isWarehouseRechargeCategory("物流/海外仓一件代发费"), true);
  assert.equal(isWarehouseRechargeCategory("物流/头程物流费"), false);
  assert.equal(isWarehouseRechargeCategory(""), false);
});
