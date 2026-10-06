import { prisma } from "@/lib/prisma";
import { getShopeeItemBaseInfo, getShopeeItemExtraInfo, getShopeeItemList, getShopeeModelList } from "@/lib/shopee-open-api";
import { withFreshShopeeToken } from "@/lib/shopee-order-sync";
import { normalizeShopeeProduct, normalizeShopeeProductModel } from "@/lib/shopee-products";

const STATUSES = ["NORMAL", "UNLIST", "BANNED", "REVIEWING"];
function message(error: unknown) { return error instanceof Error ? error.message : String(error || "Shopee product sync failed"); }

export async function syncShopeeProducts(input: { shopId?: string } = {}) {
  const shops = await prisma.shopeeShopSetting.findMany({ where: { status: "active", ...(input.shopId ? { shopId: input.shopId } : {}), appConfig: { status: "active" } }, select: { id: true, shopId: true, shopName: true, currency: true }, orderBy: { createdAt: "asc" } });
  const results: Array<{ shopId: string; shopName: string; listed: number; saved: number; models: number }> = []; const errors: Array<{ shopId: string; scope?: string; error: string }> = [];
  for (const shop of shops) {
    const itemIds = new Set<string>();
    for (const status of STATUSES) {
      try { let offset = 0; for (let page = 0; page < 1000; page += 1) { const response = await withFreshShopeeToken(shop.id, (credentials) => getShopeeItemList({ ...credentials, itemStatus: status, offset, pageSize: 100 })); for (const item of response.item || []) if (item.item_id) itemIds.add(String(item.item_id)); if (!response.has_next_page) break; offset = response.next_offset ?? (offset + 100); } }
      catch (error) { errors.push({ shopId: shop.shopId, scope: status, error: message(error) }); }
    }
    let saved = 0; let modelCount = 0; const ids = Array.from(itemIds);
    for (let index = 0; index < ids.length; index += 50) {
      const batch = ids.slice(index, index + 50);
      try {
        const [base, extra] = await Promise.all([withFreshShopeeToken(shop.id, (credentials) => getShopeeItemBaseInfo({ ...credentials, itemIds: batch })), withFreshShopeeToken(shop.id, (credentials) => getShopeeItemExtraInfo({ ...credentials, itemIds: batch }))]);
        const extras = new Map((extra.item_list || []).map((item) => [String(item.item_id), item]));
        for (const raw of base.item_list || []) {
          const normalized = normalizeShopeeProduct(raw, extras.get(String(raw.item_id)), shop);
          const modelsResponse = raw.has_model ? await withFreshShopeeToken(shop.id, (credentials) => getShopeeModelList({ ...credentials, itemId: normalized.itemId })) : { model: [] };
          await prisma.$transaction(async (tx) => { const product = await tx.shopeeProduct.upsert({ where: { shopId_itemId: { shopId: shop.shopId, itemId: normalized.itemId } }, create: { itemId: normalized.itemId, ...normalized.data }, update: normalized.data, select: { id: true } }); await tx.shopeeProductModel.deleteMany({ where: { productId: product.id } }); const models = (modelsResponse.model || []).map((model) => ({ productId: product.id, ...normalizeShopeeProductModel(model, shop.currency) })); if (models.length) await tx.shopeeProductModel.createMany({ data: models }); modelCount += models.length; });
          saved += 1;
        }
      } catch (error) { errors.push({ shopId: shop.shopId, scope: `items ${batch.join(",")}`, error: message(error) }); }
    }
    results.push({ shopId: shop.shopId, shopName: shop.shopName || shop.shopId, listed: ids.length, saved, models: modelCount });
  }
  return { shops: shops.length, results, errors };
}
