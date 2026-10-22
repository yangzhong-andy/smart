-- TikTok Brazil charges SFP separately from the tiered platform commission.
-- Restore the fixed 6% SFP service fee previously zeroed for tiered rules.
UPDATE "ProfitShopCostRule" AS rule
SET "ratePercent" = 6,
    "notes" = CASE
      WHEN "notes" = '2026-07-15 起：按卖家折扣后单件售价分档；佣金含每件费，不另加 6%'
        THEN '2026-07-15 起：按卖家折扣后单件售价分档；佣金百分比 + 每件费，另计 6% SFP'
      WHEN "notes" = '2026-07-15 前：单一佣金 6% + R$4/件'
        THEN '2026-07-15 前：佣金 6% + R$4/件，另计 6% SFP'
      ELSE "notes"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE rule."platform" = 'TIKTOK'
  AND rule."costType" = 'PLATFORM_FULFILLMENT'
  AND EXISTS (
    SELECT 1 FROM "ProfitPlatformFeeTier" AS tier WHERE tier."ruleId" = rule."id"
  )
  AND EXISTS (
    SELECT 1 FROM "TikTokShopSetting" AS shop
    WHERE shop."shopId" = rule."shopId" AND UPPER(shop."region") = 'BR'
  );
