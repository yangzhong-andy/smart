-- Official TikTok affiliate order attribution. Keep this separate from the
-- manually maintained Influencer (BD) table because one order can contain
-- several creator-owned SKU lines.
CREATE TABLE "CreatorOrderAttribution" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'TIKTOK',
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "externalSkuId" TEXT NOT NULL,
    "creatorUsername" TEXT NOT NULL,
    "creatorUserId" TEXT,
    "creatorNickname" TEXT,
    "collaborationType" TEXT,
    "programId" TEXT,
    "openCollaborationId" TEXT,
    "targetCollaborationId" TEXT,
    "campaignId" TEXT,
    "settlementStatus" TEXT,
    "quantity" INTEGER,
    "currency" TEXT,
    "unitPrice" DECIMAL(18,4),
    "source" TEXT NOT NULL DEFAULT 'OFFICIAL_AFFILIATE_API',
    "rawData" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreatorOrderAttribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreatorProfile" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'TIKTOK',
    "creatorUserId" TEXT NOT NULL,
    "username" TEXT,
    "nickname" TEXT,
    "avatarUrl" TEXT,
    "selectionRegion" TEXT,
    "followerCount" INTEGER,
    "rawData" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreatorOrderAttribution_platform_shopId_orderId_externalSkuId_creatorUsername_key"
    ON "CreatorOrderAttribution"("platform", "shopId", "orderId", "externalSkuId", "creatorUsername");
CREATE INDEX "CreatorOrderAttribution_shopId_creatorUsername_idx"
    ON "CreatorOrderAttribution"("shopId", "creatorUsername");
CREATE INDEX "CreatorOrderAttribution_shopId_orderId_idx"
    ON "CreatorOrderAttribution"("shopId", "orderId");
CREATE INDEX "CreatorOrderAttribution_creatorUserId_idx"
    ON "CreatorOrderAttribution"("creatorUserId");
CREATE UNIQUE INDEX "CreatorProfile_platform_creatorUserId_key"
    ON "CreatorProfile"("platform", "creatorUserId");
CREATE INDEX "CreatorProfile_platform_username_idx"
    ON "CreatorProfile"("platform", "username");
