CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyBill_advertising_business_key"
ON "MonthlyBill"("month", "billType", "agencyId", "currency");
