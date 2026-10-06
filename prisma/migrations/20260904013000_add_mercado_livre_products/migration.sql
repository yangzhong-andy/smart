CREATE TABLE "MercadoLivreProduct" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL DEFAULT 'MLB',
    "userProductId" TEXT,
    "title" TEXT NOT NULL,
    "familyName" TEXT,
    "categoryId" TEXT,
    "status" TEXT,
    "substatuses" JSONB NOT NULL,
    "condition" TEXT,
    "currency" TEXT,
    "price" DECIMAL(18,2),
    "basePrice" DECIMAL(18,2),
    "originalPrice" DECIMAL(18,2),
    "availableQuantity" INTEGER NOT NULL DEFAULT 0,
    "initialQuantity" INTEGER NOT NULL DEFAULT 0,
    "soldQuantity" INTEGER NOT NULL DEFAULT 0,
    "listingTypeId" TEXT,
    "catalogProductId" TEXT,
    "inventoryId" TEXT,
    "permalink" TEXT,
    "thumbnail" TEXT,
    "freeShipping" BOOLEAN NOT NULL DEFAULT false,
    "logisticType" TEXT,
    "buyingMode" TEXT,
    "warranty" TEXT,
    "description" TEXT,
    "visits30d" INTEGER NOT NULL DEFAULT 0,
    "sourceCreateTime" TIMESTAMP(3),
    "startTime" TIMESTAMP(3),
    "stopTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "lastUpdated" TIMESTAMP(3),
    "rawData" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoLivreProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MercadoLivreProductVariation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "sellerSku" TEXT,
    "name" TEXT,
    "price" DECIMAL(18,2),
    "availableQuantity" INTEGER NOT NULL DEFAULT 0,
    "soldQuantity" INTEGER NOT NULL DEFAULT 0,
    "inventoryId" TEXT,
    "catalogProductId" TEXT,
    "pictureIds" JSONB NOT NULL,
    "attributes" JSONB NOT NULL,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoLivreProductVariation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MercadoLivreProductVisitDaily" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoLivreProductVisitDaily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MercadoLivreDailyOperationAction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "operationAction" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoLivreDailyOperationAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreProduct_accountId_itemId_key" ON "MercadoLivreProduct"("accountId", "itemId");
CREATE INDEX "MercadoLivreProduct_accountId_status_idx" ON "MercadoLivreProduct"("accountId", "status");
CREATE INDEX "MercadoLivreProduct_itemId_idx" ON "MercadoLivreProduct"("itemId");
CREATE INDEX "MercadoLivreProduct_categoryId_idx" ON "MercadoLivreProduct"("categoryId");
CREATE INDEX "MercadoLivreProduct_lastUpdated_idx" ON "MercadoLivreProduct"("lastUpdated");
CREATE UNIQUE INDEX "MercadoLivreProductVariation_productId_variationId_key" ON "MercadoLivreProductVariation"("productId", "variationId");
CREATE INDEX "MercadoLivreProductVariation_sellerSku_idx" ON "MercadoLivreProductVariation"("sellerSku");
CREATE UNIQUE INDEX "MercadoLivreProductVisitDaily_productId_date_key" ON "MercadoLivreProductVisitDaily"("productId", "date");
CREATE INDEX "MercadoLivreProductVisitDaily_date_idx" ON "MercadoLivreProductVisitDaily"("date");
CREATE UNIQUE INDEX "MercadoLivreDailyOperationAction_accountId_date_key" ON "MercadoLivreDailyOperationAction"("accountId", "date");
CREATE INDEX "MercadoLivreDailyOperationAction_date_idx" ON "MercadoLivreDailyOperationAction"("date");

ALTER TABLE "MercadoLivreProduct" ADD CONSTRAINT "MercadoLivreProduct_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MercadoLivreAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MercadoLivreProductVariation" ADD CONSTRAINT "MercadoLivreProductVariation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MercadoLivreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MercadoLivreProductVisitDaily" ADD CONSTRAINT "MercadoLivreProductVisitDaily_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MercadoLivreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MercadoLivreDailyOperationAction" ADD CONSTRAINT "MercadoLivreDailyOperationAction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MercadoLivreAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
