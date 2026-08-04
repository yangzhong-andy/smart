-- 通知、供应商对账、供应链扩展、业财关联（原 localStorage 迁移）

-- Enums
CREATE TYPE "NotificationType" AS ENUM ('payment_required', 'approval_rejected', 'payment_completed', 'cashier_review_required', 'finance_payment_required');
CREATE TYPE "NotificationRelatedType" AS ENUM ('monthly_bill', 'payment_request', 'other');
CREATE TYPE "NotificationPriority" AS ENUM ('high', 'medium', 'low');
CREATE TYPE "SupplierTypeEnum" AS ENUM ('AD_AGENCY', 'LOGISTICS', 'VENDOR');
CREATE TYPE "SupplierBillStatus" AS ENUM ('Draft', 'Pending_Approval', 'Approved', 'Paid', 'Rejected');
CREATE TYPE "OrderTrackingStatus" AS ENUM ('PURCHASING', 'PRODUCING', 'SHIPPED', 'PARTIAL_ARRIVAL', 'ARRIVED', 'COMPLETED');
CREATE TYPE "DocumentEntityType" AS ENUM ('factory', 'order');
CREATE TYPE "DocumentType" AS ENUM ('contract', 'invoice', 'packing_list', 'other');

-- Notification
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "relatedType" "NotificationRelatedType" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "actionUrl" TEXT,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_relatedId_relatedType_idx" ON "Notification"("relatedId", "relatedType");
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- SupplierProfile
CREATE TABLE "SupplierProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupplierTypeEnum" NOT NULL,
    "contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "rebateRate" DECIMAL(5,2),
    "settlementDay" INTEGER,
    "creditTerm" TEXT,
    "currency" TEXT,
    "agencyId" TEXT,
    "supplierId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierProfile_type_idx" ON "SupplierProfile"("type");

-- SupplierMonthlyBill
CREATE TABLE "SupplierMonthlyBill" (
    "id" TEXT NOT NULL,
    "uid" TEXT,
    "supplierProfileId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierType" "SupplierTypeEnum" NOT NULL,
    "month" TEXT NOT NULL,
    "billNumber" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL,
    "supplierBillAmount" DECIMAL(18,2) NOT NULL,
    "systemAmount" DECIMAL(18,2) NOT NULL,
    "difference" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "rebateAmount" DECIMAL(18,2) NOT NULL,
    "rebateRate" DECIMAL(5,2),
    "netAmount" DECIMAL(18,2) NOT NULL,
    "relatedFlowIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uploadedBillFile" TEXT,
    "status" "SupplierBillStatus" NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paidBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentAccountId" TEXT,
    "paymentAccountName" TEXT,
    "paymentMethod" TEXT,
    "paymentFlowId" TEXT,
    "paymentVoucher" TEXT,
    "notes" TEXT,
    CONSTRAINT "SupplierMonthlyBill_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupplierMonthlyBill_uid_key" UNIQUE ("uid"),
    CONSTRAINT "SupplierMonthlyBill_supplierProfileId_fkey" FOREIGN KEY ("supplierProfileId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SupplierMonthlyBill_supplierProfileId_idx" ON "SupplierMonthlyBill"("supplierProfileId");
CREATE INDEX "SupplierMonthlyBill_month_idx" ON "SupplierMonthlyBill"("month");
CREATE INDEX "SupplierMonthlyBill_status_idx" ON "SupplierMonthlyBill"("status");

-- SupplierPayment
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "supplierProfileId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "paymentAccountName" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentFlowId" TEXT NOT NULL,
    "paymentVoucher" TEXT,
    "paidBy" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupplierPayment_billId_key" UNIQUE ("billId"),
    CONSTRAINT "SupplierPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SupplierMonthlyBill"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_supplierProfileId_fkey" FOREIGN KEY ("supplierProfileId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SupplierPayment_supplierProfileId_idx" ON "SupplierPayment"("supplierProfileId");

-- OrderTracking
CREATE TABLE "OrderTracking" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "status" "OrderTrackingStatus" NOT NULL,
    "statusDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderTracking_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderTracking_poId_idx" ON "OrderTracking"("poId");

-- BatchReceipt
CREATE TABLE "BatchReceipt" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL,
    "ownership" JSONB NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BatchReceipt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BatchReceipt_poId_idx" ON "BatchReceipt"("poId");

-- Document
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "entityType" "DocumentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileUrl" TEXT,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT,
    "notes" TEXT,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Document_entityType_entityId_idx" ON "Document"("entityType", "entityId");

-- SalesVelocity
CREATE TABLE "SalesVelocity" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "dailySales" DECIMAL(12,2) NOT NULL,
    "currentStock" INTEGER NOT NULL,
    "inTransitQty" INTEGER NOT NULL DEFAULT 0,
    "daysUntilStockout" INTEGER NOT NULL,
    "recommendedRestock" INTEGER NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesVelocity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SalesVelocity_storeId_sku_key" UNIQUE ("storeId", "sku")
);
CREATE INDEX "SalesVelocity_storeId_idx" ON "SalesVelocity"("storeId");

-- BusinessRelation
CREATE TABLE "BusinessRelation" (
    "id" TEXT NOT NULL,
    "sourceUID" TEXT NOT NULL,
    "targetUID" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessRelation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BusinessRelation_sourceUID_targetUID_relationType_key" UNIQUE ("sourceUID", "targetUID", "relationType")
);
CREATE INDEX "BusinessRelation_sourceUID_idx" ON "BusinessRelation"("sourceUID");
CREATE INDEX "BusinessRelation_targetUID_idx" ON "BusinessRelation"("targetUID");
