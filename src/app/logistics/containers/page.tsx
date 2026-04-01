"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Download, Plus, RefreshCw } from "lucide-react";
import { PageHeader, ActionButton } from "@/components/ui";
import type { Container } from "@/logistics/types";
import Link from "next/link";
import { getCountriesByRegion, getCountryByCode } from "@/lib/country-config";
import { ContainerStats } from "./components/ContainerStats";
import { ContainerFilters } from "./components/ContainerFilters";
import { ContainersTable } from "./components/ContainersTable";
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
    case "IN_TRANSIT":
      return "bg-amber-400";
    case "ARRIVED_PORT":
    case "CUSTOMS_CLEAR":
      return "bg-blue-400";
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

function formatNumber(value?: string | null, digits = 2): string {
  if (!value) return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

function getContainerLoadingDateFromBatches(outboundBatches: any[] | undefined): string {
  if (!Array.isArray(outboundBatches) || outboundBatches.length === 0) return "-";
  const ts = outboundBatches
    .map((b) => new Date(b?.shippedDate || "").getTime())
    .filter((v) => Number.isFinite(v));
  if (ts.length === 0) return "-";
  return formatDate(new Date(Math.min(...ts)).toISOString());
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
  const [statusConfirm, setStatusConfirm] = useState<{
    container: Container;
    toStatus: string;
  } | null>(null);

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

  const handleChangeStatus = async (container: Container, status: string) => {
    if (status === container.status) return;
    setStatusConfirm({ container, toStatus: status });
  };

  const submitChangeStatus = async () => {
    if (!statusConfirm) return;
    const { container, toStatus } = statusConfirm;
    try {
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
      mutate();
      if (detailContainer?.id === container.id) {
        setDetailContainer({ ...detailContainer, status: toStatus as any });
      }
      setStatusConfirm(null);
    } catch (error) {
      console.error(error);
      toast.error("状态更新失败，请稍后重试");
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
          <div className="flex gap-2">
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
            
            {/* 申报 */}
            <label className="space-y-1">
              <span className="text-xs text-slate-300">申报金额</span>
              <input
                type="number"
                value={createForm.declaredValue}
                onChange={(e) => setCreateForm((f) => ({ ...f, declaredValue: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">申报币种</span>
              <select
                value={createForm.declaredCurrency}
                onChange={(e) => setCreateForm((f) => ({ ...f, declaredCurrency: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </label>
            
            {/* 关税 */}
            <label className="space-y-1">
              <span className="text-xs text-slate-300">关税金额</span>
              <input
                type="number"
                value={createForm.dutyAmount}
                onChange={(e) => setCreateForm((f) => ({ ...f, dutyAmount: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">付款主体</span>
              <select
                value={createForm.dutyPayer}
                onChange={(e) => setCreateForm((f) => ({ ...f, dutyPayer: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="">请选择</option>
                <option value="国内">国内</option>
                <option value="海外">海外</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">关税币种</span>
              <select
                value={createForm.dutyCurrency}
                onChange={(e) => setCreateForm((f) => ({ ...f, dutyCurrency: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
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
                value={createForm.dutyPaidAmount}
                onChange={(e) => setCreateForm((f) => ({ ...f, dutyPaidAmount: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            
            {/* 回款 */}
            <label className="space-y-1">
              <span className="text-xs text-slate-300">回款金额</span>
              <input
                type="number"
                value={createForm.returnAmount}
                onChange={(e) => setCreateForm((f) => ({ ...f, returnAmount: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">回款日期</span>
              <input
                type="date"
                value={createForm.returnDate}
                onChange={(e) => setCreateForm((f) => ({ ...f, returnDate: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-300">回款币种</span>
              <select
                value={createForm.returnCurrency}
                onChange={(e) => setCreateForm((f) => ({ ...f, returnCurrency: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </label>
            
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

      <ContainersTable
        isLoading={isLoading}
        containers={filtered}
        statusLabels={statusLabels}
        methodLabels={methodLabels}
        getProgress={getProgress}
        getProgressBarColor={getProgressBarColor}
        getVoyageInfo={getVoyageInfo}
        formatDate={formatDate}
        formatNumber={formatNumber}
        onOpenDetail={setDetailContainer}
        onChangeStatus={handleChangeStatus}
        statusOptions={statusOptions}
      />

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
                    : getContainerLoadingDateFromBatches(detailData?.outboundBatches)
                }
              />
              <InfoRow label="ETD/ETA" value={`${formatDateTime(detailContainer.etd)} / ${formatDateTime(detailContainer.eta)}`} />
              <InfoRow label="实际开船/到港" value={`${formatDateTime(detailContainer.actualDeparture)} / ${formatDateTime(detailContainer.actualArrival)}`} />
              <InfoRow label="出口公司" value={detailContainer.exporterName || "-"} />
              <InfoRow label="海外公司" value={detailContainer.overseasCompanyName || "-"} />
              <InfoRow label="目的仓库" value={detailContainer.warehouseName || "-"} />
              <InfoRow label="店铺" value={detailContainer.storeName || "-"} />
              <InfoRow label="总体积(CBM)" value={formatNumber(detailContainer.totalVolumeCBM)} />
              <InfoRow label="总重量(KG)" value={formatNumber(detailContainer.totalWeightKG)} />
              <InfoRow label="批次数" value={String(detailContainer.outboundBatchCount ?? 0)} />
              <InfoRow label="创建时间" value={formatDate(detailContainer.createdAt)} />
            </div>

            <LogisticsProgressAxis container={detailContainer} />

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
                          <div className="text-[11px] text-slate-500 mb-1">产品明细</div>
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
                      <div className="mt-2">
                        <Link
                          href={`/outbound?keyword=${encodeURIComponent(b.batchNumber || "")}`}
                          className="inline-flex rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                        >
                          去出库批次页面查看
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
            <div className="mt-4 flex items-center justify-end gap-2">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => setStatusConfirm(null)}
              >
                取消
              </ActionButton>
              <ActionButton type="button" onClick={submitChangeStatus}>
                确认
              </ActionButton>
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

