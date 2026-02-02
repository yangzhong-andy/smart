/**
 * 达人 BD 管理数据存储
 * 管理达人账号、寄样追踪、合作状态等
 */

import { getProductsFromAPI, getProductBySkuIdFromAPI, saveProducts } from "./products-store";
import { addInventoryMovement } from "./inventory-movements-store";

export type CooperationStatus = "待寄样" | "创作中" | "已发布" | "已结束" | "暂停合作";

export type SampleStatus = "待寄样" | "已寄样" | "运输中" | "已签收" | "已拒收";

export type InfluencerBD = {
  id: string;
  // 基础信息
  accountName: string; // 达人账号名称
  platform: "TikTok" | "Instagram" | "YouTube" | "其他"; // 平台
  accountUrl?: string; // 账号链接
  followerCount: number; // 粉丝数
  contactInfo: string; // 联系方式（电话/微信/邮箱）
  category: string; // 所属类目（如：美妆、服装、3C等）
  
  // 合作状态
  cooperationStatus: CooperationStatus;
  
  // 寄样信息
  sampleStatus: SampleStatus;
  sampleOrderNumber?: string; // 寄样单号
  sampleTrackingNumber?: string; // 国际物流号
  sampleProductSku?: string; // 寄样产品SKU
  sampleSentAt?: string; // 寄样时间
  sampleReceivedAt?: string; // 签收时间
  
  // 效果数据
  historicalEngagementRate?: number; // 历史互动率（%）
  estimatedOrders?: number; // 预估订单数（效果预测）
  actualOrders?: number; // 实际订单数
  
  // 备注
  notes?: string;
  
  // 元数据
  createdAt: string;
  updatedAt: string;
};

const INFLUENCER_BD_KEY = "influencerBD";

/**
 * 获取所有达人（同步，localStorage）
 */
export function getInfluencers(): InfluencerBD[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(INFLUENCER_BD_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse influencers", e);
    return [];
  }
}

/**
 * 从 API 获取达人列表
 */
export async function getInfluencersFromAPI(): Promise<InfluencerBD[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/influencers");
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch influencers", e);
    return [];
  }
}

/**
 * 保存达人列表（同步到 API）
 */
