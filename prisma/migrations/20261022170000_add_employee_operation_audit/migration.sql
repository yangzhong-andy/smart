CREATE TABLE "EmployeeOperationLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "departmentName" TEXT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "targetId" TEXT,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeOperationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeOperationLog_occurredAt_idx" ON "EmployeeOperationLog"("occurredAt" DESC);
CREATE INDEX "EmployeeOperationLog_actorUserId_occurredAt_idx" ON "EmployeeOperationLog"("actorUserId", "occurredAt" DESC);
CREATE INDEX "EmployeeOperationLog_module_occurredAt_idx" ON "EmployeeOperationLog"("module", "occurredAt" DESC);
