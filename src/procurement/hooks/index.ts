/**
 * 采购中心 - 组合式函数 Hooks
 */

import useSWR from "swr";
import { toast } from "sonner";
import type {
  PurchaseOrder,
  PurchaseContract,
  DeliveryOrder,
  PendingInbound,
  Supplier
} from "@/procurement/types";
import { procurementService } from "@/procurement/services";
import {
  PURCHASE_ORDER_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
  PROCUREMENT_CONFIG
} from "@/procurement/constants";

// ==================== 通用 Fetcher ====================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("请求失败");
  const json = await res.json();
  return Array.isArray(json) ? json : (json?.data ?? []);
};

// ==================== 采购订单 Hooks ====================

export function usePurchaseOrders(params?: {
  platform?: string;
  storeId?: string;
  status?: string;
}) {
  const query = new URLSearchParams();
  query.set("page", "1");
  query.set("pageSize", String(PROCUREMENT_CONFIG.DEFAULT_PAGE_SIZE));
  if (params?.platform) query.set("platform", params.platform);
  if (params?.storeId) query.set("storeId", params.storeId);
  if (params?.status) query.set("status", params.status);

  const { data, error, isLoading, mutate } = useSWR<PurchaseOrder[]>(
    `/api/purchase-orders?${query.toString()}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: PROCUREMENT_CONFIG.DEDUPING_INTERVAL
    }
  );

  return {
    orders: data || [],
    isLoading,
    isError: !!error,
    error,
    mutate
  };
}

// ==================== 采购合同 Hooks ====================

export function useContracts(params?: {
  supplierId?: string;
  status?: string;
}) {
  const query = new URLSearchParams();
  query.set("page", "1");
  query.set("pageSize", String(PROCUREMENT_CONFIG.DEFAULT_PAGE_SIZE));
  if (params?.supplierId) query.set("supplierId", params.supplierId);
  if (params?.status) query.set("status", params.status);

  const { data, error, isLoading, mutate } = useSWR<PurchaseContract[]>(
    `/api/purchase-contracts?${query.toString()}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: PROCUREMENT_CONFIG.DEDUPING_INTERVAL
    }
  );

  return {
    contracts: data || [],
    isLoading,
    isError: !!error,
    error,
    mutate
  };
}

// ==================== 送货单 Hooks ====================

export function useDeliveryOrders(params?: {
  contractId?: string;
  supplierId?: string;
  status?: string;
}) {
  const query = new URLSearchParams();
  query.set("page", "1");
  query.set("pageSize", String(PROCUREMENT_CONFIG.DEFAULT_PAGE_SIZE));
  if (params?.contractId) query.set("contractId", params.contractId);
  if (params?.supplierId) query.set("supplierId", params.supplierId);
  if (params?.status) query.set("status", params.status);

  const { data, error, isLoading, mutate } = useSWR<DeliveryOrder[]>(
    `/api/delivery-orders?${query.toString()}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: PROCUREMENT_CONFIG.DEDUPING_INTERVAL
    }
  );

  return {
    deliveryOrders: data || [],
    isLoading,
    isError: !!error,
    error,
    mutate
  };
}

// ==================== 待入库 Hooks ====================

export function usePendingInbound(params?: {
  warehouseId?: string;
  status?: string;
}) {
  const query = new URLSearchParams();
  query.set("page", "1");
  query.set("pageSize", String(PROCUREMENT_CONFIG.DEFAULT_PAGE_SIZE));
  if (params?.warehouseId) query.set("warehouseId", params.warehouseId);
  if (params?.status) query.set("status", params.status);

  const { data, error, isLoading, mutate } = useSWR<PendingInbound[]>(
    `/api/pending-inbound?${query.toString()}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: PROCUREMENT_CONFIG.DEDUPING_INTERVAL
    }
  );

  return {
    inboundOrders: data || [],
    isLoading,
    isError: !!error,
    error,
    mutate
  };
}

// ==================== 供应商 Hooks ====================

export function useSuppliers() {
  const { data, error, isLoading, mutate } = useSWR<Supplier[]>(
    "/api/suppliers?page=1&pageSize=500",
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("请求失败");
      const json = await res.json();
      // API 返回 { data: [...], pagination: {...} } 格式
      return json.data || [];
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: PROCUREMENT_CONFIG.DEDUPING_INTERVAL
    }
  );

  return {
    suppliers: data || [],
    isLoading,
    isError: !!error,
    error,
    mutate
  };
}

