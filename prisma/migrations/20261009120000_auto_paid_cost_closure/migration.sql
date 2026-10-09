-- Reopening allows one supplementary fee submission without changing payment records.
ALTER TABLE "Container" ADD COLUMN "costsReopened" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OutboundBatch" ADD COLUMN "costsReopened" BOOLEAN NOT NULL DEFAULT false;