export async function saveInfluencers(influencers: InfluencerBD[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const existing = await getInfluencersFromAPI();
    const existingIds = new Set(existing.map((i) => i.id));
    const newIds = new Set(influencers.map((i) => i.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) await fetch(`/api/influencers/${e.id}`, { method: "DELETE" });
    }
    for (const i of influencers) {
      if (existingIds.has(i.id)) {
        await fetch(`/api/influencers/${i.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(i)
        });
      } else {
        await fetch("/api/influencers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(i)
        });
      }
    }
  } catch (e) {
    console.error("Failed to save influencers", e);
    throw e;
  }
}

/**
 * 新增或更新达人（同步到 API）
 */
export async function upsertInfluencer(influencer: InfluencerBD): Promise<void> {
  const body = { ...influencer, updatedAt: new Date().toISOString() };
  const existing = await getInfluencersFromAPI();
  const exists = existing.some((i) => i.id === influencer.id);
  if (exists) {
    const res = await fetch(`/api/influencers/${influencer.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to update influencer");
  } else {
    const res = await fetch("/api/influencers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, createdAt: new Date().toISOString() })
    });
    if (!res.ok) throw new Error("Failed to create influencer");
  }
}

/**
 * 删除达人
 */
export async function deleteInfluencer(id: string): Promise<boolean> {
  const res = await fetch(`/api/influencers/${id}`, { method: "DELETE" });
  return res.ok;
}

// 同步版，向后兼容
function deleteInfluencerSync(id: string): boolean {
  const influencers = getInfluencers();
  const filtered = influencers.filter((i) => i.id !== id);
  
  if (filtered.length === influencers.length) return false;
  
  saveInfluencers(filtered);
  return true;
}

/**
 * 根据ID获取达人
 */
export function getInfluencerById(id: string): InfluencerBD | undefined {
  const influencers = getInfluencers();
  return influencers.find((i) => i.id === id);
}

/**
 * 确认寄样 - 扣减库存并更新状态
 */
export async function confirmSample(
  influencerId: string,
  productSku: string,
  sampleOrderNumber: string
): Promise<{ success: boolean; message: string }> {
  const product = await getProductBySkuIdFromAPI(productSku);
  if (!product) {
    return { success: false, message: "产品不存在" };
  }

  const domesticStock = product.at_domestic || 0;
  if (domesticStock < 1) {
    return { success: false, message: "国内库存不足，无法寄样" };
  }

  const products = await getProductsFromAPI();
  const currentAtDomestic = product.at_domestic || 0;
  const newAtDomestic = Math.max(0, currentAtDomestic - 1);

  const updatedProducts = products.map((p: any) => {
    if (p.sku_id === productSku) {
      return {
        ...p,
        at_domestic: newAtDomestic,
        updatedAt: new Date().toISOString()
      };
    }
    return p;
  });
  await saveProducts(updatedProducts);

  // 更新达人状态
  const influencers = getInfluencers();
  const influencer = influencers.find((i) => i.id === influencerId);
  
  // 记录库存变动
  try {
    addInventoryMovement({
      skuId: productSku,
      skuName: product.name,
      movementType: "寄样出库",
      location: "domestic",
      qty: -1, // 负数表示减少
      qtyBefore: currentAtDomestic,
      qtyAfter: newAtDomestic,
      unitCost: product.cost_price,
      totalCost: product.cost_price || 0,
      currency: product.currency || "CNY",
      relatedOrderNumber: sampleOrderNumber,
      relatedOrderType: "寄样单",
      operationDate: new Date().toISOString(),
      notes: `达人寄样：${influencer?.accountName || "未知达人"}`,
    });
  } catch (e) {
    console.error("Failed to record inventory movement", e);
  }
  if (influencer) {
    influencer.sampleStatus = "已寄样";
    influencer.sampleOrderNumber = sampleOrderNumber;
    influencer.sampleProductSku = productSku;
    influencer.sampleSentAt = new Date().toISOString();
    influencer.cooperationStatus = "创作中";
    influencer.updatedAt = new Date().toISOString();
    saveInfluencers(influencers);
  }
  
  return { success: true, message: "寄样成功，已扣减库存" };
}

/**
 * 更新物流追踪
 */
export function updateTracking(
  influencerId: string,
  trackingNumber: string,
  status: SampleStatus
): void {
  const influencers = getInfluencers();
  const influencer = influencers.find((i) => i.id === influencerId);
  
  if (influencer) {
    influencer.sampleTrackingNumber = trackingNumber;
    influencer.sampleStatus = status;
    
    if (status === "已签收") {
      influencer.sampleReceivedAt = new Date().toISOString();
      // 签收后可以提醒BD跟进
    }
    
    influencer.updatedAt = new Date().toISOString();
    saveInfluencers(influencers);
  }
}

/**
 * 计算效果预测
 * 根据历史互动率和粉丝数预估订单
 */
export function calculateEstimatedOrders(
  followerCount: number,
  engagementRate: number = 3, // 默认3%互动率
  conversionRate: number = 0.5 // 默认0.5%转化率
): number {
  // 预估曝光 = 粉丝数 * 互动率
  const estimatedViews = followerCount * (engagementRate / 100);
  // 预估订单 = 曝光 * 转化率
  const estimatedOrders = Math.floor(estimatedViews * (conversionRate / 100));
  return estimatedOrders;
}

/**
 * 获取统计信息
 */
export function getInfluencerStats() {
  const influencers = getInfluencers();
  
  return {
    total: influencers.length,
    pendingSample: influencers.filter((i) => i.sampleStatus === "待寄样").length,
    creating: influencers.filter((i) => i.cooperationStatus === "创作中").length,
    published: influencers.filter((i) => i.cooperationStatus === "已发布").length,
    inTransit: influencers.filter((i) => i.sampleStatus === "运输中").length,
    received: influencers.filter((i) => i.sampleStatus === "已签收").length
  };
}
