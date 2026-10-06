CREATE TABLE "AccountGroupConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "groups" JSONB NOT NULL,
    "assignments" JSONB NOT NULL,
    "accountOrder" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,

    CONSTRAINT "AccountGroupConfig_pkey" PRIMARY KEY ("id")
);
