CREATE TABLE "ProfitSelectionImage" (
    "itemId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    CONSTRAINT "ProfitSelectionImage_pkey" PRIMARY KEY ("itemId")
);

ALTER TABLE "ProfitSelectionImage" ADD CONSTRAINT "ProfitSelectionImage_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "ProfitSelectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
