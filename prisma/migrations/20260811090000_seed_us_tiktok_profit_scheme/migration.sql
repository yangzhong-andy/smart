-- Register complete US TikTok stores with the country-specific V1 template.
-- Existing schemes are never replaced; later rule changes create new versions.
INSERT INTO "ProfitScheme" (
    "id", "storeId", "externalShopId", "name", "platform", "countryCode",
    "currency", "timeZone", "version", "status", "effectiveFrom", "notes", "updatedAt"
)
SELECT
    gen_random_uuid()::TEXT,
    store."id",
    shop."shopId",
    store."name" || ' 美国 TikTok 利润方案',
    'TIKTOK',
    'US',
    UPPER(store."currency"),
    'America/Denver',
    1,
    'PUBLISHED',
    DATE '1970-01-01',
    '美区V1：GMV减平台佣金、智能推广费、采购、头程、结算Shipping尾程、海外仓代发和广告实际消耗',
    CURRENT_TIMESTAMP
FROM "Store" store
JOIN "TikTokShopSetting" shop
  ON shop."storeId" = store."id" OR shop."bankAccountId" = store."accountId"
WHERE UPPER(shop."region") = 'US'
  AND UPPER(store."platform"::TEXT) = 'TIKTOK'
  AND UPPER(store."country") = 'US'
  AND NOT EXISTS (
      SELECT 1 FROM "ProfitScheme" existing WHERE existing."storeId" = store."id"
  );

INSERT INTO "ProfitSchemeComponent" (
    "id", "schemeId", "code", "label", "category", "direction",
    "calculationMode", "sourceKey", "includeInGmv", "includeInProfit",
    "required", "visible", "sortOrder", "updatedAt"
)
SELECT
    gen_random_uuid()::TEXT,
    scheme."id",
    component."code",
    component."label",
    component."category",
    component."direction",
    'SOURCE',
    component."sourceKey",
    component."includeInGmv",
    TRUE,
    TRUE,
    TRUE,
    component."sortOrder",
    CURRENT_TIMESTAMP
FROM "ProfitScheme" scheme
CROSS JOIN (VALUES
    ('GMV', 'GMV', 'REVENUE', 'REVENUE', 'gmvCny', TRUE, 10),
    ('PLATFORM_FEE', '平台佣金', 'PLATFORM', 'COST', 'platformFeeCny', FALSE, 20),
    ('SMART_PROMOTION_FEE', '智能推广费', 'PLATFORM', 'COST', 'smartPromotionFeeCny', FALSE, 30),
    ('PRODUCT_COST', '采购成本', 'PRODUCT', 'COST', 'productCostCny', FALSE, 40),
    ('FIRST_MILE_LOGISTICS', '头程物流费用', 'LOGISTICS', 'COST', 'logisticsCostCny', FALSE, 50),
    ('LAST_MILE_LOGISTICS', '尾程物流费用', 'LOGISTICS', 'COST', 'lastMileLogisticsCostCny', FALSE, 60),
    ('WAREHOUSE_FULFILLMENT', '海外仓代发', 'WAREHOUSE', 'COST', 'warehouseFulfillmentCostCny', FALSE, 70),
    ('AD_COST', '广告实际消耗', 'MARKETING', 'COST', 'netAdCostCny', FALSE, 80)
) AS component("code", "label", "category", "direction", "sourceKey", "includeInGmv", "sortOrder")
WHERE scheme."platform" = 'TIKTOK'
  AND scheme."countryCode" = 'US'
  AND scheme."version" = 1
  AND NOT EXISTS (
      SELECT 1 FROM "ProfitSchemeComponent" existing WHERE existing."schemeId" = scheme."id"
  );
