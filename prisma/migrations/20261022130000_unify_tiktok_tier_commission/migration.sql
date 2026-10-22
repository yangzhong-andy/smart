-- TikTok Brazil's percentage and per-item charge are one tiered commission.
-- Existing 6% fulfillment rates duplicated that charge in profit reports.
UPDATE "ProfitShopCostRule" AS rule
SET "ratePercent" = 0,
    "notes" = CASE
      WHEN "notes" = '2026-07-15 前：履约 6%，平台 6% + R$4/件'
        THEN '2026-07-15 前：单一佣金 6% + R$4/件'
      WHEN "notes" = '2026-07-15 起：按商品单件售价；履约 6%，平台按价格档位 + 每件固定费'
        THEN '2026-07-15 起：按卖家折扣后单件售价分档；佣金含每件费，不另加 6%'
      ELSE "notes"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE rule."platform" = 'TIKTOK'
  AND rule."costType" = 'PLATFORM_FULFILLMENT'
  AND rule."ratePercent" <> 0
  AND EXISTS (
    SELECT 1 FROM "ProfitPlatformFeeTier" AS tier WHERE tier."ruleId" = rule."id"
  );
