/**
 * 物流中心数据存储
 * 管理物流渠道和物流跟踪信息
 */

export type LogisticsChannel = {
  id: string;
  name: string; // 物流商名称
  channelCode: string; // 渠道代码
  contact: string; // 联系人
  phone: string; // 联系电话
  queryUrl: string; // 官方查询网址
  createdAt: string;
  updatedAt: string;
};

export type TrackingStatus = "Pending" | "In Transit" | "Delivered" | "Exception";

export type TrackingEvent = {
  id: string;
  timestamp: string; // ISO date string
  location?: string; // 位置信息
  description: string; // 状态描述
  status: TrackingStatus; // 当前状态
};

export type LogisticsTracking = {
  id: string;
  internalOrderNumber: string; // 内部订单号
  trackingNumber: string; // 物流单号
  channelId: string; // 关联的物流渠道ID
  channelName: string; // 物流商名称（冗余字段）
  channelCode?: string; // 渠道代码（冗余字段）
  currentStatus: TrackingStatus; // 当前状态
  shippedDate: string; // 发货日期（ISO date）
  lastUpdatedAt: string; // 最后更新时间（ISO date）
  transportDays?: number; // 运输时长（天）
  orderId?: string; // 关联的店铺订单ID（预留）
  events: TrackingEvent[]; // 物流轨迹事件列表
  createdAt: string;
  updatedAt: string;
};

const CHANNELS_KEY = "logisticsChannels";
const TRACKING_KEY = "logisticsTracking";

/**
 * 获取所有物流渠道（同步，localStorage）
 */
export function getLogisticsChannels(): LogisticsChannel[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(CHANNELS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse logistics channels", e);
    return [];
  }
}

/**
 * 从 API 获取物流渠道
 */
export async function getLogisticsChannelsFromAPI(): Promise<LogisticsChannel[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/logistics-channels?page=1&pageSize=500");
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : (json?.data ?? []);
  } catch (e) {
    console.error("Failed to fetch logistics channels", e);
    return [];
  }
}

/**
 * 保存物流渠道列表（同步到 API - 全量）
 */
export async function saveLogisticsChannels(channels: LogisticsChannel[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const existing = await getLogisticsChannelsFromAPI();
    const existingIds = new Set(existing.map((c) => c.id));
    const newIds = new Set(channels.map((c) => c.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) await fetch(`/api/logistics-channels/${e.id}`, { method: "DELETE" });
    }
    for (const c of channels) {
      if (existingIds.has(c.id)) {
        await fetch(`/api/logistics-channels/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(c)
        });
      } else {
        await fetch("/api/logistics-channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(c)
        });
      }
    }
  } catch (e) {
    console.error("Failed to save logistics channels", e);
    throw e;
  }
}

/**
 * 根据ID获取物流渠道
 */
export function getLogisticsChannelById(id: string): LogisticsChannel | undefined {
  const channels = getLogisticsChannels();
  return channels.find((c) => c.id === id);
}

/**
 * 创建或更新物流渠道（同步到 API）
 */
export async function upsertLogisticsChannel(channel: LogisticsChannel): Promise<void> {
  const body = { ...channel, updatedAt: new Date().toISOString() };
  const existing = await getLogisticsChannelsFromAPI();
  const exists = existing.some((c) => c.id === channel.id);
  if (exists) {
    const res = await fetch(`/api/logistics-channels/${channel.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to update logistics channel");
  } else {
    const res = await fetch("/api/logistics-channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to create logistics channel");
  }
}

/**
 * 删除物流渠道
 */
export async function deleteLogisticsChannel(id: string): Promise<boolean> {
  const res = await fetch(`/api/logistics-channels/${id}`, { method: "DELETE" });
  return res.ok;
}

/**
 * 获取所有物流跟踪记录（同步，localStorage）
 */
export function getLogisticsTracking(): LogisticsTracking[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(TRACKING_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse logistics tracking", e);
    return [];
  }
}

/**
 * 从 API 获取物流跟踪记录
 */
export async function getLogisticsTrackingFromAPI(params?: {
  channelId?: string;
  storeId?: string;
  status?: TrackingStatus;
}): Promise<LogisticsTracking[]> {
  if (typeof window === "undefined") return [];
  try {
    const query = new URLSearchParams();
    if (params?.channelId) query.set("channelId", params.channelId);
    if (params?.storeId) query.set("storeId", params.storeId);
    if (params?.status) query.set("status", params.status);
    const base = query.toString() ? `/api/logistics-tracking?${query}` : "/api/logistics-tracking";
    const url = base + (base.includes("?") ? "&" : "?") + "page=1&pageSize=500";
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : (json?.data ?? []);
  } catch (e) {
    console.error("Failed to fetch logistics tracking", e);
    return [];
  }
}

/**
 * 保存物流跟踪记录列表
 */
export function saveLogisticsTracking(tracking: LogisticsTracking[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRACKING_KEY, JSON.stringify(tracking));
  } catch (e) {
    console.error("Failed to save logistics tracking", e);
  }
}

/**
 * 根据ID获取物流跟踪记录
 */
export function getLogisticsTrackingById(id: string): LogisticsTracking | undefined {
  const tracking = getLogisticsTracking();
  return tracking.find((t) => t.id === id);
}

/**
 * 根据状态获取物流跟踪记录
 */
export function getLogisticsTrackingByStatus(status: TrackingStatus): LogisticsTracking[] {
  const tracking = getLogisticsTracking();
  return tracking.filter((t) => t.currentStatus === status);
}

/**
 * 创建或更新物流跟踪记录（同步到 API）
 */
export async function upsertLogisticsTracking(tracking: LogisticsTracking): Promise<void> {
  const shippedDate = new Date(tracking.shippedDate);
  const now = new Date();
  const transportDays = Math.floor((now.getTime() - shippedDate.getTime()) / (1000 * 60 * 60 * 24));
  const body = {
    ...tracking,
    transportDays: transportDays >= 0 ? transportDays : 0,
    lastUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const existing = await getLogisticsTrackingFromAPI();
  const exists = existing.some((t) => t.id === tracking.id);
  if (exists) {
    const res = await fetch(`/api/logistics-tracking/${tracking.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Failed to update logistics tracking");
  } else {
    const res = await fetch("/api/logistics-tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, createdAt: new Date().toISOString() })
    });
    if (!res.ok) throw new Error("Failed to create logistics tracking");
  }
}

/**
 * 删除物流跟踪记录
 */
export async function deleteLogisticsTracking(id: string): Promise<boolean> {
  const res = await fetch(`/api/logistics-tracking/${id}`, { method: "DELETE" });
  return res.ok;
}

/**
 * 添加物流轨迹事件
 */
export function addTrackingEvent(trackingId: string, event: Omit<TrackingEvent, "id">): boolean {
  const tracking = getLogisticsTracking();
  const trackingRecord = tracking.find((t) => t.id === trackingId);
  
  if (!trackingRecord) return false;
  
  const newEvent: TrackingEvent = {
    ...event,
    id: crypto.randomUUID()
  };
  
  trackingRecord.events.push(newEvent);
  trackingRecord.currentStatus = event.status;
  trackingRecord.lastUpdatedAt = new Date().toISOString();
  
  saveLogisticsTracking(tracking);
  return true;
}
