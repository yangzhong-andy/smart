-- 业财 UID 映射：业务 ID（oldId）↔ 业务 UID
CREATE TABLE "BusinessUidMapping" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "oldId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessUidMapping_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BusinessUidMapping_oldId_key" UNIQUE ("oldId")
);
CREATE INDEX "BusinessUidMapping_entityType_idx" ON "BusinessUidMapping"("entityType");
CREATE INDEX "BusinessUidMapping_uid_idx" ON "BusinessUidMapping"("uid");
