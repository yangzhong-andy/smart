/**
 * 物流中心 - API 服务层
 */

import type {
  LogisticsChannel,
  LogisticsTracking,
  Warehouse,
  InboundOrder,
  OutboundOrder,
  PaginatedResponse
} from "@/logistics/types";
import { LOGISTICS_STATS_CONFIG } from "@/logistics/constants";

// ==================== 基础 API 调用 ====================

const API_BASE = "/api";

async function fetchApi<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "请求失败" }));
    throw new Error(error.error || error.message || "请求失败");
  }

  // 统一处理响应格式
  const json = await response.json();
  
  // 有些 API 直接返回数组，有些返回 { data: [...] }
  if (Array.isArray(json)) {
    return json as unknown as T;
  }
  
  // 如果有 data 字段，返回 data
  if (json.data !== undefined) {
    return json.data as T;
  }
  
  return json as T;
}

// ==================== 物流渠道服务 ====================

export const channelService = {
  // 获取所有渠道
  async getAll(): Promise<LogisticsChannel[]> {
    return fetchApi<LogisticsChannel[]>(
      `${API_BASE}/logistics-channels?page=1&pageSize=${LOGISTICS_STATS_CONFIG.maxPageSize}`
    );
  },

  // 根据 ID 获取
  async getById(id: string): Promise<LogisticsChannel | null> {
    return fetchApi<LogisticsChannel | null>(
      `${API_BASE}/logistics-channels/${id}`
    ).catch(() => null);
  },

  // 创建
  async create(data: Omit<LogisticsChannel, "id" | "createdAt" | "updatedAt">): Promise<LogisticsChannel> {
    return fetchApi<LogisticsChannel>(`${API_BASE}/logistics-channels`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  // 更新
  async update(id: string, data: Partial<LogisticsChannel>): Promise<LogisticsChannel> {
    return fetchApi<LogisticsChannel>(`${API_BASE}/logistics-channels/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  // 删除
  async delete(id: string): Promise<void> {
    await fetchApi(`${API_BASE}/logistics-channels/${id}`, {
      method: "DELETE"
    });
  }
};

// ==================== 物流跟踪服务 ====================

export const trackingService = {
  // 获取所有跟踪记录
  async getAll(params?: {
    channelId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<LogisticsTracking>> {
    const searchParams = new URLSearchParams();
    if (params?.channelId) searchParams.set("channelId", params.channelId);
    if (params?.status) searchParams.set("status", params.status);
    searchParams.set("page", String(params?.page || 1));
    searchParams.set("pageSize", String(params?.pageSize || LOGISTICS_STATS_CONFIG.defaultPageSize));

    return fetchApi<PaginatedResponse<LogisticsTracking>>(
      `${API_BASE}/logistics-tracking?${searchParams.toString()}`
    );
  },

  // 根据 ID 获取
  async getById(id: string): Promise<LogisticsTracking | null> {
    return fetchApi<LogisticsTracking | null>(
      `${API_BASE}/logistics-tracking/${id}`
    ).catch(() => null);
  },

  // 创建
  async create(data: Omit<LogisticsTracking, "id" | "createdAt" | "updatedAt">): Promise<LogisticsTracking> {
    return fetchApi<LogisticsTracking>(`${API_BASE}/logistics-tracking`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  // 更新
  async update(id: string, data: Partial<LogisticsTracking>): Promise<LogisticsTracking> {
    return fetchApi<LogisticsTracking>(`${API_BASE}/logistics-tracking/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  // 删除
  async delete(id: string): Promise<void> {
    await fetchApi(`${API_BASE}/logistics-tracking/${id}`, {
      method: "DELETE"
    });
  },

  // 添加轨迹事件
  async addEvent(trackingId: string, event: Omit<LogisticsTracking["events"][0], "id">): Promise<LogisticsTracking> {
    return fetchApi<LogisticsTracking>(`${API_BASE}/logistics-tracking/${trackingId}/events`, {
      method: "POST",
      body: JSON.stringify(event)
    });
  }
};

// ==================== 仓库服务 ====================

export const warehouseService = {
  // 获取所有仓库
  async getAll(): Promise<Warehouse[]> {
    return fetchApi<Warehouse[]>(
      `${API_BASE}/warehouses?page=1&pageSize=${LOGISTICS_STATS_CONFIG.maxPageSize}`
    );
  },

  // 根据 ID 获取
  async getById(id: string): Promise<Warehouse | null> {
    return fetchApi<Warehouse | null>(
      `${API_BASE}/warehouses/${id}`
    ).catch(() => null);
  },

  // 创建
  async create(data: Omit<Warehouse, "id" | "createdAt" | "updatedAt">): Promise<Warehouse> {
    return fetchApi<Warehouse>(`${API_BASE}/warehouses`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  // 更新
  async update(id: string, data: Partial<Warehouse>): Promise<Warehouse> {
    return fetchApi<Warehouse>(`${API_BASE}/warehouses/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  // 删除
  async delete(id: string): Promise<void> {
    await fetchApi(`${API_BASE}/warehouses/${id}`, {
      method: "DELETE"
    });
  }
};

// ==================== 入库服务 ====================

export const inboundService = {
  async getAll(params?: {
    warehouseId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<InboundOrder>> {
    const searchParams = new URLSearchParams();
    if (params?.warehouseId) searchParams.set("warehouseId", params.warehouseId);
    if (params?.status) searchParams.set("status", params.status);
    searchParams.set("page", String(params?.page || 1));
    searchParams.set("pageSize", String(params?.pageSize || LOGISTICS_STATS_CONFIG.defaultPageSize));

    return fetchApi<PaginatedResponse<InboundOrder>>(
      `${API_BASE}/pending-inbound?${searchParams.toString()}`
    );
  },

  async getById(id: string): Promise<InboundOrder | null> {
    return fetchApi<InboundOrder | null>(
      `${API_BASE}/pending-inbound/${id}`
    ).catch(() => null);
  },

  async create(data: Omit<InboundOrder, "id" | "createdAt" | "updatedAt">): Promise<InboundOrder> {
    return fetchApi<InboundOrder>(`${API_BASE}/pending-inbound`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  async update(id: string, data: Partial<InboundOrder>): Promise<InboundOrder> {
    return fetchApi<InboundOrder>(`${API_BASE}/pending-inbound/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  async delete(id: string): Promise<void> {
    await fetchApi(`${API_BASE}/pending-inbound/${id}`, {
      method: "DELETE"
    });
  }
};

// ==================== 出库服务 ====================

export const outboundService = {
  async getAll(params?: {
    warehouseId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<OutboundOrder>> {
    const searchParams = new URLSearchParams();
    if (params?.warehouseId) searchParams.set("warehouseId", params.warehouseId);
    if (params?.status) searchParams.set("status", params.status);
    searchParams.set("page", String(params?.page || 1));
    searchParams.set("pageSize", String(params?.pageSize || LOGISTICS_STATS_CONFIG.defaultPageSize));

    return fetchApi<PaginatedResponse<OutboundOrder>>(
      `${API_BASE}/delivery-orders?${searchParams.toString()}`
    );
  },

  async getById(id: string): Promise<OutboundOrder | null> {
    return fetchApi<OutboundOrder | null>(
      `${API_BASE}/delivery-orders/${id}`
    ).catch(() => null);
  },

  async create(data: Omit<OutboundOrder, "id" | "createdAt" | "updatedAt">): Promise<OutboundOrder> {
    return fetchApi<OutboundOrder>(`${API_BASE}/delivery-orders`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  async update(id: string, data: Partial<OutboundOrder>): Promise<OutboundOrder> {
    return fetchApi<OutboundOrder>(`${API_BASE}/delivery-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  async delete(id: string): Promise<void> {
    await fetchApi(`${API_BASE}/delivery-orders/${id}`, {
      method: "DELETE"
    });
  }
};

// ==================== 导出 ====================

export const logisticsService = {
  channel: channelService,
  tracking: trackingService,
  warehouse: warehouseService,
  inbound: inboundService,
  outbound: outboundService
};
