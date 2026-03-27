"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Package,
  ArrowRight,
  CheckCircle,
  X,
  Plus,
  ChevronDown,
  ChevronUp,
  Container as ContainerIcon,
} from "lucide-react";
import { PageHeader, SearchBar, EmptyState, ActionButton } from "@/components/ui";

type SkuOption = { variant_id: string; sku_id: string; name?: string };

type SkuLine = {
  id?: string;
  variantId?: string | null;
  sku: string;
  skuName?: string | null;
  spec?: string | null;
  qty: number;
  unitVolumeCBM: number;
  unitWeightKG: number;
  lineVolumeCBM: number;
  lineWeightKG: number;
};

type DirectSkuItem = {
  key: string;
  variantId?: string | null;
  sku: string;
  skuName?: string | null;
  qty: number;
  qtyPerBox: number;
  boxVolumeCBM: number;
  boxWeightKG: number;
  boxCount: number;
  selectedBoxSpecId: string;
  boxSpecOptions: Array<{
    id: string;
    qtyPerBox: number;
    boxVolumeCBM: number;
    boxWeightKG: number;
    label: string;
  }>;
};

type BatchItem = {
  id: string;
  outboundOrderId: string;
  batchNumber: string;
  warehouseId?: string;
  warehouseName?: string;
  qty: number;
  shippedDate: string;
  destination?: string;
  destinationCountry?: string;
  destinationPlatform?: string;
  destinationStoreName?: string;
  ownerName?: string;
  trackingNumber?: string;
  shippingMethod?: string;
  vesselName?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  eta?: string;
  status: string;
  sourceBatchNumber?: string;
  currentLocation?: string;
  containerId?: string;
  container?: {
    id: string;
    containerNo: string;
    status: string;
  };
  skuLines?: SkuLine[];
  skuLinesEstimated?: boolean;
  skuLinesNote?: string;
  totalVolumeCBM?: number;
  totalWeightKG?: number;
  outboundOrder?: {
    id: string;
    outboundNumber: string;
    sku: string;
    qty: number;
    shippedQty: number;
    status: string;
  };
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  待发货: "待发货",
  已发货: "已发货",
  运输中: "运输中",
  已清关: "已清关",
  已到达: "已到达",
};

const SHIPPING_METHOD_LABELS: Record<string, string> = {
  SEA: "海运",
  AIR: "空运",
  EXPRESS: "快递",
};

function formatDate(iso: string) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("zh-CN");
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function mergeSkuLines(batches: BatchItem[]) {
  const map = new Map<string, DirectSkuItem>();
  for (const b of batches) {
    for (const line of b.skuLines ?? []) {
      const key = `${line.variantId ?? ""}__${line.sku}`;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          key,
          variantId: line.variantId ?? null,
          sku: line.sku,
          skuName: line.skuName ?? null,
          qty: line.qty || 0,
          qtyPerBox: 0,
          boxVolumeCBM: 0,
          boxWeightKG: 0,
          boxCount: 0,
          selectedBoxSpecId: "",
          boxSpecOptions: [],
        });
      } else {
        prev.qty += line.qty || 0;
      }
    }
  }
  return Array.from(map.values());
}

type WarehouseItem = { id: string; name: string; type?: string };

