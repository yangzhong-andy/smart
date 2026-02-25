/**
 * 物流中心 - 组合式函数 Hooks
 */

import useSWR from "swr";
import { toast } from "sonner";
import type {
  LogisticsChannel,
  LogisticsTracking,
  Warehouse,
  InboundOrder,
  OutboundOrder,
  TrackingStatus,
  InboundStatus
} from "@/logistics/types";
import {
  LOGISTICS_STATS_CONFIG,
  STATUS_COLORS,
  STATUS_LABELS,
  INBOUND_STATUS_LABELS
} from "@/logistics/constants";
import { logisticsService } from "@/logistics/services";

// ==================== 通用 Fetcher ====================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("请求失败");
  const json = await res.json();
  return Array.isArray(json) ? json : (json?.data ?? []);
};

// ==================== 物流渠道 Hooks ====================

export function useLogisticsChannels() {
  const { data, error, isLoading, mutate } = useSWR<LogisticsChannel[]>(
    "/api/logistics-channels?page=1&pageSize=500",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: LOGISTICS_STATS_CONFIG.dedupingInterval
    }
  );

  return {
    channels: data || [],
    isLoading,
    isError: !!error,
    error,
    mutate
  };
}

// ==================== 物流跟踪 Hooks ====================

export function useLogisticsTracking(params?: {
  channelId?: string;
  status?: TrackingStatus;
}) {
  const query = new URLSearchParams();
  query.set("page", "1");
  query.set("pageSize", "500");
  if (params?.channelId) query.set("channelId", params.channelId);
  if (params?.status) query.set("status", params.status);

  const { data, error, isLoading, mutate } = useSWR<LogisticsTracking[]>(
    `/api/logistics-tracking?${query.toString()}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: LOGISTICS_STATS_CONFIG.dedupingInterval
    }
  );

  const tracking = data ?? [];
  return {
    tracking,
    isLoading,
    isError: !!error,
    error,
    mutate
  };
}

// ==================== 仓库 Hooks ====================

export function useWarehouses() {
  const { data, error, isLoading, mutate } = useSWR<Warehouse[]>(
    "/api/warehouses?page=1&pageSize=500",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: LOGISTICS_STATS_CONFIG.dedupingInterval
    }
  );

  const list = Array.isArray(data) ? data : (Array.isArray((data as any)?.data) ? (data as any).data : []);
  return {
    warehouses: list,
    isLoading,
    isError: !!error,
    error,
    mutate
  };
}

// ==================== 入库 Hooks ====================

export function useInboundOrders(params?: {
  warehouseId?: string;
  status?: InboundStatus;
}) {
  const query = new URLSearchParams();
  query.set("page", "1");
  query.set("pageSize", "500");
  if (params?.warehouseId) query.set("warehouseId", params.warehouseId);
  if (params?.status) query.set("status", params.status);

  const { data, error, isLoading, mutate } = useSWR<InboundOrder[]>(
    `/api/pending-inbound?${query.toString()}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: LOGISTICS_STATS_CONFIG.dedupingInterval
    }
  );

  const inboundOrders = data ?? [];
  return {
    inboundOrders,
    isLoading,
    isError: !!error,
    error,
    mutate
  };
}

// ==================== 出库 Hooks ====================

