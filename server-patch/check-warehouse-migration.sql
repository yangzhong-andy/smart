SELECT 'columns=' || COALESCE(string_agg(column_name, ',' ORDER BY column_name), '')
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'WarehouseFundEntry'
  AND column_name IN ('platform', 'shopId', 'shopName', 'countryCode');

SELECT 'migration=' || migration_name || '|finished=' || (finished_at IS NOT NULL) || '|rolled_back=' || (rolled_back_at IS NOT NULL)
FROM "_prisma_migrations"
WHERE migration_name = '20260901173000_add_platform_to_warehouse_fund_ledger';

SELECT 'owner=' || tableowner
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'WarehouseFundEntry';
