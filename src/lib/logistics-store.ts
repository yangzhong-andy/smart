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
 * 获取所有物流渠道
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
 * 保存物流渠道列表
 */
export function saveLogisticsChannels(channels: LogisticsChannel[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHANNELS_KEY, JSON.stringify(channels));
  } catch (e) {
    console.error("Failed to save logistics channels", e);
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
 * 创建或更新物流渠道
 */
export function upsertLogisticsChannel(channel: LogisticsChannel): void {
  const channels = getLogisticsChannels();
  const existingIndex = channels.findIndex((c) => c.id === channel.id);
  
  if (existingIndex >= 0) {
    channels[existingIndex] = {
      ...channel,
      updatedAt: new Date().toISOString()
    };
  } else {
    channels.push({
      ...channel,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  
  saveLogisticsChannels(channels);
}

/**
 * 删除物流渠道
 */
export function deleteLogisticsChannel(id: string): boolean {
  const channels = getLogisticsChannels();
  const filtered = channels.filter((c) => c.id !== id);
  
  if (filtered.length === channels.length) {
    return false; // 未找到
  }
  
  saveLogisticsChannels(filtered);
  return true;
}

/**
 * 获取所有物流跟踪记录
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
 * 创建或更新物流跟踪记录
 */
export function upsertLogisticsTracking(tracking: LogisticsTracking): void {
  const allTracking = getLogisticsTracking();
  const existingIndex = allTracking.findIndex((t) => t.id === tracking.id);
  
  // 计算运输时长
  const shippedDate = new Date(tracking.shippedDate);
  const now = new Date();
  const transportDays = Math.floor((now.getTime() - shippedDate.getTime()) / (1000 * 60 * 60 * 24));
  
  const trackingWithDays = {
    ...tracking,
    transportDays: transportDays >= 0 ? transportDays : 0,
    lastUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  if (existingIndex >= 0) {
    allTracking[existingIndex] = trackingWithDays;
  } else {
    allTracking.push({
      ...trackingWithDays,
      createdAt: new Date().toISOString()
    });
  }
  
  saveLogisticsTracking(allTracking);
}

/**
 * 删除物流跟踪记录
 */
export function deleteLogisticsTracking(id: string): boolean {
  const tracking = getLogisticsTracking();
  const filtered = tracking.filter((t) => t.id !== id);
  
  if (filtered.length === tracking.length) {
    return false; // 未找到
  }
  
  saveLogisticsTracking(filtered);
  return true;
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