export default function OutboundListPage() {
  const searchParams = useSearchParams();
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  const [confirmBatch, setConfirmBatch] = useState<BatchItem | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [confirming, setConfirming] = useState(false);

  // 柜子选择（只做简单绑定，不影响现有逻辑）
  const [containers, setContainers] = useState<
    { id: string; containerNo: string; status: string }[]
  >([]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [createItems, setCreateItems] = useState<Array<{
    variantId: string;
    sku: string;
    skuName?: string;
    qty: number;
  }>>([]);
  const [createForm, setCreateForm] = useState({
    warehouseId: "",
    destination: "",
    destinationCountry: "",
    destinationPlatform: "",
    destinationStoreId: "",
    destinationStoreName: "",
    ownerType: "",
    ownerId: "",
    ownerName: "",
  });
  // 海外入库预报选项
  const [createForecast, setCreateForecast] = useState(false);
  const [forecastWarehouseId, setForecastWarehouseId] = useState("");
  const [creating, setCreating] = useState(false);

  /** 批次行展开：SKU 明细 + 预录单 */
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [preRecordModalBatches, setPreRecordModalBatches] = useState<BatchItem[]>([]);
  const [preRecordSubmitting, setPreRecordSubmitting] = useState(false);
  const [preRecordForm, setPreRecordForm] = useState({
    name: "",
    notes: "",
    shippingMethod: "SEA",
    originPort: "",
    destinationPort: "",
    destinationCountry: "",
    exporterName: "",
    loadingLocation: "",
    formFilledAt: new Date().toISOString().slice(0, 16),
    loadingDate: "",
    shippingWarehouseId: "",
    shippingWarehouseName: "",
    loadingLogisticsCompany: "",
  });
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertPreRecordId, setConvertPreRecordId] = useState<string | null>(null);
  const [convertOutboundBatchIds, setConvertOutboundBatchIds] = useState<string[]>([]);
  const [convertForm, setConvertForm] = useState({ containerNo: "", containerType: "40HQ" });
  const [converting, setConverting] = useState(false);
  const [directModalBatches, setDirectModalBatches] = useState<BatchItem[]>([]);
  const [directSubmitting, setDirectSubmitting] = useState(false);
  const [directContainerForm, setDirectContainerForm] = useState({
    containerNo: "",
    containerType: "40HQ",
    shippingMethod: "SEA",
    shipCompany: "",
    originPort: "",
    destinationPort: "",
    destinationCountry: "",
    etd: "",
    eta: "",
  });
  const [directSkuItems, setDirectSkuItems] = useState<DirectSkuItem[]>([]);

  useEffect(() => {
    const queryKeyword = searchParams?.get("keyword")?.trim();
    if (!queryKeyword) return;
    setKeyword(queryKeyword);
  }, [searchParams]);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pagination.page));
      params.set("pageSize", String(pagination.pageSize));
      if (filterStatus !== "all") params.set("status", filterStatus);
      const res = await fetch(`/api/outbound-batch?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof json?.error === "string"
            ? json.error
            : `加载失败 (${res.status})`;
        throw new Error(msg);
      }
      setBatches(Array.isArray(json.data) ? json.data : []);
      if (json.pagination) setPagination((p) => ({ ...p, ...json.pagination }));
    } catch (e) {
      setBatches([]);
      toast.error(
        e instanceof Error ? e.message : "加载出库批次失败，请检查网络或数据库迁移是否已执行"
      );
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, filterStatus]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const fetchContainers = useCallback(async () => {
    try {
      const res = await fetch("/api/containers?page=1&pageSize=200");
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.data) ? data.data : [];
      setContainers(
        list.map((c: any) => ({
          id: c.id,
          containerNo: c.containerNo,
          status: c.status,
        }))
      );
    } catch {
      setContainers([]);
    }
  }, []);

  const fetchWarehouses = useCallback(async () => {
    try {
      const res = await fetch("/api/warehouses?page=1&pageSize=500");
      const data = await res.json().catch(() => ({}));
      setWarehouses(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setWarehouses([]);
    }
  }, []);

  const fetchSkus = useCallback(async () => {
    try {
      const res = await fetch("/api/products?pageSize=500");
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : (data?.data ?? []);
      setSkus(
        list
          .filter((p: any) => p.variant_id && (p.sku_id || p.skuId))
          .map((p: any) => ({
            variant_id: p.variant_id,
            sku_id: p.sku_id ?? p.skuId ?? "",
            name: p.name,
          }))
      );
    } catch {
      setSkus([]);
    }
  }, []);

  const openCreateModal = () => {
    setCreateModalOpen(true);
    setCreateItems([{ variantId: "", sku: "", skuName: "", qty: 0 }]);
    setCreateForm({
      warehouseId: "",
      destination: "",
      destinationCountry: "",
      destinationPlatform: "",
      destinationStoreId: "",
      destinationStoreName: "",
      ownerType: "",
      ownerId: "",
      ownerName: "",
    });
    fetchSkus();
    fetchWarehouses();
    fetchContainers();
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setCreateItems([]);
    setCreateForm({
      warehouseId: "",
      destination: "",
      destinationCountry: "",
      destinationPlatform: "",
      destinationStoreId: "",
      destinationStoreName: "",
      ownerType: "",
      ownerId: "",
      ownerName: "",
    });
    setCreateForecast(false);
    setForecastWarehouseId("");
  };

  const addSkuItem = () => {
    setCreateItems([...createItems, { variantId: "", sku: "", skuName: "", qty: 0 }]);
  };

  const removeSkuItem = (index: number) => {
    if (createItems.length > 1) {
      setCreateItems(createItems.filter((_, i) => i !== index));
    }
  };

  const updateSkuItem = (index: number, field: string, value: any) => {
    const newItems = [...createItems];
    (newItems[index] as any)[field] = value;
    setCreateItems(newItems);
  };

  const handleCreateOutbound = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 过滤有效的SKU项
    const validItems = createItems.filter(item => item.variantId && item.qty > 0);
    if (validItems.length === 0) {
      toast.error("请至少添加一个有效的SKU");
      return;
    }
    if (!createForm.warehouseId) {
      toast.error("请选择仓库");
      return;
    }
    const warehouse = warehouses.find((w) => w.id === createForm.warehouseId);
    if (!warehouse) {
      toast.error("所选仓库无效");
      return;
    }
    setCreating(true);
    try {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const r = Math.random().toString(36).slice(2, 6).toUpperCase();
      const outboundNumber = `OB-${date}-${r}`;
      
      // 准备items数据
      const items = validItems.map(item => {
        const skuInfo = skus.find(s => s.variant_id === item.variantId);
        return {
          variantId: item.variantId,
          sku: item.sku,
          skuName: skuInfo?.name || "",
          qty: item.qty,
        };
      });

      const res = await fetch("/api/outbound-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundNumber,
          items,
          warehouseId: createForm.warehouseId,
          warehouseName: warehouse.name,
          destination: createForm.destination.trim() || null,
          destinationCountry: createForm.destinationCountry.trim() || null,
          destinationPlatform: createForm.destinationPlatform.trim() || null,
          destinationStoreId: createForm.destinationStoreId.trim() || null,
          destinationStoreName: createForm.destinationStoreName.trim() || null,
          ownerType: createForm.ownerType.trim() || null,
          ownerId: createForm.ownerId.trim() || null,
          ownerName: createForm.ownerName.trim() || null,
          status: "待出库",
          // 海外入库预报参数
          createOverseasForecast: createForecast,
          forecastWarehouseId: createForecast ? forecastWarehouseId : null,
          forecastWarehouseName: createForecast ? warehouses.find(w => w.id === forecastWarehouseId)?.name : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "创建失败");
      }
      let successMsg = `出库单已创建：${data.outboundNumber ?? outboundNumber}`;
      if (data.forecast) {
        successMsg += `\n海外入库预报已创建：${data.forecast.inboundNumber}`;
      }
      toast.success(successMsg);
      closeCreateModal();
      fetchBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建出库单失败");
    } finally {
      setCreating(false);
    }
  };

  const openConfirmModal = (batch: BatchItem) => {
    setConfirmBatch(batch);
    setToWarehouseId("");
    fetchWarehouses();
  };

  const closeConfirmModal = () => {
    setConfirmBatch(null);
    setToWarehouseId("");
  };

  const handleConfirmArrival = async () => {
    if (!confirmBatch || !toWarehouseId) {
      toast.error("请选择目的地仓库");
      return;
    }
    setConfirming(true);
    try {
      const res = await fetch(`/api/outbound-batch/${confirmBatch.id}/confirm-arrival`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toWarehouseId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "确认失败");
      }
      toast.success("已确认到货，海外仓库存已增加");
      closeConfirmModal();
      fetchBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "确认到货失败");
    } finally {
      setConfirming(false);
    }
  };

  const filtered = batches.filter((b) => {
    if (!keyword.trim()) return true;
    const k = keyword.toLowerCase();
    return (
      b.batchNumber?.toLowerCase().includes(k) ||
      b.outboundOrder?.outboundNumber?.toLowerCase().includes(k) ||
      b.destination?.toLowerCase().includes(k) ||
      b.destinationCountry?.toLowerCase().includes(k) ||
      b.destinationPlatform?.toLowerCase().includes(k) ||
      b.destinationStoreName?.toLowerCase().includes(k) ||
      b.ownerName?.toLowerCase().includes(k) ||
      b.warehouseName?.toLowerCase().includes(k)
    );
  });

  useEffect(() => {
    const queryKeyword = searchParams?.get("keyword")?.trim();
    if (!queryKeyword) return;
    if (filtered.length === 0) return;
    setExpandedBatchId((prev) => prev ?? filtered[0].id);
  }, [searchParams, filtered]);

  const openPreRecordModal = (batches: BatchItem[]) => {
    if (batches.length === 0) return;
    const first = batches[0];
    setPreRecordModalBatches(batches);
    setPreRecordForm({
      name:
        batches.length > 1
          ? `预录-拼柜-${new Date().toISOString().slice(0, 10)}`
          : `预录-${first.batchNumber}-${new Date().toISOString().slice(0, 10)}`,
      notes: "",
      shippingMethod: first.shippingMethod || "SEA",
      originPort: first.portOfLoading || "",
      destinationPort: first.portOfDischarge || "",
      destinationCountry: first.destinationCountry || "",
      exporterName: "",
      loadingLocation: "",
      formFilledAt: new Date().toISOString().slice(0, 16),
      loadingDate: "",
      shippingWarehouseId: first.warehouseId || "",
      shippingWarehouseName: first.warehouseName || "",
      loadingLogisticsCompany: "",
    });
  };

  const openMergePreRecordModal = () => {
    const selected = batches.filter((b) => selectedBatchIds.includes(b.id));
    if (selected.length < 2) {
      toast.error("请至少勾选 2 个批次进行拼柜");
      return;
    }
    openPreRecordModal(selected);
  };

  const openDirectContainerModal = async (batches: BatchItem[]) => {
    if (batches.length === 0) return;
    const first = batches[0];
    setDirectModalBatches(batches);
    setDirectContainerForm({
      containerNo: "",
      containerType: "40HQ",
      shippingMethod: first.shippingMethod || "SEA",
      shipCompany: "",
      originPort: first.portOfLoading || "",
      destinationPort: first.portOfDischarge || "",
      destinationCountry: first.destinationCountry || "",
      etd: "",
      eta: "",
    });
    const merged = mergeSkuLines(batches);
    setDirectSkuItems(merged);
    try {
      const withSpecs = await Promise.all(
        merged.map(async (row) => {
          const variantId = row.variantId ? String(row.variantId) : "";
          if (!variantId) return row;
          const res = await fetch(`/api/box-spec?variantId=${encodeURIComponent(variantId)}`);
          const list = await res.json().catch(() => []);
          const options = (Array.isArray(list) ? list : [])
            .map((spec: any) => {
              const boxVolumeCBM =
                spec.boxLengthCm && spec.boxWidthCm && spec.boxHeightCm
                  ? (Number(spec.boxLengthCm) * Number(spec.boxWidthCm) * Number(spec.boxHeightCm)) / 1_000_000
                  : 0;
              const boxWeightKG = Number(spec.weightKg || 0);
              const qtyPerBox = Number(spec.qtyPerBox || 0);
              return {
                id: String(spec.id || ""),
                qtyPerBox,
                boxVolumeCBM,
                boxWeightKG,
                label: `${qtyPerBox || "-"}件/箱 · ${boxVolumeCBM > 0 ? boxVolumeCBM.toFixed(4) : "-"}m³ · ${boxWeightKG > 0 ? boxWeightKG.toFixed(3) : "-"}kg`,
              };
            })
            .filter((it) => it.id);
          const first = options[0];
          if (!first) return row;
          return {
            ...row,
            qtyPerBox: first.qtyPerBox,
            boxVolumeCBM: first.boxVolumeCBM,
            boxWeightKG: first.boxWeightKG,
            boxCount: first.qtyPerBox > 0 ? Math.ceil((row.qty || 0) / first.qtyPerBox) : 0,
            selectedBoxSpecId: first.id,
            boxSpecOptions: options,
          };
        })
      );
      setDirectSkuItems(withSpecs);
    } catch {
      // 保持默认值，不阻断装柜流程
    }
  };

  const openMergeDirectContainerModal = () => {
    const selected = batches.filter((b) => selectedBatchIds.includes(b.id));
    if (selected.length === 0) {
      toast.error("请至少勾选 1 个批次");
      return;
    }
    openDirectContainerModal(selected);
  };

  const submitPreRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preRecordModalBatches.length === 0) return;
    setPreRecordSubmitting(true);
    try {
      const payload = {
        name: preRecordForm.name.trim(),
        notes: preRecordForm.notes.trim() || null,
        shippingMethod: preRecordForm.shippingMethod,
        originPort: preRecordForm.originPort.trim() || null,
        destinationPort: preRecordForm.destinationPort.trim() || null,
        destinationCountry: preRecordForm.destinationCountry.trim() || null,
        exporterName: preRecordForm.exporterName.trim() || null,
        loadingLocation: preRecordForm.loadingLocation.trim() || null,
        formFilledAt: preRecordForm.formFilledAt || null,
        loadingDate: preRecordForm.loadingDate || null,
        shippingWarehouseId: preRecordForm.shippingWarehouseId || null,
        shippingWarehouseName: preRecordForm.shippingWarehouseName || null,
        loadingLogisticsCompany: preRecordForm.loadingLogisticsCompany.trim() || null,
      };
      const isMergeMode = preRecordModalBatches.length > 1;
      const url = isMergeMode
        ? "/api/outbound-batch/merge-container-pre-record"
        : `/api/outbound-batch/${preRecordModalBatches[0].id}/container-pre-record`;
      const requestBody = isMergeMode
        ? { ...payload, batchIds: preRecordModalBatches.map((b) => b.id) }
        : payload;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "生成预录单失败");
      toast.success("预录单已生成，请填写柜号完成转正式柜");
      setPreRecordModalBatches([]);
      setConvertPreRecordId(data.id);
      const idsFromApi = Array.isArray(data?.outboundBatchIds) ? data.outboundBatchIds : [];
      setConvertOutboundBatchIds(idsFromApi.length > 0 ? idsFromApi : preRecordModalBatches.map((b) => b.id));
      const sug = (data.suggestedContainerType as string) || "40HQ";
      setConvertForm({ containerNo: "", containerType: sug });
      setConvertOpen(true);
      setSelectedBatchIds([]);
      fetchBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setPreRecordSubmitting(false);
    }
  };

  const submitConvert = async () => {
    if (!convertPreRecordId || !convertForm.containerNo.trim()) {
      toast.error("请填写柜号");
      return;
    }
    setConverting(true);
    try {
      const res = await fetch(`/api/container-pre-records/${convertPreRecordId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerNo: convertForm.containerNo.trim(),
          containerType: convertForm.containerType,
          outboundBatchIds: convertOutboundBatchIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "转柜失败");
      toast.success(`已生成正式柜：${data.containerNo ?? convertForm.containerNo}`);
      setConvertOpen(false);
      setConvertPreRecordId(null);
      setConvertOutboundBatchIds([]);
      fetchBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "转柜失败");
    } finally {
      setConverting(false);
    }
  };

  const submitDirectContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (directModalBatches.length === 0) return;
    if (!directContainerForm.containerNo.trim()) {
      toast.error("请填写柜号");
      return;
    }
    setDirectSubmitting(true);
    try {
      const skuOverrides = directSkuItems.map((item) => ({
        variantId: item.variantId ?? null,
        sku: item.sku,
        qty: item.qtyPerBox > 0 && item.boxCount > 0 ? item.qtyPerBox * item.boxCount : item.qty,
        unitVolumeCBM:
          item.qtyPerBox > 0 && item.boxVolumeCBM > 0
            ? item.boxVolumeCBM / item.qtyPerBox
            : 0,
        unitWeightKG:
          item.qtyPerBox > 0 && item.boxWeightKG > 0
            ? item.boxWeightKG / item.qtyPerBox
            : 0,
      }));
      const res = await fetch("/api/outbound-batch/direct-container", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchIds: directModalBatches.map((b) => b.id),
          containerNo: directContainerForm.containerNo.trim(),
          containerType: directContainerForm.containerType,
          shippingMethod: directContainerForm.shippingMethod,
          shipCompany: directContainerForm.shipCompany.trim() || null,
          originPort: directContainerForm.originPort.trim() || null,
          destinationPort: directContainerForm.destinationPort.trim() || null,
          destinationCountry: directContainerForm.destinationCountry.trim() || null,
          etd: directContainerForm.etd || null,
          eta: directContainerForm.eta || null,
          skuOverrides,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "生成柜子失败");
      toast.success(`已生成柜子：${data.containerNo}`);
      setDirectModalBatches([]);
      setDirectSkuItems([]);
      setSelectedBatchIds([]);
      fetchBatches();
      fetchContainers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成柜子失败");
    } finally {
      setDirectSubmitting(false);
    }
  };

  const updateDirectSkuItem = (key: string, patch: Partial<DirectSkuItem>) => {
    setDirectSkuItems((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        return { ...row, ...patch };
      })
    );
  };

  const selectDirectSkuBoxSpec = (key: string, boxSpecId: string) => {
    setDirectSkuItems((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const selected = row.boxSpecOptions.find((opt) => opt.id === boxSpecId);
        if (!selected) return row;
        return {
          ...row,
          selectedBoxSpecId: selected.id,
          qtyPerBox: selected.qtyPerBox,
          boxVolumeCBM: selected.boxVolumeCBM,
          boxWeightKG: selected.boxWeightKG,
          boxCount: selected.qtyPerBox > 0 ? Math.ceil((row.qty || 0) / selected.qtyPerBox) : row.boxCount,
        };
      })
    );
  };

  const directTotalVolume = directSkuItems.reduce(
    (sum, row) => sum + (row.boxVolumeCBM || 0) * (row.boxCount || 0),
    0
  );
  const directTotalWeight = directSkuItems.reduce(
    (sum, row) => sum + (row.boxWeightKG || 0) * (row.boxCount || 0),
    0
  );

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      待发货: "bg-slate-500/20 text-slate-300",
      已发货: "bg-blue-500/20 text-blue-300",
      运输中: "bg-amber-500/20 text-amber-300",
      已清关: "bg-purple-500/20 text-purple-300",
      已到达: "bg-emerald-500/20 text-emerald-300",
    };
    return map[s] ?? "bg-slate-500/20 text-slate-300";
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="出库管理（批次）"
          description="展开行可查看 SKU 明细、体积重量估算；可生成柜子预录单并一键转正式柜。"
        />
        <ActionButton icon={Plus} onClick={openCreateModal}>
          新建出库单
        </ActionButton>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={keyword}
          onChange={setKeyword}
          placeholder="搜索批次号、出库单号、目的地、仓库..."
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300"
        >
          <option value="all">全部状态</option>
          <option value="待发货">待发货</option>
          <option value="已发货">已发货</option>
          <option value="运输中">运输中</option>
          <option value="已清关">已清关</option>
          <option value="已到达">已到达</option>
        </select>
        <ActionButton
          size="sm"
          variant="secondary"
          icon={ContainerIcon}
          onClick={openMergePreRecordModal}
          disabled={selectedBatchIds.length < 2}
        >
          拼柜预录单（已选 {selectedBatchIds.length}）
        </ActionButton>
        <ActionButton
          size="sm"
          icon={ContainerIcon}
          onClick={openMergeDirectContainerModal}
          disabled={selectedBatchIds.length < 1}
        >
          直接生成柜子（已选 {selectedBatchIds.length}）
        </ActionButton>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无出库批次"
          description="暂无符合条件的出库批次"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const expanded = expandedBatchId === b.id;
            const isSelected = selectedBatchIds.includes(b.id);
            const skuLines = b.skuLines ?? [];
            const boxQty =
              skuLines.length > 0
                ? skuLines.reduce((s, l) => s + (l.qty || 0), 0)
                : b.qty;
            const vol = b.totalVolumeCBM ?? 0;
            const kg = b.totalWeightKG ?? 0;
            return (
              <div
                key={b.id}
                className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden hover:bg-slate-800/40 transition-all"
              >
                {/* 面板摘要（对齐业务：批次 / 流水 / 箱数体积 / 重量 / 货站 / 装柜） */}
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-400 shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          setSelectedBatchIds((prev) =>
                            e.target.checked
                              ? [...new Set([...prev, b.id])]
                              : prev.filter((id) => id !== b.id)
                          );
                        }}
                        className="rounded border-slate-600 bg-slate-900 text-primary-500 focus:ring-primary-500"
                      />
                      拼柜
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedBatchId(expanded ? null : b.id)
                      }
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 text-left min-w-0 flex-1"
                    >
                      <span
                        className={`shrink-0 px-2 py-1 rounded text-xs ${statusColor(b.status)}`}
                      >
                        {BATCH_STATUS_LABELS[b.status] ?? b.status}
                      </span>
                      <span className="text-sm text-slate-400">批次</span>
                      <span className="text-sm font-medium text-slate-200">
                        {b.batchNumber}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-sm text-slate-400">流水号</span>
                      <span className="text-sm text-slate-300">
                        {b.outboundOrder?.outboundNumber ?? "-"}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-sm text-slate-400">已装柜</span>
                      <span className="text-sm text-slate-200">
                        {b.container?.containerNo ?? "—"}
                      </span>
                      <span className="hidden sm:inline text-slate-600">|</span>
                      <span className="text-sm text-slate-400">件数/体积</span>
                      <span className="text-sm text-slate-200">
                        {boxQty} 件 / {vol.toFixed(2)} m³
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-sm text-slate-400">总重量</span>
                      <span className="text-sm text-slate-200">
                        {kg.toFixed(2)} kg
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-sm text-slate-400">货站</span>
                      <span className="text-sm text-slate-300 truncate max-w-[220px]">
                        {b.warehouseName ?? "-"}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-sm text-slate-500">
                        {formatDateTime(b.shippedDate)}
                      </span>
                      <span className="ml-1 text-slate-500 inline-flex items-center gap-0.5">
                        {expanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {(b.status === "运输中" || b.status === "已清关") && (
                        <ActionButton
                          variant="ghost"
                          size="sm"
                          icon={CheckCircle}
                          onClick={() => openConfirmModal(b)}
                        >
                          确认到货
                        </ActionButton>
                      )}
                      <select
                        value={b.containerId || ""}
                        onChange={async (e) => {
                          const containerId = e.target.value || null;
                          try {
                            const res = await fetch(
                              `/api/outbound-batch/${b.id}/set-container`,
                              {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ containerId }),
                              }
                            );
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              throw new Error(data?.error ?? "更新失败");
                            }
                            toast.success("柜子绑定已更新");
                            fetchBatches();
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : "更新失败"
                            );
                          }
                        }}
                        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                      >
                        <option value="">
                          {b.containerId ? "取消绑定柜子" : "未装柜"}
                        </option>
                        {containers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.containerNo}
                          </option>
                        ))}
                      </select>
                      <ActionButton
                        variant="secondary"
                        size="sm"
                        icon={ContainerIcon}
                        onClick={() => openPreRecordModal([b])}
                      >
                        柜子预录单
                      </ActionButton>
                      <ActionButton
                        size="sm"
                        icon={ContainerIcon}
                        onClick={() => openDirectContainerModal([b])}
                      >
                        直接装柜
                      </ActionButton>
                      <Link href={`/outbound/${b.id}`}>
                        <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
                          详情 / 编辑
                        </ActionButton>
                      </Link>
                    </div>
                  </div>
                  {/* 次要信息行 */}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>
                      目的地：{b.destination ?? "-"} ·{" "}
                      {[b.destinationCountry, b.destinationPlatform]
                        .filter(Boolean)
                        .join(" / ") || "-"}
                    </span>
                    <span>
                      店铺/归属：{" "}
                      {[b.destinationStoreName, b.ownerName]
                        .filter(Boolean)
                        .join(" / ") || "-"}
                    </span>
                    {b.sourceBatchNumber ? (
                      <span>来源批次：{b.sourceBatchNumber}</span>
                    ) : null}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-800 bg-slate-950/50 px-4 py-4 space-y-4">
                    {b.skuLinesEstimated && b.skuLinesNote && (
                      <p className="text-amber-400/90 text-xs leading-relaxed">
                        {b.skuLinesNote}
                      </p>
                    )}
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 mb-2">
                        SKU 明细（本批次）
                      </h4>
                      {skuLines.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          暂无 SKU 行，请确认出库单是否含明细或已维护产品尺寸重量。
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-slate-800">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-900/80 text-slate-400 text-xs">
                              <tr>
                                <th className="px-3 py-2">SKU</th>
                                <th className="px-3 py-2">名称</th>
                                <th className="px-3 py-2 text-right">件数</th>
                                <th className="px-3 py-2 text-right">单件体积 m³</th>
                                <th className="px-3 py-2 text-right">单件 kg</th>
                                <th className="px-3 py-2 text-right">行体积 m³</th>
                                <th className="px-3 py-2 text-right">行重量 kg</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              {skuLines.map((line, idx) => (
                                <tr key={line.id ?? idx} className="text-slate-300">
                                  <td className="px-3 py-2 font-mono text-xs">
                                    {line.sku}
                                  </td>
                                  <td className="px-3 py-2 text-slate-400">
                                    {line.skuName || "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {line.qty}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                                    {line.unitVolumeCBM.toFixed(4)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                                    {line.unitWeightKG.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {line.lineVolumeCBM.toFixed(3)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {line.lineWeightKG.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        size="sm"
                        icon={ContainerIcon}
                        onClick={() => openPreRecordModal([b])}
                      >
                        生成预录单（填起运/目的港等）
                      </ActionButton>
                      <ActionButton
                        size="sm"
                        icon={ContainerIcon}
                        onClick={() => openDirectContainerModal([b])}
                      >
                        直接生成柜子
                      </ActionButton>
                      <Link
                        href="/logistics/pre-records"
                        className="inline-flex items-center text-xs text-primary-400 hover:text-primary-300"
                      >
                        查看全部预录单 →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 直接生成柜子 */}
      {directModalBatches.length > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-200">
                直接生成柜子 · {directModalBatches.length > 1 ? `拼柜（${directModalBatches.length}个批次）` : directModalBatches[0].batchNumber}
              </h2>
              <button
                type="button"
                onClick={() => setDirectModalBatches([])}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitDirectContainer} className="p-4 space-y-3">
              <p className="text-xs text-slate-500">
                创建后会直接生成正式柜子，并自动绑定当前所选出库批次。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">柜号 *</label>
                  <input
                    value={directContainerForm.containerNo}
                    onChange={(e) => setDirectContainerForm((f) => ({ ...f, containerNo: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                    placeholder="如 MSKU1234567"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">柜型 *</label>
                  <select
                    value={directContainerForm.containerType}
                    onChange={(e) => setDirectContainerForm((f) => ({ ...f, containerType: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  >
                    <option value="20GP">20GP</option>
                    <option value="40GP">40GP</option>
                    <option value="40HQ">40HQ</option>
                    <option value="LCL">LCL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">运输方式 *</label>
                  <select
                    value={directContainerForm.shippingMethod}
                    onChange={(e) => setDirectContainerForm((f) => ({ ...f, shippingMethod: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  >
                    <option value="SEA">海运 SEA</option>
                    <option value="AIR">空运 AIR</option>
                    <option value="EXPRESS">快递 EXPRESS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">物流公司</label>
                  <input
                    value={directContainerForm.shipCompany}
                    onChange={(e) => setDirectContainerForm((f) => ({ ...f, shipCompany: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">起运港</label>
                  <input
                    value={directContainerForm.originPort}
                    onChange={(e) => setDirectContainerForm((f) => ({ ...f, originPort: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">目的港</label>
                  <input
                    value={directContainerForm.destinationPort}
                    onChange={(e) => setDirectContainerForm((f) => ({ ...f, destinationPort: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">目的国</label>
                  <input
                    value={directContainerForm.destinationCountry}
                    onChange={(e) => setDirectContainerForm((f) => ({ ...f, destinationCountry: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">ETD</label>
                  <input
                    type="date"
                    value={directContainerForm.etd}
                    onChange={(e) => setDirectContainerForm((f) => ({ ...f, etd: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">ETA</label>
                  <input
                    type="date"
                    value={directContainerForm.eta}
                    onChange={(e) => setDirectContainerForm((f) => ({ ...f, eta: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/70 text-slate-400">
                    <tr>
                      <th className="px-2 py-2 text-left">SKU</th>
                      <th className="px-2 py-2 text-left">箱规</th>
                      <th className="px-2 py-2 text-right">件数</th>
                      <th className="px-2 py-2 text-right">每箱件数</th>
                      <th className="px-2 py-2 text-right">箱规体积m³/箱</th>
                      <th className="px-2 py-2 text-right">箱规重量kg/箱</th>
                      <th className="px-2 py-2 text-right">箱数(手填)</th>
                      <th className="px-2 py-2 text-right">行体积m³</th>
                      <th className="px-2 py-2 text-right">行重量kg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {directSkuItems.map((row) => (
                      <tr key={row.key} className="text-slate-300">
                        <td className="px-2 py-2">
                          <div className="font-mono">{row.sku}</div>
                          <div className="text-[11px] text-slate-500">{row.skuName || "-"}</div>
                        </td>
                        <td className="px-2 py-2">
                          {row.boxSpecOptions.length > 0 ? (
                            <select
                              value={row.selectedBoxSpecId}
                              onChange={(e) => selectDirectSkuBoxSpec(row.key, e.target.value)}
                              className="w-44 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px]"
                            >
                              {row.boxSpecOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-500">无箱规</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.qty}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.qtyPerBox || "-"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {row.boxVolumeCBM > 0 ? row.boxVolumeCBM.toFixed(4) : "-"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {row.boxWeightKG > 0 ? row.boxWeightKG.toFixed(3) : "-"}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={row.boxCount || ""}
                            onChange={(e) =>
                              updateDirectSkuItem(row.key, {
                                boxCount: Number(e.target.value) || 0,
                              })
                            }
                            className="w-24 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-right"
                            placeholder="箱数"
                          />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {(row.boxVolumeCBM * row.boxCount).toFixed(3)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {(row.boxWeightKG * row.boxCount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-slate-300">
                汇总：总体积 <span className="font-semibold">{directTotalVolume.toFixed(3)}</span> m³，
                总重量 <span className="font-semibold">{directTotalWeight.toFixed(2)}</span> kg
              </div>
              <div className="flex gap-2 pt-2">
                <ActionButton type="submit" isLoading={directSubmitting}>
                  确认生成柜子
                </ActionButton>
                <ActionButton type="button" variant="secondary" onClick={() => setDirectModalBatches([])}>
                  取消
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 从批次生成预录单 */}
      {preRecordModalBatches.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-200">
                柜子预录单 · {preRecordModalBatches.length > 1 ? `拼柜（${preRecordModalBatches.length}个批次）` : preRecordModalBatches[0].batchNumber}
              </h2>
              <button
                type="button"
                onClick={() => setPreRecordModalBatches([])}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitPreRecord} className="p-4 space-y-3">
              <p className="text-xs text-slate-500">
                {preRecordModalBatches.length > 1
                  ? "将按已选择批次的 SKU 明细合并生成一张预录单；提交后可填写柜号一键转为正式柜子并自动绑定所选批次。"
                  : "将按当前批次 SKU 明细生成预录单；提交后可填写柜号一键转为正式柜子并自动绑定本批次。"}
              </p>
              <div>
                <label className="block text-xs text-slate-400 mb-1">预录单名称</label>
                <input
                  value={preRecordForm.name}
                  onChange={(e) =>
                    setPreRecordForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">运输方式</label>
                  <select
                    value={preRecordForm.shippingMethod}
                    onChange={(e) =>
                      setPreRecordForm((f) => ({
                        ...f,
                        shippingMethod: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  >
                    <option value="SEA">海运 SEA</option>
                    <option value="AIR">空运 AIR</option>
                    <option value="EXPRESS">快递 EXPRESS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">目的国</label>
                  <input
                    value={preRecordForm.destinationCountry}
                    onChange={(e) =>
                      setPreRecordForm((f) => ({
                        ...f,
                        destinationCountry: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                    placeholder="如 BR / US"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">起运港</label>
                  <input
                    value={preRecordForm.originPort}
                    onChange={(e) =>
                      setPreRecordForm((f) => ({
                        ...f,
                        originPort: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">目的港</label>
                  <input
                    value={preRecordForm.destinationPort}
                    onChange={(e) =>
                      setPreRecordForm((f) => ({
                        ...f,
                        destinationPort: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">发货人/抬头（可选）</label>
                <input
                  value={preRecordForm.exporterName}
                  onChange={(e) =>
                    setPreRecordForm((f) => ({
                      ...f,
                      exporterName: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">装柜地点</label>
                  <input
                    value={preRecordForm.loadingLocation}
                    onChange={(e) =>
                      setPreRecordForm((f) => ({ ...f, loadingLocation: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">装柜物流公司</label>
                  <input
                    value={preRecordForm.loadingLogisticsCompany}
                    onChange={(e) =>
                      setPreRecordForm((f) => ({ ...f, loadingLogisticsCompany: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">填表时间</label>
                  <input
                    type="datetime-local"
                    value={preRecordForm.formFilledAt}
                    onChange={(e) =>
                      setPreRecordForm((f) => ({ ...f, formFilledAt: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">装柜日期</label>
                  <input
                    type="date"
                    value={preRecordForm.loadingDate}
                    onChange={(e) =>
                      setPreRecordForm((f) => ({ ...f, loadingDate: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">备注</label>
                <textarea
                  value={preRecordForm.notes}
                  onChange={(e) =>
                    setPreRecordForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={2}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 text-sm"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <ActionButton type="submit" isLoading={preRecordSubmitting}>
                  生成预录单
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => setPreRecordModalBatches([])}
                >
                  取消
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 预录单转正式柜 */}
      {convertOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-200">
                一键转正式柜
              </h2>
              <button
                type="button"
                onClick={() => {
                  setConvertOpen(false);
                  setConvertPreRecordId(null);
                  setConvertOutboundBatchIds([]);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-slate-500">
                填写柜号与柜型后创建正式柜子，并自动将本出库批次绑定到该柜。
              </p>
              <div>
                <label className="block text-sm text-slate-400 mb-1">柜号 *</label>
                <input
                  value={convertForm.containerNo}
                  onChange={(e) =>
                    setConvertForm((f) => ({ ...f, containerNo: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                  placeholder="如 MSKU1234567"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">柜型</label>
                <select
                  value={convertForm.containerType}
                  onChange={(e) =>
                    setConvertForm((f) => ({
                      ...f,
                      containerType: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                >
                  <option value="20GP">20GP</option>
                  <option value="40GP">40GP</option>
                  <option value="40HQ">40HQ</option>
                  <option value="LCL">LCL</option>
                </select>
              </div>
              <div className="flex gap-2">
                <ActionButton onClick={submitConvert} isLoading={converting}>
                  确认转正式柜
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setConvertOpen(false);
                    setConvertPreRecordId(null);
                  }}
                >
                  稍后
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 新建出库单弹窗 */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-200">新建出库单</h2>
              <button
                type="button"
                onClick={closeCreateModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateOutbound} className="p-4 space-y-4">
              {/* SKU明细 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-400">SKU明细</label>
                  <button
                    type="button"
                    onClick={addSkuItem}
                    className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> 添加SKU
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {createItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 rounded-lg border border-slate-700 bg-slate-800/50">
                      <select
                        value={item.variantId}
                        onChange={(e) => {
                          const opt = skus.find((s) => s.variant_id === e.target.value);
                          updateSkuItem(index, 'variantId', e.target.value);
                          updateSkuItem(index, 'sku', opt?.sku_id || '');
                          updateSkuItem(index, 'skuName', opt?.name || '');
                        }}
                        className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
                        required
                      >
                        <option value="">选择SKU</option>
                        {skus.map((s) => (
                          <option key={s.variant_id} value={s.variant_id}>
                            {s.sku_id} {s.name ? `·${s.name}` : ""}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={item.qty || ''}
                        onChange={(e) => updateSkuItem(index, 'qty', Number(e.target.value) || 0)}
                        className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 text-right"
                        placeholder="数量"
                      />
                      {createItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSkuItem(index)}
                          className="p-1 text-slate-400 hover:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  合计: {createItems.reduce((sum, item) => sum + (item.qty || 0), 0)} 件
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">仓库</label>
                <select
                  value={createForm.warehouseId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, warehouseId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                  required
                >
                  <option value="">请选择仓库</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.type === "DOMESTIC" ? " (国内仓)" : w.type === "OVERSEAS" ? " (海外仓)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">目的地</label>
                <input
                  type="text"
                  value={createForm.destination}
                  onChange={(e) => setCreateForm((f) => ({ ...f, destination: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
                  placeholder="如：巴西圣保罗、某仓库（选填）"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={createForm.destinationCountry}
                  onChange={(e) => setCreateForm((f) => ({ ...f, destinationCountry: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
                  placeholder="目的国家（如 BR）"
                />
                <input
                  type="text"
                  value={createForm.destinationPlatform}
                  onChange={(e) => setCreateForm((f) => ({ ...f, destinationPlatform: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
                  placeholder="目的平台（如 TikTok）"
                />
                <input
                  type="text"
                  value={createForm.destinationStoreId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, destinationStoreId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
                  placeholder="店铺ID"
                />
                <input
                  type="text"
                  value={createForm.destinationStoreName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, destinationStoreName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
                  placeholder="店铺名称"
                />
                <input
                  type="text"
                  value={createForm.ownerType}
                  onChange={(e) => setCreateForm((f) => ({ ...f, ownerType: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
                  placeholder="货权主体类型（STORE/TEAM）"
                />
                <input
                  type="text"
                  value={createForm.ownerId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, ownerId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
                  placeholder="货权主体ID"
                />
                <input
                  type="text"
                  value={createForm.ownerName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, ownerName: e.target.value }))}
                  className="md:col-span-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
                  placeholder="货权主体名称"
                />
              </div>
              {/* 海外入库预报选项 */}
              <div className="border-t border-slate-700 pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForecast}
                    onChange={(e) => {
                      setCreateForecast(e.target.checked);
                      if (!e.target.checked) setForecastWarehouseId("");
                    }}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-300">同时创建海外入库预报</span>
                </label>
                {createForecast && (
                  <div className="mt-3 pl-6">
                    <label className="block text-sm font-medium text-slate-400 mb-1">预报目标仓库（海外仓）</label>
                    <select
                      value={forecastWarehouseId}
                      onChange={(e) => setForecastWarehouseId(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                      required={createForecast}
                    >
                      <option value="">请选择海外仓</option>
                      {warehouses.filter(w => w.type === "OVERSEAS").map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      出库后，货物将自动生成海外入库预报记录
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <ActionButton type="submit" isLoading={creating}>
                  创建出库单
                </ActionButton>
                <ActionButton type="button" variant="secondary" onClick={closeCreateModal}>
                  取消
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 确认到货弹窗 */}
      {confirmBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-200">确认到货</h2>
              <button
                type="button"
                onClick={closeConfirmModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 text-sm text-slate-400 border-b border-slate-700">
              批次：{confirmBatch.batchNumber} · 数量：{confirmBatch.qty} 件
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">目的地仓库（海外仓）</label>
                <select
                  value={toWarehouseId}
                  onChange={(e) => setToWarehouseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                >
                  <option value="">请选择</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.type === "OVERSEAS" ? " (海外仓)" : w.type === "DOMESTIC" ? " (国内仓)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <ActionButton onClick={handleConfirmArrival} isLoading={confirming} disabled={!toWarehouseId}>
                  确认到货
                </ActionButton>
                <ActionButton type="button" variant="secondary" onClick={closeConfirmModal}>
                  取消
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            上一页
          </button>
          <span className="py-1.5 text-sm text-slate-400">
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
