-- Profit report filters orders by shop and business date, and joins settlement rows by order.
CREATE INDEX IF NOT EXISTS "TikTokOrder_shopId_createTime_idx"
  ON "TikTokOrder"("shopId", "createTime");

CREATE INDEX IF NOT EXISTS "StoreOrderSettlement_relatedOrderId_idx"
  ON "StoreOrderSettlement"("relatedOrderId");
