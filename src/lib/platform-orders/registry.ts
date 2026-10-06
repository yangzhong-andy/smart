import type { CommercePlatform, PlatformOrderAdapter } from "./contract";
import { tikTokOrderAdapter } from "./tiktok";
import { shopeeOrderAdapter } from "./shopee";
import { mercadoLivreOrderAdapter } from "./mercado-livre";

const ACTIVE_ORDER_ADAPTERS: Partial<Record<CommercePlatform, PlatformOrderAdapter>> = {
  TIKTOK: tikTokOrderAdapter,
  SHOPEE: shopeeOrderAdapter,
  MERCADO_LIVRE: mercadoLivreOrderAdapter,
};

export function getPlatformOrderAdapter(platform: CommercePlatform): PlatformOrderAdapter | null {
  return ACTIVE_ORDER_ADAPTERS[platform] || null;
}
