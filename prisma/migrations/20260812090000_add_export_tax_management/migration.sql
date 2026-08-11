-- CreateTable
CREATE TABLE "ExportTaxCase" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "deliveryNumber" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL,
    "exporterId" TEXT,
    "exporterName" TEXT,
    "destinationCountry" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "declarationCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "declarationAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "customsDeclarationNumber" TEXT,
    "declarationDate" TIMESTAMP(3),
    "declarationVouchers" JSONB,
    "invoiceStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "invoiceCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "invoiceAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceReceivedDate" TIMESTAMP(3),
    "invoiceVouchers" JSONB,
    "taxPointStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "taxPointRate" DECIMAL(8,4),
    "taxPointAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxPointPaidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxPointPaidDate" TIMESTAMP(3),
    "taxPointVouchers" JSONB,
    "refundStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "refundCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "refundRate" DECIMAL(8,4),
    "refundClaimAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "refundReceivedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "refundApplicationDate" TIMESTAMP(3),
    "refundReceivedDate" TIMESTAMP(3),
    "refundVouchers" JSONB,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT '系统',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportTaxCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportTaxCaseItem" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "contractItemId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "skuName" TEXT,
    "spec" TEXT,
    "qty" INTEGER NOT NULL,
    "needsInvoice" BOOLEAN NOT NULL DEFAULT true,
    "needsTaxRefund" BOOLEAN NOT NULL DEFAULT true,
    "purchaseUnitPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "purchaseAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "declarationUnitPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "declarationAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "invoiceUnitPrice" DECIMAL(18,4),
    "invoiceAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(8,4),
    "refundRate" DECIMAL(8,4),
    "estimatedRefundAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "hsCode" TEXT,
    "customsName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportTaxCaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExportTaxCase_caseNumber_key" ON "ExportTaxCase"("caseNumber");
CREATE INDEX "ExportTaxCase_deliveryOrderId_idx" ON "ExportTaxCase"("deliveryOrderId");
CREATE INDEX "ExportTaxCase_contractId_idx" ON "ExportTaxCase"("contractId");
CREATE INDEX "ExportTaxCase_supplierId_idx" ON "ExportTaxCase"("supplierId");
CREATE INDEX "ExportTaxCase_status_idx" ON "ExportTaxCase"("status");
CREATE INDEX "ExportTaxCase_declarationDate_idx" ON "ExportTaxCase"("declarationDate");
CREATE INDEX "ExportTaxCase_createdAt_idx" ON "ExportTaxCase"("createdAt");
CREATE INDEX "ExportTaxCaseItem_caseId_idx" ON "ExportTaxCaseItem"("caseId");
CREATE INDEX "ExportTaxCaseItem_contractItemId_idx" ON "ExportTaxCaseItem"("contractItemId");
CREATE INDEX "ExportTaxCaseItem_sku_idx" ON "ExportTaxCaseItem"("sku");

-- AddForeignKey
ALTER TABLE "ExportTaxCase" ADD CONSTRAINT "ExportTaxCase_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExportTaxCaseItem" ADD CONSTRAINT "ExportTaxCaseItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ExportTaxCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
