/**
 * 采购中心 - API 服务层
 */

import type {
  PurchaseOrder,
  PurchaseContract,
  DeliveryOrder,
  PendingInbound,
  Supplier,
  PaginatedResponse
} from "@/procurement/types";
import { PROCUREMENT_CONFIG } from "@/procurement/constants";

// ==================== 基础 API 调用 ====================

const API_BASE = "/api";

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
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

  const json = await response.json();
  
  if (Array.isArray(json)) {
    return json as unknown as T;
  }
  
  if (json.data !== undefined) {
    return json.data as T;
  }
  
  return json as T;
}

// ==================== 采购订单服务 ====================

export const purchaseOrderService = {
  async getAll(params?: {
    platform?: string;
    storeId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<PurchaseOrder>> {
    const searchParams = new URLSearchParams();
    if (params?.platform) searchParams.set("platform", params.platform);
    if (params?.storeId) searchParams.set("storeId", params.storeId);
    if (params?.status) searchParams.set("status", params.status);
    searchParams.set("page", String(params?.page || 1));
    searchParams.set("pageSize", String(params?.pageSize || PROCUREMENT_CONFIG.DEFAULT_PAGE_SIZE));

    return fetchApi<PaginatedResponse<PurchaseOrder>>(
      `${API_BASE}/purchase-orders?${searchParams.toString()}`
    );
  },

  async getById(id: string): Promise<PurchaseOrder | null> {
    return fetchApi<PurchaseOrder | null>(
      `${API_BASE}/purchase-orders/${id}`
    ).catch(() => null);
  },

  async create(data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    return fetchApi<PurchaseOrder>(`${API_BASE}/purchase-orders`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  async update(id: string, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    return fetchApi<PurchaseOrder>(`${API_BASE}/purchase-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  async delete(id: string): Promise<void> {
    await fetchApi(`${API_BASE}/purchase-orders/${id}`, {
      method: "DELETE"
    });
  },

  async submitForRisk(id: string): Promise<PurchaseOrder> {
    return fetchApi<PurchaseOrder>(`${API_BASE}/purchase-orders/${id}/submit-risk`, {
      method: "POST"
    });
  },

  async approve(id: string, notes?: string): Promise<PurchaseOrder> {
    return fetchApi<PurchaseOrder>(`${API_BASE}/purchase-orders/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ notes })
    });
  },

  async reject(id: string, notes: string): Promise<PurchaseOrder> {
    return fetchApi<PurchaseOrder>(`${API_BASE}/purchase-orders/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ notes })
    });
  },

  async pushToProcurement(id: string, notes?: string): Promise<PurchaseOrder> {
    return fetchApi<PurchaseOrder>(`${API_BASE}/purchase-orders/${id}/push-procurement`, {
      method: "POST",
      body: JSON.stringify({ notes })
    });
  }
};

// ==================== 采购合同服务 ====================

export const contractService = {
  async getAll(params?: {
    supplierId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<PurchaseContract>> {
    const searchParams = new URLSearchParams();
    if (params?.supplierId) searchParams.set("supplierId", params.supplierId);
    if (params?.status) searchParams.set("status", params.status);
    searchParams.set("page", String(params?.page || 1));
    searchParams.set("pageSize", String(params?.pageSize || PROCUREMENT_CONFIG.DEFAULT_PAGE_SIZE));

    return fetchApi<PaginatedResponse<PurchaseContract>>(
      `${API_BASE}/purchase-contracts?${searchParams.toString()}`
    );
  },

  async getById(id: string): Promise<PurchaseContract | null> {
    return fetchApi<PurchaseContract | null>(
      `${API_BASE}/purchase-contracts/${id}`
    ).catch(() => null);
  },

  async create(data: Partial<PurchaseContract>): Promise<PurchaseContract> {
    return fetchApi<PurchaseContract>(`${API_BASE}/purchase-contracts`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  async update(id: string, data: Partial<PurchaseContract>): Promise<PurchaseContract> {
    return fetchApi<PurchaseContract>(`${API_BASE}/purchase-contracts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  async delete(id: string): Promise<void> {
    await fetchApi(`${API_BASE}/purchase-contracts/${id}`, {
      method: "DELETE"
    });
  },

  async generateFromOrder(orderId: string): Promise<PurchaseContract> {
    return fetchApi<PurchaseContract>(`${API_BASE}/purchase-contracts/generate-from-order`, {
      method: "POST",
      body: JSON.stringify({ orderId })
    });
  },

  async syncDepositFromExpenses(contractId: string): Promise<void> {
    await fetchApi(`${API_BASE}/purchase-contracts/sync-deposit-from-expenses/${contractId}`, {
      method: "POST"
    });
  }
};

// ==================== 送货单服务 ====================

export const deliveryOrderService = {
  async getAll(params?: {
    contractId?: string;
    supplierId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<DeliveryOrder>> {
    const searchParams = new URLSearchParams();
    if (params?.contractId) searchParams.set("contractId", params.contractId);
    if (params?.supplierId) searchParams.set("supplierId", params.supplierId);
    if (params?.status) searchParams.set("status", params.status);
    searchParams.set("page", String(params?.page || 1));
    searchParams.set("pageSize", String(params?.pageSize || PROCUREMENT_CONFIG.DEFAULT_PAGE_SIZE));

    return fetchApi<PaginatedResponse<DeliveryOrder>>(
      `${API_BASE}/delivery-orders?${searchParams.toString()}`
    );
  },

  async getById(id: string): Promise<DeliveryOrder | null> {
    return fetchApi<DeliveryOrder | null>(
      `${API_BASE}/delivery-orders/${id}`
    ).catch(() => null);
  },

  async create(data: Partial<DeliveryOrder>): Promise<DeliveryOrder> {
    return fetchApi<DeliveryOrder>(`${API_BASE}/delivery-orders`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  async update(id: string, data: Partial<DeliveryOrder>): Promise<DeliveryOrder> {
    return fetchApi<DeliveryOrder>(`${API_BASE}/delivery-orders/${id}`, {
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

// ==================== 待入库服务 ====================

export const inboundService = {
  async getAll(params?: {
    warehouseId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<PendingInbound>> {
    const searchParams = new URLSearchParams();
    if (params?.warehouseId) searchParams.set("warehouseId", params.warehouseId);
    if (params?.status) searchParams.set("status", params.status);
    searchParams.set("page", String(params?.page || 1));
    searchParams.set("pageSize", String(params?.pageSize || PROCUREMENT_CONFIG.DEFAULT_PAGE_SIZE));

    return fetchApi<PaginatedResponse<PendingInbound>>(
      `${API_BASE}/pending-inbound?${searchParams.toString()}`
    );
  },

  async createFromDeliveryOrder(deliveryOrderId: string): Promise<PendingInbound> {
    return fetchApi<PendingInbound>(`${API_BASE}/pending-inbound/create-from-delivery`, {
      method: "POST",
      body: JSON.stringify({ deliveryOrderId })
    });
  },

  async receive(id: string, quantity: number): Promise<PendingInbound> {
    return fetchApi<PendingInbound>(`${API_BASE}/pending-inbound/${id}/receive`, {
      method: "POST",
      body: JSON.stringify({ quantity })
    });
  }
};

// ==================== 供应商服务 ====================

export const supplierService = {
  async getAll(params?: {
    category?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<Supplier>> {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    searchParams.set("page", String(params?.page || 1));
    searchParams.set("pageSize", String(params?.pageSize || 500));

    return fetchApi<PaginatedResponse<Supplier>>(
      `/api/suppliers?${searchParams.toString()}`
    );
  },

  async getById(id: string): Promise<Supplier | null> {
    return fetchApi<Supplier | null>(
      `/api/suppliers/${id}`
    ).catch(() => null);
  },

  async create(data: Partial<Supplier>): Promise<Supplier> {
    return fetchApi<Supplier>("/api/suppliers", {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  async update(id: string, data: Partial<Supplier>): Promise<Supplier> {
    return fetchApi<Supplier>(`/api/suppliers`, {
      method: "PUT",
      body: JSON.stringify({ id, ...data })
    });
  },

  async delete(id: string): Promise<void> {
    await fetchApi(`/api/suppliers?id=${id}`, {
      method: "DELETE"
    });
  }
};

// ==================== 导出 ====================

export const procurementService = {
  purchaseOrder: purchaseOrderService,
  contract: contractService,
  delivery: deliveryOrderService,
  inbound: inboundService,
  supplier: supplierService
};