// ==================== 统计 Hooks ====================

export function usePurchaseStats() {
  const { orders, isLoading } = usePurchaseOrders();
  const { contracts, isLoading: contractsLoading } = useContracts();
  const { deliveryOrders, isLoading: deliveryLoading } = useDeliveryOrders();

  const isOverallLoading = isLoading || contractsLoading || deliveryLoading;

  const stats = {
    orders: {
      total: orders.length,
      pending: orders.filter(o => o.status === "PENDING_RISK").length,
      approved: orders.filter(o => 
        ["RISK_APPROVED", "APPROVED", "PUSHED_TO_PROCUREMENT"].includes(o.status)
      ).length,
      rejected: orders.filter(o => 
        ["RISK_REJECTED", "REJECTED"].includes(o.status)
      ).length,
      inProgress: orders.filter(o => 
        ["PROCUREMENT_IN_PROGRESS", "PARTIALLY_RECEIVED"].includes(o.status)
      ).length,
      completed: orders.filter(o => o.status === "COMPLETED").length
    },
    contracts: {
      total: contracts.length,
      active: contracts.filter(c => 
        !["COMPLETED", "CANCELLED"].includes(c.status)
      ).length,
      pending: contracts.filter(c => 
        ["DRAFT", "PENDING_DEPOSIT", "DEPOSIT_PAID"].includes(c.status)
      ).length,
      completed: contracts.filter(c => c.status === "COMPLETED").length
    },
    delivery: {
      total: deliveryOrders.length,
      pending: deliveryOrders.filter(d => d.status === "PENDING").length,
      shipped: deliveryOrders.filter(d => d.status === "SHIPPED").length,
      received: deliveryOrders.filter(d => 
        ["RECEIVED", "PARTIALLY_RECEIVED"].includes(d.status)
      ).length
    }
  };

  return {
    stats,
    isLoading: isOverallLoading
  };
}

// ==================== 操作 Actions Hooks ====================

export function usePurchaseOrderActions() {
  const { mutate: mutateOrders } = usePurchaseOrders();

  const approve = async (id: string, notes?: string) => {
    try {
      await procurementService.purchaseOrder.approve(id, notes);
      toast.success("审批通过");
      mutateOrders();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
      return false;
    }
  };

  const reject = async (id: string, notes: string) => {
    try {
      await procurementService.purchaseOrder.reject(id, notes);
      toast.success("已拒绝");
      mutateOrders();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
      return false;
    }
  };

  const pushToProcurement = async (id: string, notes?: string) => {
    try {
      await procurementService.purchaseOrder.pushToProcurement(id, notes);
      toast.success("已推送采购");
      mutateOrders();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
      return false;
    }
  };

  return {
    approve,
    reject,
    pushToProcurement
  };
}

export function useContractActions() {
  const { mutate: mutateContracts } = useContracts();

  const createFromOrder = async (orderId: string) => {
    try {
      const contract = await procurementService.contract.generateFromOrder(orderId);
      toast.success("合同生成成功");
      mutateContracts();
      return contract;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
      return null;
    }
  };

  const syncDeposit = async (contractId: string) => {
    try {
      await procurementService.contract.syncDepositFromExpenses(contractId);
      toast.success("定金同步成功");
      mutateContracts();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "同步失败");
      return false;
    }
  };

  return {
    createFromOrder,
    syncDeposit
  };
}

// ==================== 供应商操作 Hooks ====================

export function useSupplierActions() {
  const { mutate: mutateSuppliers } = useSuppliers();

  const create = async (data: any) => {
    try {
      await procurementService.supplier.create(data);
      mutateSuppliers();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
      return false;
    }
  };

  const update = async (id: string, data: any) => {
    try {
      await procurementService.supplier.update(id, data);
      mutateSuppliers();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
      return false;
    }
  };

  const deleteSupplier = async (id: string) => {
    try {
      await procurementService.supplier.delete(id);
      mutateSuppliers();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
      return false;
    }
  };

  return {
    createSupplier: create,
    updateSupplier: update,
    deleteSupplier: deleteSupplier
  };
}

// ==================== 工具函数 ====================

export {
  formatCurrency,
  formatDate,
  formatDateTime,
  PURCHASE_ORDER_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  DELIVERY_STATUS_LABELS
};
