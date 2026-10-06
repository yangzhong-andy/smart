-- Mercado Livre order snapshots and line items.
CREATE TABLE "MercadoLivreOrder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "status" TEXT,
    "substatus" TEXT,
    "currency" TEXT,
    "totalAmount" DECIMAL(18,2),
    "paidAmount" DECIMAL(18,2),
    "buyerNickname" TEXT,
    "shippingId" TEXT,
    "packId" TEXT,
    "dateCreated" TIMESTAMP(3),
    "lastUpdated" TIMESTAMP(3),
    "dateClosed" TIMESTAMP(3),
    "rawData" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MercadoLivreOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreOrder_accountId_externalOrderId_key"
  ON "MercadoLivreOrder"("accountId", "externalOrderId");
CREATE INDEX "MercadoLivreOrder_accountId_dateCreated_idx"
  ON "MercadoLivreOrder"("accountId", "dateCreated");
CREATE INDEX "MercadoLivreOrder_externalOrderId_idx"
  ON "MercadoLivreOrder"("externalOrderId");
CREATE INDEX "MercadoLivreOrder_status_dateCreated_idx"
  ON "MercadoLivreOrder"("status", "dateCreated");

ALTER TABLE "MercadoLivreOrder"
  ADD CONSTRAINT "MercadoLivreOrder_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "MercadoLivreAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MercadoLivreOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "variationId" TEXT,
    "sellerSku" TEXT,
    "title" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,2),
    "fullUnitPrice" DECIMAL(18,2),
    "saleFee" DECIMAL(18,2),
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MercadoLivreOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreOrderItem_orderId_itemId_variationId_key"
  ON "MercadoLivreOrderItem"("orderId", "itemId", "variationId");
CREATE INDEX "MercadoLivreOrderItem_itemId_idx" ON "MercadoLivreOrderItem"("itemId");
CREATE INDEX "MercadoLivreOrderItem_sellerSku_idx" ON "MercadoLivreOrderItem"("sellerSku");

ALTER TABLE "MercadoLivreOrderItem"
  ADD CONSTRAINT "MercadoLivreOrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "MercadoLivreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
