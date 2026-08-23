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

test("effective switch history supports repeated provider changes without rewriting old orders", () => {
  const resolve = createWarehouseResolver(
    [{ tiktokWarehouseId: "WH-BR", warehouseId: "panlian" }],
    [
      { platform: "TIKTOK", region: "BR", shopId: "shop-a", externalWarehouseId: "WH-BR", warehouseId: "hqst", effectiveFrom: "2026-07-01T03:00:00.000Z" },
      { platform: "TIKTOK", region: "BR", shopId: "shop-a", externalWarehouseId: "WH-BR", warehouseId: "panlian", effectiveFrom: "2026-07-15T03:00:00.000Z" },
      { platform: "TIKTOK", region: "BR", shopId: "shop-a", externalWarehouseId: "WH-BR", warehouseId: "hqst", effectiveFrom: "2026-08-01T03:00:00.000Z" },
    ],
  );

  assert.equal(resolve({ warehouse_id: "WH-BR" }, "shop-a", "2026-06-30T23:59:59.000Z", "TIKTOK", "BR").warehouseId, "panlian");
  assert.equal(resolve({ warehouse_id: "WH-BR" }, "shop-a", "2026-07-01T03:00:00.000Z", "TIKTOK", "BR").warehouseId, "hqst");
  assert.equal(resolve({ warehouse_id: "WH-BR" }, "shop-a", "2026-07-20T12:00:00.000Z", "TIKTOK", "BR").warehouseId, "panlian");
  assert.equal(resolve({ warehouse_id: "WH-BR" }, "shop-a", "2026-08-09T12:00:00.000Z", "TIKTOK", "BR").warehouseId, "hqst");
  assert.equal(resolve({ warehouse_id: "WH-BR" }, "shop-b", "2026-08-09T12:00:00.000Z", "TIKTOK", "BR").warehouseId, "panlian");
});

test("shop-wide internal switches ignore changing or missing platform warehouse ids", () => {
  const resolve = createWarehouseResolver(
    [{ tiktokWarehouseId: "OLD-ID", warehouseId: "legacy" }],
    [
      { platform: "TIKTOK", region: "BR", shopId: "shop-a", externalWarehouseId: "*", warehouseId: "hqst", effectiveFrom: "2026-07-01T03:00:00.000Z" },
      { platform: "TIKTOK", region: "BR", shopId: "shop-a", externalWarehouseId: "*", warehouseId: "panlian", effectiveFrom: "2026-07-15T03:00:00.000Z" },
      { platform: "TIKTOK", region: "BR", shopId: "shop-a", externalWarehouseId: "*", warehouseId: "hqst", effectiveFrom: "2026-08-01T03:00:00.000Z" },
    ],
  );

  assert.equal(resolve({ warehouse_id: "NEW-ID-1" }, "shop-a", "2026-07-10T12:00:00.000Z", "TIKTOK", "BR").warehouseId, "hqst");
  assert.equal(resolve({ warehouse_id: "NEW-ID-2" }, "shop-a", "2026-07-20T12:00:00.000Z", "TIKTOK", "BR").warehouseId, "panlian");
  assert.equal(resolve({}, "shop-a", "2026-08-09T12:00:00.000Z", "TIKTOK", "BR").warehouseId, "hqst");
  assert.equal(resolve({ warehouse_id: "OLD-ID" }, "shop-b", "2026-08-09T12:00:00.000Z", "TIKTOK", "BR").warehouseId, "legacy");
});

test("first new-warehouse order is the exact boundary on a mixed switch day", () => {
  const resolve = createWarehouseResolver(
    [{ tiktokWarehouseId: "OLD-ID", warehouseId: "old-warehouse" }],
    [{
      platform: "TIKTOK",
      region: "BR",
      shopId: "shop-a",
      externalWarehouseId: "*",
      warehouseId: "new-warehouse",
      effectiveFrom: "2026-08-13T14:30:00.000Z",
      effectiveOrderId: "585500000000000200",
    }],
  );

  assert.equal(resolve({ warehouse_id: "OLD-ID" }, "shop-a", "2026-08-13T14:29:59.999Z", "TIKTOK", "BR", "585500000000000199").warehouseId, "old-warehouse");
  assert.equal(resolve({ warehouse_id: "OLD-ID" }, "shop-a", "2026-08-13T14:30:00.000Z", "TIKTOK", "BR", "585500000000000199").warehouseId, "old-warehouse");
  assert.equal(resolve({ warehouse_id: "NEW-ID" }, "shop-a", "2026-08-13T14:30:00.000Z", "TIKTOK", "BR", "585500000000000200").warehouseId, "new-warehouse");
  assert.equal(resolve({}, "shop-a", "2026-08-13T14:30:00.001Z", "TIKTOK", "BR", "585500000000000201").warehouseId, "new-warehouse");
});
