CREATE TABLE "TikTokOAuthState" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "appKey" TEXT NOT NULL,
  "userId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TikTokOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TikTokOAuthState_stateHash_key" ON "TikTokOAuthState"("stateHash");
CREATE INDEX "TikTokOAuthState_expiresAt_idx" ON "TikTokOAuthState"("expiresAt");

CREATE TABLE "TikTokAuthEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "appKey" TEXT,
  "shopId" TEXT,
  "userId" TEXT,
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TikTokAuthEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TikTokAuthEvent_createdAt_idx" ON "TikTokAuthEvent"("createdAt");
CREATE INDEX "TikTokAuthEvent_shopId_idx" ON "TikTokAuthEvent"("shopId");
CREATE INDEX "TikTokAuthEvent_eventType_idx" ON "TikTokAuthEvent"("eventType");
