import assert from "node:assert/strict";
import test from "node:test";
import { createWarehouseResolver, extractTikTokWarehouseId } from "./profit-warehouse-mapping";

test("extracts the order warehouse id from TikTok payloads", () => {
  assert.equal(extractTikTokWarehouseId({ warehouse_id: 123 }), "123");
  assert.equal(extractTikTokWarehouseId({ fulfillment: { warehouse_id: "WH-2" } }), "WH-2");
  assert.equal(extractTikTokWarehouseId({}), null);
});

test("resolves by TikTok warehouse id rather than shop id", () => {
  const resolve = createWarehouseResolver([
    { tiktokWarehouseId: "WH-1", tiktokShopId: "shop-a", warehouseId: "erp-globe" },
    { tiktokWarehouseId: "WH-2", tiktokShopId: null, warehouseId: "erp-panlian" },
  ]);

  assert.deepEqual(resolve({ warehouse_id: "WH-1" }), {
    tiktokWarehouseId: "WH-1",
    warehouseId: "erp-globe",
    mapping: { tiktokWarehouseId: "WH-1", tiktokShopId: "shop-a", warehouseId: "erp-globe" },
    status: "mapped",
  });
  assert.equal(resolve({ warehouse_id: "WH-2", shop_id: "another-shop" }).warehouseId, "erp-panlian");
});

test("reports missing, unknown, and conflicting mappings explicitly", () => {
  const resolve = createWarehouseResolver([
    { tiktokWarehouseId: "WH-X", warehouseId: "erp-a" },
    { tiktokWarehouseId: "WH-X", warehouseId: "erp-b" },
  ]);

  assert.equal(resolve({}).status, "missing_id");
  assert.equal(resolve({ warehouse_id: "WH-UNKNOWN" }).status, "unmapped");
  assert.equal(resolve({ warehouse_id: "WH-X" }).status, "ambiguous");
});
