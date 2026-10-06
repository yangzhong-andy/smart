import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getMercadoLivreItem,
  getMercadoLivreItemDescription,
  getMercadoLivreItemVisits,
  searchMercadoLivreItems,
  type MercadoLivreItem,
  type MercadoLivreItemDescription,
  type MercadoLivreItemVariation,
  type MercadoLivreItemVisitsResponse,
} from "@/lib/mercado-livre-api";
import { withFreshMercadoLivreToken } from "@/lib/mercado-livre-token-service";

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function decimal(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(value) : null;
}

function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function date(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function json(value: unknown, fallback: Prisma.InputJsonValue = {}): Prisma.InputJsonValue {
  return (value !== null && value !== undefined ? value : fallback) as Prisma.InputJsonValue;
}

function sellerSku(variation: MercadoLivreItemVariation): string | null {
  const direct = text(variation.seller_custom_field);
  if (direct) return direct;
  const attribute = [...(variation.attributes || []), ...(variation.attribute_combinations || [])]
    .find((candidate) => candidate.id === "SELLER_SKU");
  return text(attribute?.value_name || attribute?.value_id);
}

function variationName(variation: MercadoLivreItemVariation): string | null {
  const values = (variation.attribute_combinations || [])
    .map((attribute) => text(attribute.value_name))
    .filter((value): value is string => Boolean(value));
  return values.length ? values.join(" / ") : null;
}

function visitsInLatestThirtyDays(visits: MercadoLivreItemVisitsResponse | null): number {
  const endValue = text(visits?.date_to)?.slice(0, 10);
  if (!endValue || !/^\d{4}-\d{2}-\d{2}$/.test(endValue)) return integer(visits?.total_visits);
  const start = new Date(`${endValue}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const cutoff = start.toISOString().slice(0, 10);
  return (visits?.results || []).reduce((sum, row) => {
    const businessDate = text(row.date)?.slice(0, 10);
    return businessDate && businessDate >= cutoff && businessDate <= endValue
      ? sum + integer(row.total)
      : sum;
  }, 0);
}

export function normalizeMercadoLivreProduct(
  raw: MercadoLivreItem,
  accountId: string,
  description: MercadoLivreItemDescription | null,
  visits: MercadoLivreItemVisitsResponse | null,
) {
  const itemId = text(raw.id);
  if (!itemId) throw new Error("Mercado Livre 商品缺少 Item ID");
  return {
    itemId,
    data: {
      accountId,
      siteId: text(raw.site_id) || "MLB",
      userProductId: text(raw.user_product_id),
      title: text(raw.title) || itemId,
      familyName: text(raw.family_name),
      categoryId: text(raw.category_id),
      status: text(raw.status),
      substatuses: json(Array.isArray(raw.sub_status) ? raw.sub_status : [], []),
      condition: text(raw.condition),
      currency: text(raw.currency_id),
      price: decimal(raw.price),
      basePrice: decimal(raw.base_price),
      originalPrice: decimal(raw.original_price),
      availableQuantity: integer(raw.available_quantity),
      initialQuantity: integer(raw.initial_quantity),
      soldQuantity: integer(raw.sold_quantity),
      listingTypeId: text(raw.listing_type_id),
      catalogProductId: text(raw.catalog_product_id),
      inventoryId: text(raw.inventory_id),
      permalink: text(raw.permalink),
      thumbnail: text(raw.thumbnail),
      freeShipping: Boolean(raw.shipping?.free_shipping),
      logisticType: text(raw.shipping?.logistic_type),
      buyingMode: text(raw.buying_mode),
      warranty: text(raw.warranty),
      description: text(description?.plain_text || description?.text),
      visits30d: visitsInLatestThirtyDays(visits),
      sourceCreateTime: date(raw.date_created),
      startTime: date(raw.start_time),
      stopTime: date(raw.stop_time),
      endTime: date(raw.end_time),
      lastUpdated: date(raw.last_updated),
      rawData: json(raw),
      syncedAt: new Date(),
    },
    variations: (raw.variations || []).map((variation, index) => ({
      variationId: text(variation.id) || `variation-${index + 1}`,
      sellerSku: sellerSku(variation),
      name: variationName(variation),
      price: decimal(variation.price),
      availableQuantity: integer(variation.available_quantity),
      soldQuantity: integer(variation.sold_quantity),
      inventoryId: text(variation.inventory_id),
      catalogProductId: text(variation.catalog_product_id),
      pictureIds: json(Array.isArray(variation.picture_ids) ? variation.picture_ids : [], []),
      attributes: json([
        ...(variation.attribute_combinations || []),
        ...(variation.attributes || []),
      ], []),
      rawData: json(variation),
    })),
    visitDays: (visits?.results || []).flatMap((row) => {
      const businessDate = text(row.date)?.slice(0, 10);
      if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) return [];
      return [{ date: new Date(`${businessDate}T00:00:00.000Z`), visits: integer(row.total) }];
    }),
  };
}

async function settled<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch {
    return null;
  }
}

async function syncAccount(accountId: string, sellerId: string, visitDays: number) {
  return withFreshMercadoLivreToken(accountId, async (accessToken) => {
    const itemIds: string[] = [];
    let offset = 0;
    for (let page = 0; page < 1_000; page += 1) {
      const response = await searchMercadoLivreItems(accessToken, sellerId, { offset, limit: 50 });
      const pageIds = Array.isArray(response.results) ? response.results.map(String) : [];
      itemIds.push(...pageIds);
      if (pageIds.length < 50) break;
      offset += pageIds.length;
    }

    let saved = 0;
    let variations = 0;
    let visitRows = 0;
    const warnings: Array<{ itemId: string; scope: string }> = [];
    for (const itemId of [...new Set(itemIds)]) {
      const raw = await getMercadoLivreItem(accessToken, itemId);
      const [description, visits] = await Promise.all([
        settled(() => getMercadoLivreItemDescription(accessToken, itemId)),
        settled(() => getMercadoLivreItemVisits(accessToken, itemId, { last: visitDays, unit: "day" })),
      ]);
      if (!description) warnings.push({ itemId, scope: "description" });
      if (!visits) warnings.push({ itemId, scope: "visits" });
      const normalized = normalizeMercadoLivreProduct(raw, accountId, description, visits);

      await prisma.$transaction(async (tx) => {
        const product = await tx.mercadoLivreProduct.upsert({
          where: { accountId_itemId: { accountId, itemId: normalized.itemId } },
          create: { itemId: normalized.itemId, ...normalized.data },
          update: normalized.data,
          select: { id: true },
        });
        await tx.mercadoLivreProductVariation.deleteMany({ where: { productId: product.id } });
        if (normalized.variations.length) {
          await tx.mercadoLivreProductVariation.createMany({
            data: normalized.variations.map((variation) => ({ productId: product.id, ...variation })),
          });
        }
        for (const visit of normalized.visitDays) {
          await tx.mercadoLivreProductVisitDaily.upsert({
            where: { productId_date: { productId: product.id, date: visit.date } },
            create: { productId: product.id, ...visit },
            update: { visits: visit.visits },
          });
        }
      });
      saved += 1;
      variations += normalized.variations.length;
      visitRows += normalized.visitDays.length;
    }

    return { accountId, sellerId, listed: itemIds.length, saved, variations, visitRows, warnings };
  });
}

export async function syncMercadoLivreProducts(input: { accountId?: string; visitDays?: number } = {}) {
  const visitDays = Math.max(1, Math.min(150, Math.trunc(Number(input.visitDays) || 90)));
  const accounts = await prisma.mercadoLivreAccount.findMany({
    where: { status: "active", ...(input.accountId ? { id: input.accountId } : {}) },
    select: { id: true, userId: true },
    orderBy: { createdAt: "asc" },
  });
  const results: Awaited<ReturnType<typeof syncAccount>>[] = [];
  const errors: Array<{ accountId: string; error: string }> = [];
  for (const account of accounts) {
    try {
      results.push(await syncAccount(account.id, account.userId, visitDays));
    } catch (error) {
      errors.push({ accountId: account.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { accounts: accounts.length, visitDays, results, errors };
}
