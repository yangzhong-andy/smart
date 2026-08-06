-- Profit-only seller SKU mappings support bundles without changing inventory mappings.
CREATE TABLE "ProfitSkuMapping" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'TIKTOK',
    "shopId" TEXT NOT NULL,
    "sellerSku" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfitSkuMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfitSkuMappingComponent" (
    "id" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfitSkuMappingComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfitSkuMapping_platform_shopId_sellerSku_key"
    ON "ProfitSkuMapping"("platform", "shopId", "sellerSku");
CREATE INDEX "ProfitSkuMapping_shopId_idx" ON "ProfitSkuMapping"("shopId");
CREATE INDEX "ProfitSkuMapping_sellerSku_idx" ON "ProfitSkuMapping"("sellerSku");
CREATE UNIQUE INDEX "ProfitSkuMappingComponent_mappingId_variantId_key"
    ON "ProfitSkuMappingComponent"("mappingId", "variantId");
CREATE INDEX "ProfitSkuMappingComponent_variantId_idx"
    ON "ProfitSkuMappingComponent"("variantId");

ALTER TABLE "ProfitSkuMappingComponent"
    ADD CONSTRAINT "ProfitSkuMappingComponent_mappingId_fkey"
    FOREIGN KEY ("mappingId") REFERENCES "ProfitSkuMapping"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProfitSkuMappingComponent"
    ADD CONSTRAINT "ProfitSkuMappingComponent_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
