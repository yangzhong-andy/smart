CREATE TABLE "ShopeeWebhookLog" (
  "id" TEXT NOT NULL,
  "appConfigId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "messageId" TEXT,
  "code" INTEGER,
  "shopId" TEXT,
  "orderSn" TEXT,
  "signatureValid" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "rawData" JSONB NOT NULL,
  "eventTimestamp" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopeeWebhookLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopeeWebhookLog_eventKey_key" ON "ShopeeWebhookLog"("eventKey");
CREATE INDEX "ShopeeWebhookLog_status_receivedAt_idx" ON "ShopeeWebhookLog"("status", "receivedAt");
CREATE INDEX "ShopeeWebhookLog_shopId_orderSn_idx" ON "ShopeeWebhookLog"("shopId", "orderSn");
CREATE INDEX "ShopeeWebhookLog_messageId_idx" ON "ShopeeWebhookLog"("messageId");

ALTER TABLE "ShopeeWebhookLog"
  ADD CONSTRAINT "ShopeeWebhookLog_appConfigId_fkey"
  FOREIGN KEY ("appConfigId") REFERENCES "ShopeeAppConfig"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
