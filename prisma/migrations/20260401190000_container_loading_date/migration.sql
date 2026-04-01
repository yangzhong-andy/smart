-- Container: add loadingDate for factory loading timestamp
ALTER TABLE "Container" ADD COLUMN IF NOT EXISTS "loadingDate" TIMESTAMP(3);
