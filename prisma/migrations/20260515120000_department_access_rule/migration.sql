-- CreateTable
CREATE TABLE "DepartmentAccessRule" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentAccessRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentAccessRule_departmentId_key" ON "DepartmentAccessRule"("departmentId");

-- CreateIndex
CREATE INDEX "DepartmentAccessRule_departmentId_idx" ON "DepartmentAccessRule"("departmentId");

-- AddForeignKey
ALTER TABLE "DepartmentAccessRule" ADD CONSTRAINT "DepartmentAccessRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
