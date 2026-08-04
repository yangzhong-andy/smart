-- AlterEnum: add PENDING_APPROVAL to PurchaseContractStatus
ALTER TYPE "PurchaseContractStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterTable: add approval fields to PurchaseContract
ALTER TABLE "PurchaseContract" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "PurchaseContract" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseContract" ADD COLUMN "approvalNotes" TEXT;
