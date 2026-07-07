"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";
import { Download, LayoutGrid, Plus, RefreshCw, Table2 } from "lucide-react";
import { PageHeader, ActionButton } from "@/components/ui";
import type { Container } from "@/logistics/types";
import Link from "next/link";
import { getCountriesByRegion, getCountryByCode } from "@/lib/country-config";
import { ContainerStats } from "./components/ContainerStats";
import { ContainerFilters } from "./components/ContainerFilters";
import { ContainersTable } from "./components/ContainersTable";
import { ContainerCardsView } from "./components/ContainerCardsView";
import { LogisticsProgressAxis } from "./components/LogisticsProgressAxis";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const statusLabels: Record<string, string> = {
  PLANNED: "已计划",
  LOADING: "装柜中",
  IN_TRANSIT: "在途",
  ARRIVED_PORT: "已到港",
  CUSTOMS_CLEAR: "清关完成",
  IN_WAREHOUSE: "已入仓",
  CLOSED: "已完结",
};

const methodLabels: Record<string, string> = {
  SEA: "海运",
  AIR: "空运",
  EXPRESS: "快递",
};

function getProgress(status: string): number {
  switch (status) {
    case "PLANNED":
      return 5;
    case "LOADING":
      return 20;
    case "IN_TRANSIT":
      return 50;
    case "ARRIVED_PORT":
      return 70;
    case "CUSTOMS_CLEAR":
      return 85;
    case "IN_WAREHOUSE":
    case "CLOSED":
      return 100;
    default:
      return 0;
  }
}

function getProgressBarColor(status: string): string {
  switch (status) {
    case "LOADING":
      return "bg-orange-400";
    case "IN_TRANSIT":
      return "bg-cyan-400";
    case "ARRIVED_PORT":
      return "bg-blue-400";
    case "CUSTOMS_CLEAR":
      return "bg-violet-400";
    case "IN_WAREHOUSE":
    case "CLOSED":
      return "bg-emerald-400";
    default:
      return "bg-slate-400";
  }
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("zh-CN");
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN");
}

