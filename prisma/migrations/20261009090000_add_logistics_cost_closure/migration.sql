-- Explicit cost-entry closure, independent of transport and payment status.
-- Existing containers/batches remain open until a user confirms completion.
ALTER TABLE "Container" ADD COLUMN "costsClosedAt" TIMESTAMP(3);
ALTER TABLE "OutboundBatch" ADD COLUMN "costsClosedAt" TIMESTAMP(3);