export function useOutboundOrders(params?: {
  warehouseId?: string;
  status?: string;
}) {
  const query = new URLSearchParams();
  query.set("page", "1");
  query.set("pageSize", "500");
  if (params?.warehouseId) query.set("warehouseId", params.warehouseId);
  if (params?.status) query.set("status", params.status);

  const { data, error, isLoading, mutate } = useSWR<OutboundOrder[]>(
    `/api/outbound-orders?${query.toString()}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: LOGISTICS_STATS_CONFIG.dedupingInterval
    }
  );

  const outboundOrders = Array.isArray(data) ? data : [];
  return {
    outboundOrders,
    isLoading,
    isError: !!error,
    error,
    mutate
  };
}

// ==================== 统计 Hooks ====================

function ensureArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? v : (v && typeof v === "object" && "data" in v && Array.isArray((v as { data: T[] }).data) ? (v as { data: T[] }).data : []);
}

export function useLogisticsStats() {
  const { tracking: trackingRaw, isLoading: trackingLoading } = useLogisticsTracking();
  const { inboundOrders: inboundRaw, isLoading: inboundLoading } = useInboundOrders();
  const { outboundOrders: outboundRaw, isLoading: outboundLoading } = useOutboundOrders();

  const isLoading = trackingLoading || inboundLoading || outboundLoading;
  const tracking = ensureArray<LogisticsTracking>(trackingRaw);
  const inboundOrders = ensureArray<InboundOrder>(inboundRaw);
  const outboundOrders = ensureArray<OutboundOrder>(outboundRaw);

  const stats = {
    tracking: {
      total: tracking.length,
      pending: tracking.filter(t => t?.currentStatus === "Pending").length,
      inTransit: tracking.filter(t => t?.currentStatus === "In Transit").length,
      delivered: tracking.filter(t => t?.currentStatus === "Delivered").length,
      exception: tracking.filter(t => t?.currentStatus === "Exception").length
    },
    inbound: {
      total: inboundOrders.length,
      pending: inboundOrders.filter(i => i?.status === "待入库").length,
      partial: inboundOrders.filter(i => i?.status === "部分入库").length,
      completed: inboundOrders.filter(i => i?.status === "已入库").length,
      pendingQty: inboundOrders.reduce((sum, i) => sum + (Number(i?.qty) || 0) - (Number(i?.receivedQty) || 0), 0)
    },
    outbound: {
      total: outboundOrders.length,
      pending: outboundOrders.filter(o => o?.status === "待出库").length,
      shipped: outboundOrders.filter(o => o?.status === "已出库").length,
      partial: outboundOrders.filter(o => o?.status === "部分出库").length
    }
  };

  return {
    stats,
    isLoading
  };
}

// ==================== 操作 Actions Hooks ====================

export function useChannelActions() {
  const { mutate: mutateChannels } = useLogisticsChannels();

  const createChannel = async (data: Omit<LogisticsChannel, "id" | "createdAt" | "updatedAt">) => {
    try {
      await logisticsService.channel.create(data);
      toast.success("创建成功");
      mutateChannels();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
      return false;
    }
  };

  const updateChannel = async (id: string, data: Partial<LogisticsChannel>) => {
    try {
      await logisticsService.channel.update(id, data);
      toast.success("更新成功");
      mutateChannels();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
      return false;
    }
  };

  const deleteChannel = async (id: string) => {
    try {
      await logisticsService.channel.delete(id);
      toast.success("删除成功");
      mutateChannels();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
      return false;
    }
  };

  return {
    createChannel,
    updateChannel,
    deleteChannel
  };
}

export function useTrackingActions() {
  const { mutate: mutateTracking } = useLogisticsTracking();

  const createTracking = async (data: Omit<LogisticsTracking, "id" | "createdAt" | "updatedAt">) => {
    try {
      await logisticsService.tracking.create(data);
      toast.success("创建成功");
      mutateTracking();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
      return false;
    }
  };

  const updateTracking = async (id: string, data: Partial<LogisticsTracking>) => {
    try {
      await logisticsService.tracking.update(id, data);
      toast.success("更新成功");
      mutateTracking();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
      return false;
    }
  };

  const deleteTracking = async (id: string) => {
    try {
      await logisticsService.tracking.delete(id);
      toast.success("删除成功");
      mutateTracking();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
      return false;
    }
  };

  return {
    createTracking,
    updateTracking,
    deleteTracking
  };
}

export function useWarehouseActions() {
  const { mutate: mutateWarehouses } = useWarehouses();

  const createWarehouse = async (data: Omit<Warehouse, "id" | "createdAt" | "updatedAt">) => {
    try {
      await logisticsService.warehouse.create(data);
      toast.success("创建成功");
      mutateWarehouses();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
      return false;
    }
  };

  const updateWarehouse = async (id: string, data: Partial<Warehouse>) => {
    try {
      await logisticsService.warehouse.update(id, data);
      toast.success("更新成功");
      mutateWarehouses();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
      return false;
    }
  };

  const deleteWarehouse = async (id: string) => {
    try {
      await logisticsService.warehouse.delete(id);
      toast.success("删除成功");
      mutateWarehouses();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
      return false;
    }
  };

  return {
    createWarehouse,
    updateWarehouse,
    deleteWarehouse
  };
}

// ==================== 工具函数 ====================

export function getStatusColor(status: TrackingStatus) {
  return STATUS_COLORS[status] || STATUS_COLORS.Pending;
}

export function getStatusLabel(status: TrackingStatus) {
  return STATUS_LABELS[status] || status;
}

export function formatDate(dateString?: string): string {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString?: string): string {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleString("zh-CN");
  } catch {
    return dateString;
  }
}

// ==================== 导出 ====================

export {
  fetcher,
  STATUS_COLORS,
  STATUS_LABELS,
  INBOUND_STATUS_LABELS
};