function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatNumber(value?: string | null, digits = 2): string {
  if (!value) return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

// 计算航行进度信息
function getVoyageInfo(container: Container) {
  const now = new Date();
  const etd = container.etd ? new Date(container.etd) : null;
  const eta = container.eta ? new Date(container.eta) : null;
  
  if (!etd || !eta) return null;
  
  // 已航行天数
  const daysPassed = Math.max(0, Math.floor((now.getTime() - etd.getTime()) / (1000 * 60 * 60 * 24)));
  // 预计总航行天数
  const totalDays = Math.max(1, Math.floor((eta.getTime() - etd.getTime()) / (1000 * 60 * 60 * 24)));
  // 剩余天数（负数表示已超期）
  const daysLeftRaw = Math.floor((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, daysLeftRaw);
  const overdueDays = Math.max(0, -daysLeftRaw);
  // 进度百分比
  const progress = Math.min(100, Math.max(0, Math.floor((daysPassed / totalDays) * 100)));
  
  return {
    daysPassed,
    totalDays,
    daysLeft,
    overdueDays,
    progress,
    eta: eta.toLocaleDateString("zh-CN"),
    isOverdue: now > eta,
  };
}

// 柜子表单类型
type ContainerForm = {
  // 基本信息
  containerNo: string;
  containerType: string;
  sealNo: string;
  shippingMethod: string;
  // 船运信息
  shipCompany: string;
  vesselName: string;
  voyageNo: string;
  // 港口信息
  originPort: string;
  destinationPort: string;
  destinationCountry: string;
  // 日期
  loadingDate: string;
  etd: string;
  eta: string;
  actualDeparture: string;
  actualArrival: string;
  customsClearanceAt: string;
  warehouseInboundAt: string;
  // 状态
  status: string;
  // 物流模式
  exportMode: string;
  serviceMode: string;
  // 主体
  exporterId: string;
  exporterName: string;
  overseasCompanyId: string;
  overseasCompanyName: string;
  // 申报
  declaredValue: string;
  declaredCurrency: string;
  // 关税
  dutyAmount: string;
  dutyPayer: string;
  dutyCurrency: string;
  dutyPaidAmount: string;
  // 回款
  returnAmount: string;
  returnDate: string;
  returnCurrency: string;
  // 仓库
  warehouseId: string;
  warehouseName: string;
  // 销售
  platform: string;
  storeId: string;
  storeName: string;
  // 汇总
  totalVolumeCBM: string;
  totalWeightKG: string;
};

type LogisticsChannelItem = {
  id: string;
  name: string;
  channelCode?: string;
};

const emptyForm: ContainerForm = {
  containerNo: "",
  containerType: "40HQ",
  sealNo: "",
  shippingMethod: "SEA",
  shipCompany: "",
  vesselName: "",
  voyageNo: "",
  originPort: "",
  destinationPort: "",
  destinationCountry: "",
  loadingDate: "",
  etd: "",
  eta: "",
  actualDeparture: "",
  actualArrival: "",
  customsClearanceAt: "",
  warehouseInboundAt: "",
  status: "PLANNED",
  exportMode: "",
  serviceMode: "",
  exporterId: "",
  exporterName: "",
  overseasCompanyId: "",
  overseasCompanyName: "",
  declaredValue: "",
  declaredCurrency: "USD",
  dutyAmount: "",
  dutyPayer: "",
  dutyCurrency: "USD",
  dutyPaidAmount: "",
  returnAmount: "",
  returnDate: "",
  returnCurrency: "USD",
  warehouseId: "",
  warehouseName: "",
  platform: "",
  storeId: "",
  storeName: "",
  totalVolumeCBM: "",
  totalWeightKG: "",
};

export default function ContainersPage() {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ContainerForm>(emptyForm);
  const [detailContainer, setDetailContainer] = useState<Container | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<ContainerForm>(emptyForm);
  const [statusConfirm, setStatusConfirm] = useState<{
    container: Container;
    toStatus: string;
  } | null>(null);
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [billForm, setBillForm] = useState<{ costType: string; amount: string; currency: string; paymentType: string; creditDays: string; logisticsChannelId: string; outboundBatchIds: string[]; notes: string; voucher: string | string[] }>({ costType: "海运费", amount: "", currency: "CNY", paymentType: "现结", creditDays: "", logisticsChannelId: "", outboundBatchIds: [], notes: "", voucher: "" });
  const [billSaving, setBillSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const statusOptions = [
    { value: "PLANNED", label: "已计划" },
    { value: "LOADING", label: "装柜中" },
    { value: "IN_TRANSIT", label: "在途" },
    { value: "ARRIVED_PORT", label: "已到港" },
    { value: "CUSTOMS_CLEAR", label: "清关完成" },
    { value: "IN_WAREHOUSE", label: "已入仓" },
    { value: "CLOSED", label: "已完结" },
  ];

  // 获取柜子列表
  const { data, isLoading, mutate } = useSWR("/api/containers?page=1&pageSize=200", fetcher);
  const containers: Container[] = Array.isArray(data?.data) ? data.data : [];

  // 获取出口公司列表
  const { data: exportersData } = useSWR<{ data: any[] }>("/api/exporters?pageSize=100", fetcher);
  const exporters = exportersData?.data || [];
  
  // 获取海外公司列表
  const { data: overseasCompaniesData } = useSWR<{ data: any[] }>("/api/overseas-companies?pageSize=100", fetcher);
  const overseasCompanies = overseasCompaniesData?.data || [];
  
  // 获取仓库列表
  const { data: warehousesData } = useSWR<{ data: any[] }>("/api/warehouses?pageSize=100", fetcher);
  const warehouses = warehousesData?.data || [];
  
  // 获取店铺列表
  const { data: storesData } = useSWR<{ data: any[] }>("/api/stores?pageSize=100", fetcher);
  const stores = storesData?.data || [];

  // 获取系统国家维度（店铺国家 + 标准国家配置）
  const { data: countriesData } = useSWR<{ data: Array<{ value: string; label: string }> }>(
    "/api/countries",
    fetcher
  );
  const destinationCountries = Array.isArray(countriesData?.data) ? countriesData!.data : [];
  const countryOptionsByRegion = useMemo(() => {
    const grouped = getCountriesByRegion();
    const knownCodes = new Set<string>();
    Object.values(grouped).forEach((arr) => {
      arr.forEach((c) => knownCodes.add(String(c.code).toUpperCase()));
    });
    const extras = destinationCountries
      .filter((c) => c.value && !knownCodes.has(String(c.value).toUpperCase()))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
    return { grouped, extras };
  }, [destinationCountries]);
  const { data: logisticsChannelsData } = useSWR<{ data: LogisticsChannelItem[] }>(
    "/api/logistics-channels?page=1&pageSize=500",
    fetcher
  );
  const logisticsChannels = Array.isArray(logisticsChannelsData?.data) ? logisticsChannelsData!.data : [];

  const stats = useMemo(() => {
    const total = containers.length;
    const byStatus: Record<string, number> = {};
    containers.forEach((c) => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    });
    return { total, byStatus };
  }, [containers]);

  const filtered = useMemo(() => {
    let result = [...containers];
    if (filterStatus !== "all") {
      result = result.filter((c) => c.status === filterStatus);
    }
    if (filterMethod !== "all") {
      result = result.filter((c) => c.shippingMethod === filterMethod);
    }
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      result = result.filter(
        (c) =>
          c.containerNo.toLowerCase().includes(kw) ||
          (c.vesselName ?? "").toLowerCase().includes(kw) ||
          (c.voyageNo ?? "").toLowerCase().includes(kw)
      );
    }
    return result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [containers, filterStatus, filterMethod, searchKeyword]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const no = createForm.containerNo.trim();
    if (!no) {
      toast.error("请填写柜号");
      return;
    }
    if (!["SEA", "AIR", "EXPRESS"].includes(createForm.shippingMethod)) {
      toast.error("运输方式仅支持 SEA / AIR / EXPRESS");
      return;
    }
    
    // 获取选中的出口公司名称
    const selectedExporter = exporters.find(e => e.id === createForm.exporterId);
    const selectedOverseasCompany = overseasCompanies.find(c => c.id === createForm.overseasCompanyId);
    const selectedWarehouse = warehouses.find(w => w.id === createForm.warehouseId);
    const selectedStore = stores.find(s => s.id === createForm.storeId);
    
    try {
      const res = await fetch("/api/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerNo: no,
          containerType: createForm.containerType.trim() || "40HQ",
          shippingMethod: createForm.shippingMethod,
          sealNo: createForm.sealNo || null,
          shipCompany: createForm.shipCompany || null,
          vesselName: createForm.vesselName || null,
          voyageNo: createForm.voyageNo || null,
          originPort: createForm.originPort || null,
          destinationPort: createForm.destinationPort || null,
          destinationCountry: createForm.destinationCountry || null,
          loadingDate: createForm.loadingDate || null,
          etd: createForm.etd || null,
          eta: createForm.eta || null,
          actualDeparture: createForm.actualDeparture || null,
          actualArrival: createForm.actualArrival || null,
          customsClearanceAt: createForm.customsClearanceAt || null,
          warehouseInboundAt: createForm.warehouseInboundAt || null,
          status: createForm.status,
          exportMode: createForm.exportMode || null,
          serviceMode: createForm.serviceMode || null,
          exporterId: createForm.exporterId || null,
          exporterName: selectedExporter?.name || null,
          overseasCompanyId: createForm.overseasCompanyId || null,
          overseasCompanyName: selectedOverseasCompany?.name || null,
          declaredValue: createForm.declaredValue || null,
          declaredCurrency: createForm.declaredCurrency || null,
          dutyAmount: createForm.dutyAmount || null,
          dutyPayer: createForm.dutyPayer || null,
          dutyCurrency: createForm.dutyCurrency || null,
          dutyPaidAmount: createForm.dutyPaidAmount || null,
          returnAmount: createForm.returnAmount || null,
          returnDate: createForm.returnDate || null,
          returnCurrency: createForm.returnCurrency || null,
          warehouseId: createForm.warehouseId || null,
          warehouseName: selectedWarehouse?.name || null,
          platform: createForm.platform || null,
          storeId: createForm.storeId || null,
          storeName: selectedStore?.name || null,
          totalVolumeCBM: createForm.totalVolumeCBM || null,
          totalWeightKG: createForm.totalWeightKG || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "创建柜子失败");
        return;
      }
      toast.success("柜子已创建");
      setIsCreateOpen(false);
      setCreateForm(emptyForm);
      mutate();
    } catch (e) {
      console.error(e);
      toast.error("创建失败，请稍后重试");
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error("没有可导出的柜子数据");
      return;
    }
    const headers = [
      "柜号",
      "柜型",
      "状态",
      "运输方式",
      "船公司",
      "船名",
      "航次",
      "起运港",
      "目的港",
      "ETD",
      "ETA",
      "到港时间",
      "清关时间",
      "入仓时间",
      "体积CBM",
      "重量KG",
      "批次数",
      "创建时间",
    ];
    const rows = filtered.map((c) => [
      c.containerNo,
      c.containerType,
      statusLabels[c.status] ?? c.status,
      methodLabels[c.shippingMethod] ?? c.shippingMethod,
      c.shipCompany || "",
      c.vesselName || "",
      c.voyageNo || "",
      c.originPort || "",
      c.destinationPort || "",
      formatDate(c.etd),
      formatDate(c.eta),
      formatDateTime(c.actualArrival),
      formatDateTime(c.customsClearanceAt),
      formatDateTime(c.warehouseInboundAt),
      formatNumber(c.totalVolumeCBM),
      formatNumber(c.totalWeightKG),
      String(c.outboundBatchCount ?? 0),
      formatDate(c.createdAt),
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `柜子管理_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${filtered.length} 条柜子数据`);
  };

  const submitBill = async () => {
    if (!detailContainer) return;
    const amount = parseFloat(billForm.amount);
    if (!amount || amount <= 0) { toast.error("请输入有效金额"); return; }
    if (billForm.outboundBatchIds.length === 0) { toast.error("请至少选择一个出库批次"); return; }
    setBillSaving(true);
    try {
      const dueDate = billForm.paymentType === "账期" && billForm.creditDays && detailContainer.actualDeparture
        ? new Date(new Date(detailContainer.actualDeparture).getTime() + parseInt(billForm.creditDays) * 86400000).toISOString().slice(0, 10)
        : null;
      const res = await fetch("/api/logistics-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundBatchIds: billForm.outboundBatchIds,
          containerId: detailContainer.id,
          logisticsChannelId: billForm.logisticsChannelId || null,
          costType: billForm.costType,
          amount,
          currency: billForm.currency,
          paymentType: billForm.paymentType,
          creditDays: billForm.paymentType === "账期" ? parseInt(billForm.creditDays) || null : null,
          dueDate,
          paymentStatus: "未付",
          notes: billForm.notes || null,
          voucher: billForm.voucher ? (Array.isArray(billForm.voucher) ? JSON.stringify(billForm.voucher) : billForm.voucher) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "创建失败");
      toast.success(`物流账单已生成${data.created > 1 ? `（${data.created}条）` : ""}，可在物流费用管理中查看`);
      setBillModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "创建物流账单失败");
    } finally {
      setBillSaving(false);
    }
  };

  const handleChangeStatus = async (container: Container, status: string) => {
    if (status === container.status) return;
    setStatusConfirm({ container, toStatus: status });
  };

  const submitChangeStatus = async () => {
    if (!statusConfirm) return;
    const { container, toStatus } = statusConfirm;
    try {
      // 如果变为"已入仓"且选了仓库，同时确认到货
      if (toStatus === "IN_WAREHOUSE" && toWarehouseId) {
        // 先更新容器状态
        const res1 = await fetch(`/api/containers/${container.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: toStatus }),
        });
        if (!res1.ok) {
          const j = await res1.json().catch(() => ({}));
          toast.error(j?.error || "状态更新失败");
          return;
        }
        // 获取该容器的出库批次并确认到达
        const resBatches = await fetch(`/api/outbound-batch?containerId=${container.id}&pageSize=200`);
        const batchData = await resBatches.json().catch(() => ({ data: [] }));
        const batches = batchData.data || [];
        let failCount = 0;
        for (const b of batches) {
          if (!b.arrivalConfirmedAt) {
            const r = await fetch(`/api/outbound-batch/${b.id}/confirm-arrival`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ toWarehouseId }),
            });
            if (!r.ok) failCount++;
          }
        }
        if (failCount === 0) {
          toast.success("已确认到货，海外仓库存已增加");
        } else {
          toast.warning(`${failCount}个批次确认失败，请重试`);
        }
      } else {
        const res = await fetch(`/api/containers/${container.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: toStatus }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(json?.error || "状态更新失败");
          return;
        }
        toast.success(`状态已更新为：${statusLabels[toStatus] ?? toStatus}`);
      }
      mutate();
      setStatusConfirm(null);
      setToWarehouseId("");
    } catch (error) {
      console.error(error);
      toast.error("操作失败");
    }
  };

  const openEditModal = () => {
    if (!detailContainer) return;
    setEditForm({
      containerNo: detailContainer.containerNo || "",
      containerType: detailContainer.containerType || "40HQ",
      sealNo: detailContainer.sealNo || "",
      shippingMethod: detailContainer.shippingMethod || "SEA",
      shipCompany: detailContainer.shipCompany || "",
      vesselName: detailContainer.vesselName || "",
      voyageNo: detailContainer.voyageNo || "",
      originPort: detailContainer.originPort || "",
      destinationPort: detailContainer.destinationPort || "",
      destinationCountry: detailContainer.destinationCountry || "",
      loadingDate: toDateInputValue(detailContainer.loadingDate),
      etd: toDateInputValue(detailContainer.etd),
      eta: toDateInputValue(detailContainer.eta),
      actualDeparture: toDateInputValue(detailContainer.actualDeparture),
      actualArrival: toDateInputValue(detailContainer.actualArrival),
      customsClearanceAt: toDateInputValue(detailContainer.customsClearanceAt),
      warehouseInboundAt: toDateInputValue(detailContainer.warehouseInboundAt),
      status: detailContainer.status || "PLANNED",
      exportMode: detailContainer.exportMode || "",
      serviceMode: detailContainer.serviceMode || "",
      exporterId: detailContainer.exporterId || "",
      exporterName: detailContainer.exporterName || "",
      overseasCompanyId: detailContainer.overseasCompanyId || "",
      overseasCompanyName: detailContainer.overseasCompanyName || "",
      declaredValue: detailContainer.declaredValue || "",
      declaredCurrency: detailContainer.declaredCurrency || "USD",
      dutyAmount: detailContainer.dutyAmount || "",
      dutyPayer: detailContainer.dutyPayer || "",
      dutyCurrency: detailContainer.dutyCurrency || "USD",
      dutyPaidAmount: detailContainer.dutyPaidAmount || "",
      returnAmount: detailContainer.returnAmount || "",
      returnDate: toDateInputValue(detailContainer.returnDate),
      returnCurrency: detailContainer.returnCurrency || "USD",
      warehouseId: detailContainer.warehouseId || "",
      warehouseName: detailContainer.warehouseName || "",
      platform: detailContainer.platform || "",
      storeId: detailContainer.storeId || "",
      storeName: detailContainer.storeName || "",
      totalVolumeCBM: detailContainer.totalVolumeCBM || "",
      totalWeightKG: detailContainer.totalWeightKG || "",
    });
    setIsEditOpen(true);
  };

  const submitEditContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailContainer?.id) return;
    setEditSaving(true);
    try {
      const selectedExporter = exporters.find((x) => x.id === editForm.exporterId);
      const selectedOverseasCompany = overseasCompanies.find((x) => x.id === editForm.overseasCompanyId);
      const selectedWarehouse = warehouses.find((x) => x.id === editForm.warehouseId);
      const selectedStore = stores.find((x) => x.id === editForm.storeId);
      const res = await fetch(`/api/containers/${detailContainer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerNo: editForm.containerNo || null,
          containerType: editForm.containerType || null,
          sealNo: editForm.sealNo || null,
          shippingMethod: editForm.shippingMethod || null,
          shipCompany: editForm.shipCompany || null,
          vesselName: editForm.vesselName || null,
          voyageNo: editForm.voyageNo || null,
          originPort: editForm.originPort || null,
          destinationPort: editForm.destinationPort || null,
          destinationCountry: editForm.destinationCountry || null,
          loadingDate: editForm.loadingDate || null,
          etd: editForm.etd || null,
          eta: editForm.eta || null,
          actualDeparture: editForm.actualDeparture || null,
          actualArrival: editForm.actualArrival || null,
          customsClearanceAt: editForm.customsClearanceAt || null,
          warehouseInboundAt: editForm.warehouseInboundAt || null,
          status: editForm.status || null,
          exportMode: editForm.exportMode || null,
          serviceMode: editForm.serviceMode || null,
          exporterId: editForm.exporterId || null,
          exporterName: selectedExporter?.name || null,
          overseasCompanyId: editForm.overseasCompanyId || null,
          overseasCompanyName: selectedOverseasCompany?.name || null,
          declaredValue: editForm.declaredValue || null,
          declaredCurrency: editForm.declaredCurrency || null,
          dutyAmount: editForm.dutyAmount || null,
          dutyPayer: editForm.dutyPayer || null,
          dutyCurrency: editForm.dutyCurrency || null,
          dutyPaidAmount: editForm.dutyPaidAmount || null,
          returnAmount: editForm.returnAmount || null,
          returnDate: editForm.returnDate || null,
          returnCurrency: editForm.returnCurrency || null,
          warehouseId: editForm.warehouseId || null,
          warehouseName: selectedWarehouse?.name || null,
          platform: editForm.platform || null,
          storeId: editForm.storeId || null,
          storeName: selectedStore?.name || null,
          totalVolumeCBM: editForm.totalVolumeCBM || null,
          totalWeightKG: editForm.totalWeightKG || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "保存失败");
        return;
      }
      toast.success("柜子信息已更新");
      setIsEditOpen(false);
      await mutate();
      const fresh = await fetch(`/api/containers/${detailContainer.id}`).then((r) => (r.ok ? r.json() : null));
      if (fresh) {
        setDetailData(fresh);
        setDetailContainer((prev) => (prev ? { ...prev, ...fresh } : prev));
      }
    } catch (error) {
      console.error(error);
      toast.error("保存失败，请稍后重试");
    } finally {
      setEditSaving(false);
    }
  };

  useEffect(() => {
    if (!detailContainer?.id) {
      setDetailData(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    fetch(`/api/containers/${detailContainer.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return;
        setDetailData(json);
      })
      .catch(() => {
        if (!active) return;
        setDetailData(null);
      })
      .finally(() => {
        if (!active) return;
        setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [detailContainer?.id]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="柜子管理"
        description="按柜管理在途货物、海运信息和出库批次"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="mr-1 flex rounded-lg border border-slate-700/80 bg-slate-900/80 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "table"
                    ? "bg-primary-500/20 text-primary-200 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Table2 className="h-3.5 w-3.5" />
                表格视图
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "cards"
                    ? "bg-primary-500/20 text-primary-200 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                卡片视图
              </button>
            </div>
            <ActionButton
              variant="secondary"
              icon={RefreshCw}
              onClick={() => mutate()}
            >
              刷新
            </ActionButton>
            <ActionButton
              variant="secondary"
              icon={Download}
              onClick={handleExport}
            >
              导出数据
            </ActionButton>
            <ActionButton
              variant="primary"
              icon={Plus}
              onClick={() => setIsCreateOpen((v) => !v)}
            >
              新增柜子
            </ActionButton>
          </div>
        }
      />

      <ContainerStats
        summary={{
          total: stats.total,
          inTransit: stats.byStatus["IN_TRANSIT"] || 0,
          arrivedPort: stats.byStatus["ARRIVED_PORT"] || 0,
          inWarehouse: stats.byStatus["IN_WAREHOUSE"] || 0,
        }}
      />

      <ContainerFilters
        searchKeyword={searchKeyword}
        onSearchKeywordChange={setSearchKeyword}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        filterMethod={filterMethod}
        onFilterMethodChange={setFilterMethod}
        statusCountMap={stats.byStatus}
      />

      {/* 新建柜子表单（完整版） */}
      {isCreateOpen && (
        <div className="rounded-xl border border-primary-500/40 bg-slate-900/80 p-4 space-y-4">
          <div className="text-sm font-medium text-slate-100">新建柜子</div>
          <form className="grid grid-cols-1 md:grid-cols-4 gap-4" onSubmit={handleCreate}>
            {/* 基本信息 */}
            <label className="space-y-1">
              <span className="text-xs text-slate-300">柜号 *</span>
              <input
                value={createForm.containerNo}
                onChange={(e) => setCreateForm((f) => ({ ...f, containerNo: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                placeholder="例如 MSKU1234567"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">柜型</span>
              <input
                value={createForm.containerType}
                onChange={(e) => setCreateForm((f) => ({ ...f, containerType: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                placeholder="如 40HQ / 20GP"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">封条号</span>
              <input
                value={createForm.sealNo}
                onChange={(e) => setCreateForm((f) => ({ ...f, sealNo: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">运输方式</span>
              <select
                value={createForm.shippingMethod}
                onChange={(e) => setCreateForm((f) => ({ ...f, shippingMethod: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="SEA">SEA（海运）</option>
                <option value="AIR">AIR（空运）</option>
                <option value="EXPRESS">EXPRESS（快递）</option>
              </select>
            </label>
            
            {/* 船运信息 */}
            <label className="space-y-1">
              <span className="text-xs text-slate-300">船公司</span>
              <select
                value={createForm.shipCompany}
                onChange={(e) => setCreateForm((f) => ({ ...f, shipCompany: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="">请选择物流公司</option>
                {logisticsChannels.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                    {c.channelCode ? ` (${c.channelCode})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">船名</span>
              <input
                value={createForm.vesselName}
                onChange={(e) => setCreateForm((f) => ({ ...f, vesselName: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">航次</span>
              <input
                value={createForm.voyageNo}
                onChange={(e) => setCreateForm((f) => ({ ...f, voyageNo: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">状态</span>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="PLANNED">已计划</option>
                <option value="LOADING">装柜中</option>
                <option value="IN_TRANSIT">在途</option>
                <option value="ARRIVED_PORT">已到港</option>
                <option value="CUSTOMS_CLEAR">清关完成</option>
                <option value="IN_WAREHOUSE">已入仓</option>
                <option value="CLOSED">已完结</option>
              </select>
            </label>
            
            {/* 港口信息 */}
            <label className="space-y-1">
              <span className="text-xs text-slate-300">起运港</span>
              <input
                value={createForm.originPort}
                onChange={(e) => setCreateForm((f) => ({ ...f, originPort: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">目的港</span>
              <input
                value={createForm.destinationPort}
                onChange={(e) => setCreateForm((f) => ({ ...f, destinationPort: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">目的国家</span>
              <select
                value={createForm.destinationCountry}
                onChange={(e) => setCreateForm((f) => ({ ...f, destinationCountry: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              >
                <option value="">请选择目的国</option>
                {Object.entries(countryOptionsByRegion.grouped).map(([region, countries]) => (
                  <optgroup key={region} label={region}>
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name} ({country.code})
                      </option>
                    ))}
                  </optgroup>
                ))}
                {countryOptionsByRegion.extras.length > 0 && (
                  <optgroup label="系统维护">
                    {countryOptionsByRegion.extras.map((country) => (
                      <option key={country.value} value={country.value}>
                        {getCountryByCode(country.value)?.name
                          ? `${getCountryByCode(country.value)!.name} (${country.value})`
                          : country.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">出口模式</span>
              <select
                value={createForm.exportMode}
                onChange={(e) => setCreateForm((f) => ({ ...f, exportMode: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="">请选择</option>
                <option value="EXW">EXW</option>
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
                <option value="DAP">DAP</option>
                <option value="DDP">DDP</option>
              </select>
            </label>
            
            {/* 日期 */}
            <label className="space-y-1">
              <span className="text-xs text-slate-300">装柜日期</span>
              <input
                type="date"
                value={createForm.loadingDate}
                onChange={(e) => setCreateForm((f) => ({ ...f, loadingDate: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">预计开船(ETD)</span>
              <input
                type="date"
                value={createForm.etd}
                onChange={(e) => setCreateForm((f) => ({ ...f, etd: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">预计到港(ETA)</span>
              <input
                type="date"
                value={createForm.eta}
                onChange={(e) => setCreateForm((f) => ({ ...f, eta: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">实际开船</span>
              <input
                type="date"
                value={createForm.actualDeparture}
                onChange={(e) => setCreateForm((f) => ({ ...f, actualDeparture: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">实际到港</span>
              <input
                type="date"
                value={createForm.actualArrival}
                onChange={(e) => setCreateForm((f) => ({ ...f, actualArrival: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">清关时间</span>
              <input
                type="date"
                value={createForm.customsClearanceAt}
                onChange={(e) => setCreateForm((f) => ({ ...f, customsClearanceAt: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">入仓时间</span>
              <input
                type="date"
                value={createForm.warehouseInboundAt}
                onChange={(e) => setCreateForm((f) => ({ ...f, warehouseInboundAt: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            
            {/* 主体 */}
            <label className="space-y-1">
              <span className="text-xs text-slate-300">出口公司</span>
              <select
                value={createForm.exporterId}
                onChange={(e) => setCreateForm((f) => ({ ...f, exporterId: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="">请选择</option>
                {exporters.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">海外公司</span>
              <select
                value={createForm.overseasCompanyId}
                onChange={(e) => setCreateForm((f) => ({ ...f, overseasCompanyId: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="">请选择</option>
                {overseasCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">目的仓库</span>
              <select
                value={createForm.warehouseId}
                onChange={(e) => setCreateForm((f) => ({ ...f, warehouseId: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="">请选择</option>
                {warehouses.filter((w: any) => w.type === "OVERSEAS" || w.location === "OVERSEAS").map((w: any) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">销售平台</span>
              <select
                value={createForm.platform}
                onChange={(e) => setCreateForm((f) => ({ ...f, platform: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="">请选择</option>
                <option value="TikTok">TikTok</option>
                <option value="Amazon">Amazon</option>
                <option value="Instagram">Instagram</option>
                <option value="YouTube">YouTube</option>
                <option value="Other">其他</option>
              </select>
            </label>
            
            {/* 店铺 */}
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-slate-300">店铺</span>
              <select
                value={createForm.storeId}
                onChange={(e) => setCreateForm((f) => ({ ...f, storeId: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="">请选择</option>
                {stores.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <p className="md:col-span-4 text-xs text-slate-500 leading-relaxed rounded-md border border-slate-800/80 bg-slate-950/40 px-3 py-2">
              申报、关税、回款等与账单/付款单一致的信息<strong className="text-slate-400">不再在新建时填写</strong>。
              保存柜子后，请打开「查看详情 → 编辑信息」，在编辑弹窗中补充；或使用导入/同步。
            </p>
            
            {/* 汇总 */}
            <label className="space-y-1">
              <span className="text-xs text-slate-300">总体积(CBM)</span>
              <input
                type="number"
                value={createForm.totalVolumeCBM}
                onChange={(e) => setCreateForm((f) => ({ ...f, totalVolumeCBM: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">总重量(KG)</span>
              <input
                type="number"
                value={createForm.totalWeightKG}
                onChange={(e) => setCreateForm((f) => ({ ...f, totalWeightKG: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            
            {/* 提交按钮 */}
            <div className="flex items-end gap-2 md:col-span-4">
              <ActionButton type="submit" variant="primary">
                保存
              </ActionButton>
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsCreateOpen(false);
                  setCreateForm(emptyForm);
                }}
              >
                取消
              </ActionButton>
            </div>
          </form>
        </div>
      )}

      {viewMode === "table" ? (
        <ContainersTable
          isLoading={isLoading}
          containers={filtered}
          statusLabels={statusLabels}
          methodLabels={methodLabels}
          getProgress={getProgress}
          getProgressBarColor={getProgressBarColor}
          getVoyageInfo={getVoyageInfo}
          formatDate={formatDate}
          formatDateTime={formatDateTime}
          formatNumber={formatNumber}
          onOpenDetail={setDetailContainer}
          onChangeStatus={handleChangeStatus}
          statusOptions={statusOptions}
        />
      ) : (
        <ContainerCardsView
          isLoading={isLoading}
          containers={filtered}
          statusLabels={statusLabels}
          methodLabels={methodLabels}
          getProgress={getProgress}
          getProgressBarColor={getProgressBarColor}
          getVoyageInfo={getVoyageInfo}
          formatDate={formatDate}
          formatDateTime={formatDateTime}
          onOpenDetail={setDetailContainer}
        />
      )}

      {detailContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  柜子详情 · {detailContainer.containerNo}
                </h2>
                <p className="text-xs text-slate-400 mt-1">参照采购合同详情弹窗风格，便于集中查看字段</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailContainer(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton type="button" variant="secondary" onClick={openEditModal}>
                编辑信息
              </ActionButton>
              {(() => {
                const hasCost = Array.isArray(detailData?.logisticsCosts) && detailData.logisticsCosts.length > 0;
                if (hasCost) {
                  return (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-500 cursor-not-allowed">
                      已生成账单
                    </span>
                  );
                }
                return (
                  <ActionButton type="button" variant="primary" onClick={() => { setBillModalOpen(true); setBillForm({ costType: detailContainer.shippingMethod === "AIR" ? "空运费" : "海运费", amount: "", currency: "CNY", paymentType: "现结", creditDays: "", logisticsChannelId: "", outboundBatchIds: (detailData?.outboundBatches || []).map((b: any) => b.id), notes: "", voucher: "" }); }}>
                    生成物流账单
                  </ActionButton>
                );
              })()}
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <InfoRow label="柜号" value={detailContainer.containerNo} />
              <InfoRow label="柜型" value={detailContainer.containerType} />
              <InfoRow label="状态" value={statusLabels[detailContainer.status] ?? detailContainer.status} />
              <InfoRow label="运输方式" value={methodLabels[detailContainer.shippingMethod] ?? detailContainer.shippingMethod} />
              <InfoRow label="船公司" value={detailContainer.shipCompany || "-"} />
              <InfoRow label="船名/航次" value={`${detailContainer.vesselName || "-"} / ${detailContainer.voyageNo || "-"}`} />
              <InfoRow label="起运港" value={detailContainer.originPort || "-"} />
              <InfoRow label="目的港" value={detailContainer.destinationPort || "-"} />
              <InfoRow
                label="装柜日期"
                value={
                  detailContainer.loadingDate
                    ? formatDateTime(detailContainer.loadingDate)
                    : "-"
                }
              />
              <InfoRow label="ETD" value={formatDateTime(detailContainer.etd)} />
              <InfoRow label="ETA" value={formatDateTime(detailContainer.eta)} />
              <InfoRow label="实际开船" value={formatDateTime(detailContainer.actualDeparture)} />
              <InfoRow label="到港时间" value={formatDateTime(detailContainer.actualArrival)} />
              <InfoRow label="清关时间" value={formatDateTime(detailContainer.customsClearanceAt)} />
              <InfoRow label="入仓时间" value={formatDateTime(detailContainer.warehouseInboundAt)} />
              <InfoRow label="出口公司" value={detailContainer.exporterName || "-"} />
              <InfoRow label="海外公司" value={detailContainer.overseasCompanyName || "-"} />
              <InfoRow label="目的仓库" value={detailContainer.warehouseName || "-"} />
              <InfoRow label="店铺" value={detailContainer.storeName || "-"} />
              <InfoRow label="总体积(CBM)" value={formatNumber(detailContainer.totalVolumeCBM)} />
              <InfoRow label="总重量(KG)" value={formatNumber(detailContainer.totalWeightKG)} />
              <InfoRow
                label="申报"
                value={
                  detailContainer.declaredValue
                    ? `${formatNumber(detailContainer.declaredValue)} ${detailContainer.declaredCurrency || ""}`.trim()
                    : "-"
                }
              />
              <InfoRow
                label="关税"
                value={
                  detailContainer.dutyAmount
                    ? `${formatNumber(detailContainer.dutyAmount)} ${detailContainer.dutyCurrency || ""}${detailContainer.dutyPayer ? ` · ${detailContainer.dutyPayer}` : ""}`.trim()
                    : "-"
                }
              />
              <InfoRow
                label="已付关税"
                value={
                  detailContainer.dutyPaidAmount ? formatNumber(detailContainer.dutyPaidAmount) : "-"
                }
              />
              <InfoRow
                label="回款"
                value={
                  detailContainer.returnAmount
                    ? `${formatNumber(detailContainer.returnAmount)} ${detailContainer.returnCurrency || ""}${detailContainer.returnDate ? ` · ${formatDate(detailContainer.returnDate)}` : ""}`.trim()
                    : "-"
                }
              />
              <InfoRow label="批次数" value={String(detailContainer.outboundBatchCount ?? 0)} />
              <InfoRow label="创建时间" value={formatDate(detailContainer.createdAt)} />
            </div>

            <LogisticsProgressAxis container={detailContainer} />

            {/* 财务信息 */}
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-500 mb-2">物流费用明细</div>
              {Array.isArray(detailData?.logisticsCosts) && detailData.logisticsCosts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-800">
                        <th className="py-1.5 text-left">费用类型</th>
                        <th className="py-1.5 text-right">金额</th>
                        <th className="py-1.5 text-left">币种</th>
                        <th className="py-1.5 text-left">付款方式</th>
                        <th className="py-1.5 text-left">状态</th>
                        <th className="py-1.5 text-left">到期日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.logisticsCosts.map((c: any) => (
                        <tr key={c.id} className="border-b border-slate-800/50">
                          <td className="py-1.5 text-slate-300">{c.costType}</td>
                          <td className="py-1.5 text-right text-slate-200 tabular-nums">{Number(c.amount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                          <td className="py-1.5 text-slate-400">{c.currency}</td>
                          <td className="py-1.5 text-slate-400">{c.paymentType}</td>
                          <td className="py-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              c.paymentStatus === "已付" ? "bg-emerald-500/10 text-emerald-300"
                              : c.paymentStatus === "审批中" ? "bg-blue-500/10 text-blue-300"
                              : c.paymentStatus === "未付" ? "bg-amber-500/10 text-amber-300"
                              : "bg-slate-500/10 text-slate-300"
                            }`}>{c.paymentStatus}</span>
                          </td>
                          <td className="py-1.5 text-slate-500">{c.dueDate ? new Date(c.dueDate).toLocaleDateString("zh-CN") : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-700">
                        <td className="py-2 text-slate-400 font-medium">合计</td>
                        <td className="py-2 text-right text-slate-200 font-medium tabular-nums">
                          {detailData.logisticsCosts.reduce((sum: number, c: any) => sum + Number(c.amount), 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={4}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-slate-500 py-2">暂无物流费用记录</div>
              )}
            </div>

            {/* 关联出库批次 */}
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-xs text-slate-500 mb-2">关联出库批次</div>
              {detailLoading ? (
                <div className="text-sm text-slate-400">正在加载批次...</div>
              ) : Array.isArray(detailData?.outboundBatches) && detailData.outboundBatches.length > 0 ? (
                <div className="space-y-2">
                  {detailData.outboundBatches.map((b: any) => (
                    <div
                      key={b.id}
                      className="rounded border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-slate-100 font-medium">{b.batchNumber}</span>
                        <span>数量 {b.qty}</span>
                        <span>状态 {b.status}</span>
                        <span>发货 {formatDate(b.shippedDate)}</span>
                      </div>
                      <div className="mt-1 text-slate-500">
                        出库单 {b.outboundOrder?.outboundNumber || "-"} · SKU {b.outboundOrder?.sku || "-"} · 仓库{" "}
                        {b.warehouse?.name || "-"}
                      </div>
                      {Array.isArray(b.skuLines) && b.skuLines.length > 0 ? (
                        <div className="mt-2 rounded border border-slate-800 bg-slate-900/70 p-2">
                          <div className="text-[11px] text-slate-500 mb-1 flex flex-wrap items-center gap-2">
                            <span>产品明细</span>
                            {b.skuLinesEstimated ? (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200/90">
                                参考（出库单）
                              </span>
                            ) : null}
                          </div>
                          {b.skuLinesNote ? (
                            <p className="text-[10px] text-amber-200/80 mb-1.5 leading-relaxed">{b.skuLinesNote}</p>
                          ) : null}
                          <div className="space-y-1">
                            {b.skuLines.map((line: any) => (
                              <div key={line.id} className="text-[11px] text-slate-300">
                                <span className="font-mono">{line.sku}</span>
                                {" · "}
                                <span>{line.skuName || "未命名"}</span>
                                {line.spec ? <span className="text-slate-500"> · {line.spec}</span> : null}
                                <span className="text-cyan-300"> × {line.qty}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link
                          href={`/outbound/${encodeURIComponent(b.id)}`}
                          className="inline-flex rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                        >
                          打开出库批次详情
                        </Link>
                        <Link
                          href={`/outbound?keyword=${encodeURIComponent(b.batchNumber || "")}`}
                          className="inline-flex rounded border border-slate-700/60 px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800/80"
                        >
                          去批次列表页筛选
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">暂无关联批次</div>
              )}
            </div>
          </div>
        </div>
      )}

      {isEditOpen && detailContainer && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">编辑柜子信息 · {detailContainer.containerNo}</h3>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <form className="grid grid-cols-1 md:grid-cols-3 gap-4" onSubmit={submitEditContainer}>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">柜号</span>
                <input value={editForm.containerNo} onChange={(e) => setEditForm((f) => ({ ...f, containerNo: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">柜型</span>
                <input value={editForm.containerType} onChange={(e) => setEditForm((f) => ({ ...f, containerType: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">状态</span>
                <select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
                  {statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">装柜日期</span>
                <input type="date" value={editForm.loadingDate} onChange={(e) => setEditForm((f) => ({ ...f, loadingDate: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">ETD</span>
                <input type="date" value={editForm.etd} onChange={(e) => setEditForm((f) => ({ ...f, etd: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">ETA</span>
                <input type="date" value={editForm.eta} onChange={(e) => setEditForm((f) => ({ ...f, eta: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">实际开船</span>
                <input type="date" value={editForm.actualDeparture} onChange={(e) => setEditForm((f) => ({ ...f, actualDeparture: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">实际到港</span>
                <input type="date" value={editForm.actualArrival} onChange={(e) => setEditForm((f) => ({ ...f, actualArrival: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">清关时间</span>
                <input type="date" value={editForm.customsClearanceAt} onChange={(e) => setEditForm((f) => ({ ...f, customsClearanceAt: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">入仓时间</span>
                <input type="date" value={editForm.warehouseInboundAt} onChange={(e) => setEditForm((f) => ({ ...f, warehouseInboundAt: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">目的仓库</span>
                <select value={editForm.warehouseId} onChange={(e) => setEditForm((f) => ({ ...f, warehouseId: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
                  <option value="">请选择</option>
                  {warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">起运港</span>
                <input value={editForm.originPort} onChange={(e) => setEditForm((f) => ({ ...f, originPort: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">目的港</span>
                <input value={editForm.destinationPort} onChange={(e) => setEditForm((f) => ({ ...f, destinationPort: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">船公司</span>
                <input value={editForm.shipCompany} onChange={(e) => setEditForm((f) => ({ ...f, shipCompany: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </label>

              <div className="md:col-span-3 text-xs font-medium text-slate-400 pt-2 border-t border-slate-800">
                申报、关税与回款（与账单/付款单一致的信息）
              </div>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">申报金额</span>
                <input
                  type="number"
                  value={editForm.declaredValue}
                  onChange={(e) => setEditForm((f) => ({ ...f, declaredValue: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">申报币种</span>
                <select
                  value={editForm.declaredCurrency}
                  onChange={(e) => setEditForm((f) => ({ ...f, declaredCurrency: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">关税金额</span>
                <input
                  type="number"
                  value={editForm.dutyAmount}
                  onChange={(e) => setEditForm((f) => ({ ...f, dutyAmount: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">付款主体</span>
                <select
                  value={editForm.dutyPayer}
                  onChange={(e) => setEditForm((f) => ({ ...f, dutyPayer: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="">请选择</option>
                  <option value="国内">国内</option>
                  <option value="海外">海外</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">关税币种</span>
                <select
                  value={editForm.dutyCurrency}
                  onChange={(e) => setEditForm((f) => ({ ...f, dutyCurrency: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">已付关税</span>
                <input
                  type="number"
                  value={editForm.dutyPaidAmount}
                  onChange={(e) => setEditForm((f) => ({ ...f, dutyPaidAmount: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">回款金额</span>
                <input
                  type="number"
                  value={editForm.returnAmount}
                  onChange={(e) => setEditForm((f) => ({ ...f, returnAmount: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">回款日期</span>
                <input
                  type="date"
                  value={editForm.returnDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, returnDate: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">回款币种</span>
                <select
                  value={editForm.returnCurrency}
                  onChange={(e) => setEditForm((f) => ({ ...f, returnCurrency: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs text-slate-300">总体积(CBM)</span>
                <input
                  type="number"
                  value={editForm.totalVolumeCBM}
                  onChange={(e) => setEditForm((f) => ({ ...f, totalVolumeCBM: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">总重量(KG)</span>
                <input
                  type="number"
                  value={editForm.totalWeightKG}
                  onChange={(e) => setEditForm((f) => ({ ...f, totalWeightKG: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <div className="md:col-span-3 flex justify-end gap-2 pt-2">
                <ActionButton type="button" variant="secondary" onClick={() => setIsEditOpen(false)}>
                  取消
                </ActionButton>
                <ActionButton type="submit" isLoading={editSaving}>
                  保存修改
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {statusConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-100">确认变更状态</div>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              确认将柜子
              <span className="mx-1 text-slate-200 font-medium">
                {statusConfirm.container.containerNo}
              </span>
              的状态从
              <span className="mx-1 text-amber-300">
                {statusLabels[statusConfirm.container.status] ?? statusConfirm.container.status}
              </span>
              修改为
              <span className="mx-1 text-emerald-300">
                {statusLabels[statusConfirm.toStatus] ?? statusConfirm.toStatus}
              </span>
              吗？
            </p>
            {statusConfirm.toStatus === "IN_WAREHOUSE" && (
              <div className="mt-3">
                <label className="text-sm text-slate-300">选择入库仓库 <span className="text-rose-400">*</span></label>
                <select
                  value={toWarehouseId}
                  onChange={(e) => setToWarehouseId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="">请选择仓库</option>
                  {warehouses.filter((w: any) => w.type === "OVERSEAS").map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => { setStatusConfirm(null); setToWarehouseId(""); }}
              >
                取消
              </ActionButton>
              <ActionButton type="button" onClick={submitChangeStatus} disabled={statusConfirm.toStatus === "IN_WAREHOUSE" && !toWarehouseId}>
                确认到货
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* 生成物流账单弹窗 */}
      {billModalOpen && detailContainer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-slate-100">
                生成物流账单 · {detailContainer.containerNo}
              </div>
              <button onClick={() => setBillModalOpen(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <div className="mt-4 space-y-3">
              {/* 出库批次多选 */}
              <div>
                <span className="text-sm text-slate-300">关联出库批次</span>
                <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-slate-700 bg-slate-950 p-2 space-y-1">
                  {(detailData?.outboundBatches || []).map((b: any) => (
                    <label key={b.id} className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={billForm.outboundBatchIds.includes(b.id)}
                        onChange={(e) => {
                          setBillForm(f => ({
                            ...f,
                            outboundBatchIds: e.target.checked
                              ? [...f.outboundBatchIds, b.id]
                              : f.outboundBatchIds.filter((id: string) => id !== b.id)
                          }));
                        }}
                      />
                      {b.batchNumber} ({b.qty}件)
                    </label>
                  ))}
                </div>
              </div>

              {/* 费用类型 */}
              <label className="block">
                <span className="text-sm text-slate-300">费用类型 <span className="text-rose-400">*</span></span>
                <select value={billForm.costType} onChange={e => setBillForm(f => ({ ...f, costType: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                  {["海运费", "海运费（双清包税）", "空运费", "港杂费", "清关费", "送货费"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>

              {/* 物流商 */}
              <label className="block">
                <span className="text-sm text-slate-300">物流商</span>
                <select value={billForm.logisticsChannelId} onChange={e => setBillForm(f => ({ ...f, logisticsChannelId: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                  <option value="">不选择</option>
                  {logisticsChannels.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </select>
              </label>

              {/* 金额 + 币种 */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-slate-300">金额 <span className="text-rose-400">*</span></span>
                  <input type="number" step="0.01" value={billForm.amount} onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" placeholder="0.00" />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-300">币种</span>
                  <select value={billForm.currency} onChange={e => setBillForm(f => ({ ...f, currency: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                    <option value="BRL">BRL</option>
                  </select>
                </label>
              </div>

              {/* 付款方式 */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-slate-300">付款方式</span>
                  <select value={billForm.paymentType} onChange={e => setBillForm(f => ({ ...f, paymentType: e.target.value, creditDays: e.target.value === "现结" ? "" : f.creditDays }))}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                    <option value="现结">现结</option>
                    <option value="账期">账期</option>
                  </select>
                </label>
                {billForm.paymentType === "账期" && (
                  <label className="block">
                    <span className="text-sm text-slate-300">账期天数</span>
                    <input type="number" value={billForm.creditDays} onChange={e => setBillForm(f => ({ ...f, creditDays: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" placeholder="如：30" />
                  </label>
                )}
              </div>

              {/* 备注 */}
              <label className="block">
                <span className="text-sm text-slate-300">备注</span>
                <input type="text" value={billForm.notes} onChange={e => setBillForm(f => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" placeholder="可选" />
              </label>

              {/* 物流账单凭证 */}
              <div>
                <span className="text-sm text-slate-300">物流账单凭证 <span className="text-slate-500">(可选)</span></span>
                <div className="mt-1">
                  <ImageUploader
                    value={billForm.voucher}
                    onChange={(value) => setBillForm(f => ({ ...f, voucher: value }))}
                    multiple={true}
                    label="上传物流账单凭证"
                    placeholder="点击上传或直接 Ctrl + V 粘贴账单凭证图片"
                    maxImages={5}
                    onError={(error) => toast.error(error)}
                  />
                </div>
              </div>

              {/* 到期日提示 */}
              {billForm.paymentType === "账期" && billForm.creditDays && detailContainer.actualDeparture && (
                <div className="rounded-md bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
                  到期日：{new Date(new Date(detailContainer.actualDeparture).getTime() + parseInt(billForm.creditDays) * 86400000).toLocaleDateString("zh-CN")}
                  （柜子出发日 + {billForm.creditDays}天）
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <ActionButton type="button" variant="secondary" onClick={() => setBillModalOpen(false)}>取消</ActionButton>
                <ActionButton type="button" onClick={submitBill} isLoading={billSaving}>生成账单</ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-slate-200">{value}</div>
    </div>
  );
}

