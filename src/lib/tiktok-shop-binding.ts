import { Platform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { expectedCurrencyForRegion, normalizeTikTokRegion } from "@/lib/tiktok-shop-identity";

type BindingInput = {
  shopId: string;
  shopName: string;
  region: string | null;
  existingStoreId?: string | null;
  bankAccountId?: string | null;
  createIfMissing?: boolean;
};

export async function ensureTikTokStoreBinding(input: BindingInput): Promise<string | null> {
  if (input.existingStoreId) {
    const existing = await prisma.store.findUnique({
      where: { id: input.existingStoreId },
      select: { id: true, platform: true },
    });
    if (existing?.platform === Platform.TIKTOK) return existing.id;
  }

  const availableStoreIds = async (storeIds: string[]) => {
    if (storeIds.length === 0) return [];
    const occupied = await prisma.tikTokShopSetting.findMany({
      where: { storeId: { in: storeIds }, shopId: { not: input.shopId } },
      select: { storeId: true },
    });
    const occupiedIds = new Set(occupied.map((shop) => shop.storeId).filter(Boolean));
    return storeIds.filter((storeId) => !occupiedIds.has(storeId));
  };

  const directMatches = await prisma.store.findMany({
    where: { platform: Platform.TIKTOK, accountId: input.shopId },
    select: { id: true },
    take: 3,
  });
  const availableDirectMatches = await availableStoreIds(directMatches.map((store) => store.id));
  if (availableDirectMatches.length === 1) return availableDirectMatches[0];

  if (input.bankAccountId) {
    const legacyMatches = await prisma.store.findMany({
      where: { platform: Platform.TIKTOK, accountId: input.bankAccountId },
      select: { id: true },
      take: 3,
    });
    const availableLegacyMatches = await availableStoreIds(legacyMatches.map((store) => store.id));
    if (availableLegacyMatches.length === 1) return availableLegacyMatches[0];
  }

  const region = normalizeTikTokRegion(input.region);
  const currency = expectedCurrencyForRegion(region);
  if (!region || !currency) return null;

  const nameMatches = await prisma.store.findMany({
    where: { platform: Platform.TIKTOK, name: input.shopName },
    select: { id: true, country: true },
    take: 3,
  });
  const sameCountryMatches = nameMatches.filter(
    (store) => normalizeTikTokRegion(store.country) === region,
  );
  const availableNameMatches = await availableStoreIds(sameCountryMatches.map((store) => store.id));
  if (availableNameMatches.length === 1) return availableNameMatches[0];

  // A same-name store from another country must be resolved manually instead of duplicated.
  if (nameMatches.length > 0 || !input.createIfMissing) return null;

  const created = await prisma.store.create({
    data: {
      name: input.shopName,
      platform: Platform.TIKTOK,
      country: region,
      currency,
      accountId: input.shopId,
      accountName: input.shopName,
    },
    select: { id: true },
  });
  return created.id;
}
