# Mark prisma/migrations as applied without running SQL (baseline for P3005).
# Run from repo root: npm run db:baseline:client-b
# Then: npm run db:migrate:client-b
# Only use if DB schema already matches migrations (e.g. you used db push before).

$ErrorActionPreference = "Stop"
$envFile = ".env.client-b"

if (-not (Test-Path $envFile)) {
  Write-Error "Missing $envFile. Run this script from the project root (D:\smart)."
}

$migrations = @(
  "20250131000000_add_notification_supplier_supply_business",
  "20250131000001_add_business_uid_mapping",
  "20250131000002_add_product_spec_description",
  "20250131000003_ensure_purchase_contract_item_variant",
  "20250131000004_add_store_order_settlement",
  "20250131000005_add_store_order_settlement_store_id",
  "20250205000000_add_product_spu_code",
  "20250206000000_warehouse_type_inventory_log",
  "20250207000000_delivery_order_item_qtys",
  "20250208000000_purchase_contract_approval",
  "20250209000000_add_outbound_order_pending_inbound_id",
  "20250210000000_outbound_batch_logistics_tracking_fields",
  "20250211000000_outbound_batch_arrival_confirmed_at",
  "20250307000000_expense_request_payee_fields",
  "20260321120000_outbound_batch_items_pre_record_link"
)

foreach ($m in $migrations) {
  Write-Host ""
  Write-Host ">>> prisma migrate resolve --applied $m" -ForegroundColor Cyan
  & npx env-cmd -f $envFile npx prisma migrate resolve --applied $m
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "Baseline done. Next run: npm run db:migrate:client-b" -ForegroundColor Green
