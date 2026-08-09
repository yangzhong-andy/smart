CREATE TABLE "ProfitScheme" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "externalShopId" TEXT,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfitScheme_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfitSchemeComponent" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "calculationMode" TEXT NOT NULL DEFAULT 'SOURCE',
    "sourceKey" TEXT,
    "includeInGmv" BOOLEAN NOT NULL DEFAULT false,
    "includeInProfit" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfitSchemeComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfitOrderLedger" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalShopId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "orderCurrency" TEXT NOT NULL,
    "exchangeRateCny" DECIMAL(18,8) NOT NULL,
    "schemeId" TEXT,
    "schemeVersion" INTEGER NOT NULL,
    "calculationVersion" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "calculationStatus" TEXT NOT NULL DEFAULT 'CALCULATED',
    "inputHash" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfitOrderLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfitOrderLedgerEntry" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "schemeComponentId" TEXT,
    "componentCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountOriginal" DECIMAL(18,4),
    "currency" TEXT,
    "originalAmounts" JSONB NOT NULL,
    "amountCny" DECIMAL(18,4) NOT NULL,
    "sourceStatus" TEXT NOT NULL,
    "includeInGmv" BOOLEAN NOT NULL DEFAULT false,
    "includeInProfit" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfitOrderLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfitScheme_storeId_version_key" ON "ProfitScheme"("storeId", "version");
CREATE INDEX "ProfitScheme_platform_countryCode_status_idx" ON "ProfitScheme"("platform", "countryCode", "status");
CREATE INDEX "ProfitScheme_storeId_status_effectiveFrom_idx" ON "ProfitScheme"("storeId", "status", "effectiveFrom");
CREATE INDEX "ProfitScheme_externalShopId_effectiveFrom_idx" ON "ProfitScheme"("externalShopId", "effectiveFrom");
CREATE UNIQUE INDEX "ProfitSchemeComponent_schemeId_code_key" ON "ProfitSchemeComponent"("schemeId", "code");
CREATE INDEX "ProfitSchemeComponent_schemeId_sortOrder_idx" ON "ProfitSchemeComponent"("schemeId", "sortOrder");
CREATE INDEX "ProfitSchemeComponent_category_idx" ON "ProfitSchemeComponent"("category");
CREATE UNIQUE INDEX "ProfitOrderLedger_platform_externalShopId_orderId_calculationVersion_key" ON "ProfitOrderLedger"("platform", "externalShopId", "orderId", "calculationVersion");
CREATE INDEX "ProfitOrderLedger_storeId_businessDate_isCurrent_idx" ON "ProfitOrderLedger"("storeId", "businessDate", "isCurrent");
CREATE INDEX "ProfitOrderLedger_externalShopId_businessDate_isCurrent_idx" ON "ProfitOrderLedger"("externalShopId", "businessDate", "isCurrent");
CREATE INDEX "ProfitOrderLedger_calculationStatus_calculatedAt_idx" ON "ProfitOrderLedger"("calculationStatus", "calculatedAt");
CREATE UNIQUE INDEX "ProfitOrderLedgerEntry_ledgerId_componentCode_key" ON "ProfitOrderLedgerEntry"("ledgerId", "componentCode");
CREATE INDEX "ProfitOrderLedgerEntry_componentCode_category_idx" ON "ProfitOrderLedgerEntry"("componentCode", "category");
CREATE INDEX "ProfitOrderLedgerEntry_schemeComponentId_idx" ON "ProfitOrderLedgerEntry"("schemeComponentId");

ALTER TABLE "ProfitScheme" ADD CONSTRAINT "ProfitScheme_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitSchemeComponent" ADD CONSTRAINT "ProfitSchemeComponent_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "ProfitScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfitOrderLedger" ADD CONSTRAINT "ProfitOrderLedger_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitOrderLedger" ADD CONSTRAINT "ProfitOrderLedger_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "ProfitScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfitOrderLedgerEntry" ADD CONSTRAINT "ProfitOrderLedgerEntry_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ProfitOrderLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfitOrderLedgerEntry" ADD CONSTRAINT "ProfitOrderLedgerEntry_schemeComponentId_fkey" FOREIGN KEY ("schemeComponentId") REFERENCES "ProfitSchemeComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Register the existing Brazil TikTok stores without changing any calculation
-- source. Future countries remain unconfigured until their templates are known.
INSERT INTO "ProfitScheme" (
    "id", "storeId", "externalShopId", "name", "platform", "countryCode",
    "currency", "timeZone", "version", "status", "effectiveFrom", "notes", "updatedAt"
)
SELECT
    gen_random_uuid()::TEXT,
    store."id",
    shop."shopId",
    store."name" || ' 巴西 TikTok 利润方案',
    'TIKTOK',
    'BR',
    UPPER(store."currency"),
    'America/Sao_Paulo',
    1,
    'PUBLISHED',
    DATE '1970-01-01',
    '由现有巴西利润核算规则初始化；不改变当前计算结果',
    CURRENT_TIMESTAMP
FROM "Store" store
JOIN "TikTokShopSetting" shop ON shop."bankAccountId" = store."accountId"
WHERE UPPER(shop."region") = 'BR'
  AND store."platform" = 'TIKTOK';

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
    ('GMV', 'GMV（商品金额 + TikTok商品补贴）', 'REVENUE', 'REVENUE', 'gmvCny', TRUE, 10),
    ('PLATFORM_FEE', 'TikTok平台佣金', 'PLATFORM', 'COST', 'platformFeeCny', FALSE, 20),
    ('FULFILLMENT_FEE', 'SFP服务费及每件成交费', 'PLATFORM', 'COST', 'fulfillmentFeeCny', FALSE, 30),
    ('PRODUCT_COST', '采购成本', 'PRODUCT', 'COST', 'productCostCny', FALSE, 40),
    ('LOGISTICS_COST', '物流成本', 'LOGISTICS', 'COST', 'logisticsCostCny', FALSE, 50),
    ('WAREHOUSE_FULFILLMENT', '海外仓代发', 'WAREHOUSE', 'COST', 'warehouseFulfillmentCostCny', FALSE, 60),
    ('AD_COST', '广告实际消耗', 'MARKETING', 'COST', 'netAdCostCny', FALSE, 70),
    ('TAX_COST', '店铺主体税务成本', 'TAX', 'COST', 'taxCostCny', FALSE, 80)
) AS component("code", "label", "category", "direction", "sourceKey", "includeInGmv", "sortOrder")
WHERE scheme."platform" = 'TIKTOK'
  AND scheme."countryCode" = 'BR'
  AND scheme."version" = 1;
