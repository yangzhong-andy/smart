-- Shopee stock deduction remains opt-in until its warehouse and SKU mappings
-- have been audited. This does not change Stock or StockLog balances.
UPDATE "PlatformStockActivation"
SET
  "enabled" = false,
  "notes" = '已暂停：Shopee 仓库与 SKU 映射验收后再正式启用',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "platform" = 'SHOPEE';
