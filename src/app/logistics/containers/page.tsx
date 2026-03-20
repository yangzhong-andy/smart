"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Truck, Package, Plus, RefreshCw } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import type { Container } from "@/logistics/types";

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
  // 预计剩余天数
  const daysLeft = Math.max(0, Math.floor((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  // 进度百分比
  const progress = Math.min(100, Math.max(0, Math.floor((daysPassed / totalDays) * 100)));
  
  return {
    daysPassed,
    totalDays,
    daysLeft,
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
              variant="primary"
              icon={Plus}
              onClick={() => setIsCreateOpen((v) => !v)}
            >
              新增柜子
            </ActionButton>
          </div>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard title="柜子总数" value={stats.total} icon={Truck} />
        <StatCard title="在途柜" value={stats.byStatus["IN_TRANSIT"] || 0} icon={Truck} />
        <StatCard title="已到港" value={stats.byStatus["ARRIVED_PORT"] || 0} icon={Package} />
        <StatCard title="已入仓" value={stats.byStatus["IN_WAREHOUSE"] || 0} icon={Package} />
      </div>

      {/* 筛选区 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索柜号、船名、航次..."
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
        >
          <option value="all">全部状态</option>
          {Object.keys(statusLabels).map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </select>
        <select
          value={filterMethod}
          onChange={(e) => setFilterMethod(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
        >
          <option value="all">全部方式</option>
          <option value="SEA">海运</option>
          <option value="AIR">空运</option>
          <option value="EXPRESS">快递</option>
        </select>
      </div>

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
              <input
                value={createForm.shipCompany}
                onChange={(e) => setCreateForm((f) => ({ ...f, shipCompany: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
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
              <input
                value={createForm.destinationCountry}
                onChange={(e) => setCreateForm((f) => ({ ...f, destinationCountry: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
              />
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

      {/* 列表区域 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-slate-800/50 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="暂无柜子记录"
            description="可以通过右上角“新增柜子”按钮，录入第一批柜信息。"
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-3 hover:border-primary-500/60 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">
                        {c.containerNo}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        {c.containerType}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        {methodLabels[c.shippingMethod] ?? c.shippingMethod}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-primary-300">
                        {statusLabels[c.status] ?? c.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {c.originPort || "-"} → {c.destinationPort || "-"} · 批次数：
                      {c.outboundBatchCount ?? 0}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      ETD：{c.etd ? new Date(c.etd).toLocaleDateString() : "-"} · ETA：
                      {c.eta ? new Date(c.eta).toLocaleDateString() : "-"}
                    </div>
                    {/* 航行进度详情 */}
                    {c.status === "IN_TRANSIT" && c.etd && c.eta && (
                      <div className="mt-1 text-xs">
                        {(() => {
                          const info = getVoyageInfo(c);
                          if (!info) return null;
                          return (
                            <div className="flex items-center gap-3">
                              <span className="text-amber-400">
                                已航行 {info.daysPassed} 天 / 共 {info.totalDays} 天
                              </span>
                              <span className={`${info.isOverdue ? "text-red-400" : "text-blue-400"}`}>
                                {info.isOverdue ? `延误 ${info.daysLeft} 天` : `预计 ${info.daysLeft} 天后到港`}
                              </span>
                              <span className="text-slate-500">
                                ({info.eta})
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      实际开船：
                      {c.actualDeparture
                        ? new Date(c.actualDeparture).toLocaleDateString()
                        : "-"}{" "}
                      · 实际到港：
                      {c.actualArrival
                        ? new Date(c.actualArrival).toLocaleDateString()
                        : "-"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>创建于：{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                {/* 运输进度条 */}
                <div className="mt-1">
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>运输进度</span>
                    <span>{getProgress(c.status)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full ${getProgressBarColor(c.status)} transition-all`}
                      style={{ width: `${getProgress(c.status)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

