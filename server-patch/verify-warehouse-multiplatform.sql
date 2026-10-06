SELECT 'ledger_platforms|' || COALESCE(platform, 'NULL') || '|' || COUNT(*) || '|' || COALESCE(SUM(amount), 0)
FROM "WarehouseFundEntry"
GROUP BY platform
ORDER BY platform NULLS FIRST;

SELECT 'shopee_orders|' || COUNT(*) || '|' || COALESCE(MIN("createTime")::text, '') || '|' || COALESCE(MAX("createTime")::text, '')
FROM "ShopeeOrder";

SELECT 'shopee_status|' || COALESCE(status, 'NULL') || '|' || COUNT(*)
FROM "ShopeeOrder"
GROUP BY status
ORDER BY COUNT(*) DESC;

SELECT 'shopee_binding|' || r."shopId" || '|' || r.region || '|' || r."warehouseId" || '|' || r."effectiveFrom"::text
FROM "ProfitWarehouseSwitchRule" r
WHERE r.platform = 'SHOPEE'
ORDER BY r."shopId", r."effectiveFrom";

SELECT 'warehouse_rule|' || w.name || '|' || COALESCE(r."shopId", '*') || '|' || r.currency || '|' || r."effectiveFrom"::text
FROM "WarehouseFulfillmentRule" r
JOIN "Warehouse" w ON w.id = r."warehouseId"
WHERE r.enabled = true
ORDER BY w.name, r."effectiveFrom";

SELECT 'verified_binding|' || r.platform || '|' || r."shopId" || '|' || COALESCE(s."shopName", '') || '|' || r."warehouseId" || '|' || COALESCE(w.name, '') || '|' || COALESCE(w.code, '') || '|' || r."effectiveFrom"::text
FROM "ProfitWarehouseSwitchRule" r
LEFT JOIN "ShopeeShopSetting" s ON s."shopId" = r."shopId"
LEFT JOIN "Warehouse" w ON w.id = r."warehouseId"
WHERE r.platform = 'SHOPEE'
ORDER BY r."effectiveFrom";

SELECT 'overseas_warehouse|' || id || '|' || code || '|' || name
FROM "Warehouse"
WHERE type = 'OVERSEAS'
ORDER BY name;

SELECT 'shopee_ledger_count|' || COUNT(*)
FROM "WarehouseFundEntry"
WHERE platform = 'SHOPEE';

SELECT 'shopee_ledger_warehouse|' || e."warehouseId" || '|' || w.name || '|' || COUNT(*) || '|' || COALESCE(SUM(e.amount), 0)
FROM "WarehouseFundEntry" e
JOIN "Warehouse" w ON w.id = e."warehouseId"
WHERE e.platform = 'SHOPEE'
GROUP BY e."warehouseId", w.name;

SELECT 'migration_state|' || migration_name || '|finished=' || (finished_at IS NOT NULL) || '|rolled_back=' || (rolled_back_at IS NOT NULL)
FROM "_prisma_migrations"
WHERE migration_name = '20260901173000_add_platform_to_warehouse_fund_ledger';

SELECT 'fund_account|' || w.name || '|' || a.currency || '|credit=' || a."totalCredit" || '|debit=' || a."totalDebit" || '|balance=' || a.balance
FROM "WarehouseFundAccount" a
JOIN "Warehouse" w ON w.id = a."warehouseId"
WHERE a."warehouseId" = 'afab0afc-f8c4-41a6-bef5-cb7d70460bfc';
