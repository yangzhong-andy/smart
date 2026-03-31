"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Package, Plus, Pencil, Trash2, X, ArrowRight, Check, Truck } from "lucide-react";
import { PageHeader, StatCard, ActionButton, EmptyState } from "@/components/ui";
import { toast } from "sonner";

type PreRecordItem = {
  id?: string;
  variantId: string;
  sku: string;
  skuName: string;
  spec: string;
  qty: number;
  unitVolumeCBM: number;
  unitWeightKG: number;
  totalVolumeCBM: number;
  totalWeightKG: number;
};

type PreRecord = {
  id: string;
  name: string;
  status: string;
  notes: string;
  exporterId: string;
  exporterName: string;
  overseasCompanyId: string;
  overseasCompanyName: string;
  shippingMethod: string;
  originPort: string;
  destinationPort: string;
  destinationCountry: string;
  loadingProductQty?: number;
  loadingLocation?: string;
  formFilledAt?: string;
  loadingDate?: string;
  shippingWarehouseId?: string;
  shippingWarehouseName?: string;
  loadingLogisticsCompany?: string;
  warehouseId: string;
  warehouseName: string;
  platform: string;
  storeId: string;
  storeName: string;
  totalVolumeCBM: string;
  totalWeightKG: string;
  suggestedContainerType: string;
  containerId: string;
  itemCount: number;
  items: PreRecordItem[];
  createdAt: string;
};

type LogisticsChannelItem = {
  id: string;
  name: string;
  channelCode?: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const statusLabels: Record<string, string> = {
  Draft: "草稿",
  Confirmed: "已确认",
  Converted: "已转柜",
};

const statusColors: Record<string, string> = {
  Draft: "bg-slate-500/20 text-slate-300",
  Confirmed: "bg-amber-500/20 text-amber-300",
  Converted: "bg-emerald-500/20 text-emerald-300",
};

export default function PreRecordsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PreRecord | null>(null);
  const [form, setForm] = useState({
    name: "",
    notes: "",
    shippingMethod: "SEA",
    originPort: "",
    destinationPort: "",
    destinationCountry: "",
    loadingProductQty: 0,
    loadingLocation: "",
    formFilledAt: new Date().toISOString().slice(0, 16),
    loadingDate: "",
    shippingWarehouseId: "",
    shippingWarehouseName: "",
    loadingLogisticsCompany: "",
    exporterId: "",
    exporterName: "",
    overseasCompanyId: "",
    overseasCompanyName: "",
    warehouseId: "",
    warehouseName: "",
    platform: "",
    storeId: "",
    storeName: "",
    items: [] as PreRecordItem[],
  });
  const [saving, setSaving] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertModal, setConvertModal] = useState<{ open: boolean; record: PreRecord | null }>({
    open: false,
    record: null,
  });
  const [convertForm, setConvertForm] = useState({
    containerNo: "",
    containerType: "40HQ",
  });

  // 获取数据
  const { data, isLoading, mutate } = useSWR("/api/container-pre-records?pageSize=100", fetcher);
  const preRecords: PreRecord[] = data?.data || [];

  // 获取下拉数据
  const { data: exportersData } = useSWR<{ data: any[] }>("/api/exporters?pageSize=100", fetcher);
  const { data: overseasCompaniesData } = useSWR<{ data: any[] }>("/api/overseas-companies?pageSize=100", fetcher);
  const { data: warehousesData } = useSWR<{ data: any[] }>("/api/warehouses?pageSize=100", fetcher);
  const { data: storesData } = useSWR<{ data: any[] }>("/api/stores?pageSize=100", fetcher);
  const { data: productsData } = useSWR<{ data: any[] }>("/api/products/all?pageSize=500", fetcher);
  const { data: logisticsChannelsData } = useSWR<{ data: LogisticsChannelItem[] }>(
    "/api/logistics-channels?page=1&pageSize=500",
    fetcher
  );

  const exporters = exportersData?.data || [];
  const overseasCompanies = overseasCompaniesData?.data || [];
  const warehouses = warehousesData?.data || [];
  const stores = storesData?.data || [];
  const products = productsData?.data || [];
  const logisticsChannels = Array.isArray(logisticsChannelsData?.data) ? logisticsChannelsData!.data : [];
  const [boxSpecCache, setBoxSpecCache] = useState<Record<string, any | null>>({});

  const variantOptions = useMemo(() => {
    const list: Array<{ variantId: string; skuId: string; productName: string; color?: string; weightKg?: number }> = [];
    for (const p of products) {
      for (const v of p.variants || []) {
        if (!v?.id) continue;
        list.push({
          variantId: String(v.id),
          skuId: String(v.skuId || ""),
          productName: String(p.name || ""),
          color: v.color || undefined,
          weightKg: v.weightKg ? Number(v.weightKg) : undefined,
        });
      }
    }
    return list;
  }, [products]);

  // 计算体积
  const calculateVolume = (items: PreRecordItem[]) => {
    let totalVolume = 0;
    let totalWeight = 0;
    items.forEach((item) => {
      totalVolume += (item.unitVolumeCBM || 0) * item.qty;
      totalWeight += (item.unitWeightKG || 0) * item.qty;
    });
    return { totalVolume, totalWeight };
  };

  // 建议柜型
  const suggestContainerType = (volume: number) => {
    if (volume <= 0) return "";
    if (volume <= 33) return "20GP";
    if (volume <= 67) return "40GP";
    return "40HQ";
  };

  // 添加产品
  const addItem = () => {
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        {
          variantId: "",
          sku: "",
          skuName: "",
          spec: "",
          qty: 1,
          unitVolumeCBM: 0,
          unitWeightKG: 0,
          totalVolumeCBM: 0,
          totalWeightKG: 0,
        },
      ],
    }));
  };

  // 更新产品
  const updateItem = async (index: number, field: string, value: any) => {
    setForm((f) => {
      const newItems = [...f.items];
      (newItems[index] as any)[field] = value;

      if (field === "variantId" && value) {
        const selected = variantOptions.find((v) => v.variantId === String(value));
        if (selected) {
          newItems[index].sku = selected.skuId;
          newItems[index].skuName = selected.productName;
          newItems[index].spec = selected.color || "";
          if (selected.weightKg) newItems[index].unitWeightKG = selected.weightKg;
        }
      }

      // 重新计算总计
      newItems[index].totalVolumeCBM = newItems[index].unitVolumeCBM * newItems[index].qty;
      newItems[index].totalWeightKG = newItems[index].unitWeightKG * newItems[index].qty;

      return { ...f, items: newItems };
    });

    // 选择 SKU 后，按箱规计算单件体积（箱体积/每箱数量）
    if (field === "variantId" && value) {
      const variantId = String(value);
      let boxSpec = boxSpecCache[variantId];
      if (boxSpec === undefined) {
        try {
          const res = await fetch(`/api/box-spec?variantId=${encodeURIComponent(variantId)}`);
          const list = res.ok ? await res.json() : [];
          boxSpec = Array.isArray(list) && list.length > 0 ? list[0] : null;
          setBoxSpecCache((prev) => ({ ...prev, [variantId]: boxSpec }));
        } catch {
          boxSpec = null;
          setBoxSpecCache((prev) => ({ ...prev, [variantId]: null }));
        }
      }
      if (boxSpec && boxSpec.boxLengthCm && boxSpec.boxWidthCm && boxSpec.boxHeightCm && boxSpec.qtyPerBox) {
        const perUnitVolume =
          (Number(boxSpec.boxLengthCm) * Number(boxSpec.boxWidthCm) * Number(boxSpec.boxHeightCm)) /
          1000000 /
          Number(boxSpec.qtyPerBox);
        const perUnitWeight =
          boxSpec.weightKg && boxSpec.qtyPerBox ? Number(boxSpec.weightKg) / Number(boxSpec.qtyPerBox) : undefined;
        setForm((f) => {
          const newItems = [...f.items];
          if (!newItems[index]) return f;
          newItems[index].unitVolumeCBM = perUnitVolume;
          if (perUnitWeight) newItems[index].unitWeightKG = perUnitWeight;
          newItems[index].totalVolumeCBM = newItems[index].unitVolumeCBM * newItems[index].qty;
          newItems[index].totalWeightKG = newItems[index].unitWeightKG * newItems[index].qty;
          return { ...f, items: newItems };
        });
      }
    }
  };

  // 删除产品
  const removeItem = (index: number) => {
    setForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== index),
    }));
  };

  // 保存预录单
  const handleSave = async () => {
    if (form.items.length === 0) {
      toast.error("请添加产品明细");
      return;
    }

    const { totalVolume, totalWeight } = calculateVolume(form.items);
    const suggested = suggestContainerType(totalVolume);

    setSaving(true);
    try {
      const payload = {
        ...form,
        loadingProductQty: form.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
        totalVolumeCBM: totalVolume,
        totalWeightKG: totalWeight,
        suggestedContainerType: suggested,
        items: form.items.map((item) => ({
          ...item,
          unitVolumeCBM: item.unitVolumeCBM,
          unitWeightKG: item.unitWeightKG,
          totalVolumeCBM: item.totalVolumeCBM,
          totalWeightKG: item.totalWeightKG,
        })),
      };

      const url = editingRecord ? `/api/container-pre-records/${editingRecord.id}` : "/api/container-pre-records";
      const method = editingRecord ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "保存失败");
      }

      toast.success(editingRecord ? "已更新" : "已创建");
      setIsModalOpen(false);
      setForm({
        name: "",
        notes: "",
        shippingMethod: "SEA",
        originPort: "",
        destinationPort: "",
        destinationCountry: "",
        loadingProductQty: 0,
        loadingLocation: "",
        formFilledAt: new Date().toISOString().slice(0, 16),
        loadingDate: "",
        shippingWarehouseId: "",
        shippingWarehouseName: "",
        loadingLogisticsCompany: "",
        exporterId: "",
        exporterName: "",
        overseasCompanyId: "",
        overseasCompanyName: "",
        warehouseId: "",
        warehouseName: "",
        platform: "",
        storeId: "",
        storeName: "",
        items: [],
      });
      setEditingRecord(null);
      mutate();
    } catch (err: any) {
      toast.error(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 编辑预录单
  const handleEdit = (record: PreRecord) => {
    setEditingRecord(record);
    setForm({
      name: record.name || "",
      notes: record.notes || "",
      shippingMethod: record.shippingMethod || "SEA",
      originPort: record.originPort || "",
      destinationPort: record.destinationPort || "",
      destinationCountry: record.destinationCountry || "",
      loadingProductQty: record.loadingProductQty || 0,
      loadingLocation: record.loadingLocation || "",
      formFilledAt: record.formFilledAt ? record.formFilledAt.slice(0, 16) : new Date().toISOString().slice(0, 16),
      loadingDate: record.loadingDate ? record.loadingDate.slice(0, 10) : "",
      shippingWarehouseId: record.shippingWarehouseId || "",
      shippingWarehouseName: record.shippingWarehouseName || "",
      loadingLogisticsCompany: record.loadingLogisticsCompany || "",
      exporterId: record.exporterId || "",
      exporterName: record.exporterName || "",
      overseasCompanyId: record.overseasCompanyId || "",
      overseasCompanyName: record.overseasCompanyName || "",
      warehouseId: record.warehouseId || "",
      warehouseName: record.warehouseName || "",
      platform: record.platform || "",
      storeId: record.storeId || "",
      storeName: record.storeName || "",
      items: record.items || [],
    });
    setIsModalOpen(true);
  };

  // 删除预录单
  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该预录单？")) return;
    try {
      const res = await fetch(`/api/container-pre-records/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      toast.success("已删除");
      mutate();
    } catch (err) {
      toast.error("删除失败");
    }
  };

  // 转柜
  const handleConvert = async () => {
    if (!convertForm.containerNo.trim()) {
      toast.error("请填写柜号");
      return;
    }

    setConvertingId(convertModal.record?.id || null);
    try {
      const res = await fetch(`/api/container-pre-records/${convertModal.record?.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(convertForm),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "转柜失败");
      }

      toast.success("已转为正式柜子");
      setConvertModal({ open: false, record: null });
      setConvertForm({ containerNo: "", containerType: "40HQ" });
      mutate();
    } catch (err: any) {
      toast.error(err.message || "转柜失败");
    } finally {
      setConvertingId(null);
    }
  };

  // 统计
  const stats = useMemo(() => {
    const total = preRecords.length;
    const draft = preRecords.filter((r) => r.status === "Draft").length;
    const confirmed = preRecords.filter((r) => r.status === "Confirmed").length;
    const converted = preRecords.filter((r) => r.status === "Converted").length;
    return { total, draft, confirmed, converted };
  }, [preRecords]);

  const calc = calculateVolume(form.items);
  const suggested = suggestContainerType(calc.totalVolume);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="柜子预录单"
        description="预先录入产品明细，计算体积后一键转为正式柜子"
        actions={
          <ActionButton variant="primary" icon={Plus} onClick={() => { setEditingRecord(null); setForm({ name: "", notes: "", shippingMethod: "SEA", originPort: "", destinationPort: "", destinationCountry: "", loadingProductQty: 0, loadingLocation: "", formFilledAt: new Date().toISOString().slice(0, 16), loadingDate: "", shippingWarehouseId: "", shippingWarehouseName: "", loadingLogisticsCompany: "", exporterId: "", exporterName: "", overseasCompanyId: "", overseasCompanyName: "", warehouseId: "", warehouseName: "", platform: "", storeId: "", storeName: "", items: [] }); setIsModalOpen(true); }}>
            新建预录单
          </ActionButton>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="预录单总数" value={stats.total} icon={Package} />
        <StatCard title="草稿" value={stats.draft} icon={Package} />
        <StatCard title="已确认" value={stats.confirmed} icon={Package} />
        <StatCard title="已转柜" value={stats.converted} icon={Truck} />
      </div>

      {/* 列表 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : preRecords.length === 0 ? (
          <EmptyState icon={Package} title="暂无预录单" description="点击上方按钮创建预录单" />
        ) : (
          <div className="divide-y divide-slate-800">
            {preRecords.map((record) => (
              <div key={record.id} className="p-4 hover:bg-slate-800/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-200">{record.name || "未命名"}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${statusColors[record.status]}`}>
                        {statusLabels[record.status] || record.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      产品: {record.loadingProductQty ?? record.itemCount}件 | 装柜产品总体积: {record.totalVolumeCBM ? parseFloat(record.totalVolumeCBM).toFixed(3) : 0} CBM | 重量: {record.totalWeightKG ? parseFloat(record.totalWeightKG).toFixed(2) : 0} KG
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      建议柜型: {record.suggestedContainerType || "-"} | 装柜地点: {record.loadingLocation || "-"} | 物流公司: {record.loadingLogisticsCompany || "-"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.status !== "Converted" && (
                      <>
                        <button
                          onClick={() => setConvertModal({ open: true, record })}
                          className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/30"
                        >
                          <ArrowRight className="h-3 w-3" />
                          转柜
                        </button>
                        <button
                          onClick={() => handleEdit(record)}
                          className="p-1.5 text-slate-400 hover:text-primary-400"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(record.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-slate-900 border border-slate-700">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">
                {editingRecord ? "编辑预录单" : "新建预录单"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">预录单名称</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                    placeholder="如：2024年第一批柜"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">运输方式</span>
                  <select
                    value={form.shippingMethod}
                    onChange={(e) => setForm({ ...form, shippingMethod: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  >
                    <option value="SEA">海运</option>
                    <option value="AIR">空运</option>
                    <option value="EXPRESS">快递</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">起运港</span>
                  <input
                    value={form.originPort}
                    onChange={(e) => setForm({ ...form, originPort: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">目的港</span>
                  <input
                    value={form.destinationPort}
                    onChange={(e) => setForm({ ...form, destinationPort: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">装柜地点</span>
                  <input
                    value={form.loadingLocation}
                    onChange={(e) => setForm({ ...form, loadingLocation: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                    placeholder="如：义乌仓A库"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">填表时间</span>
                  <input
                    type="datetime-local"
                    value={form.formFilledAt}
                    onChange={(e) => setForm({ ...form, formFilledAt: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">装柜日期</span>
                  <input
                    type="date"
                    value={form.loadingDate}
                    onChange={(e) => setForm({ ...form, loadingDate: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">发货仓库</span>
                  <select
                    value={form.shippingWarehouseId}
                    onChange={(e) => {
                      const w = warehouses.find((x: any) => x.id === e.target.value);
                      setForm({ ...form, shippingWarehouseId: e.target.value, shippingWarehouseName: w?.name || "" });
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  >
                    <option value="">请选择</option>
                    {warehouses.map((w: any) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">装柜物流公司</span>
                  <select
                    value={form.loadingLogisticsCompany}
                    onChange={(e) => setForm({ ...form, loadingLogisticsCompany: e.target.value })}
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
              </div>

              {/* 主体信息 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">出口公司</span>
                  <select
                    value={form.exporterId}
                    onChange={(e) => {
                      const exporter = exporters.find((ex) => ex.id === e.target.value);
                      setForm({ ...form, exporterId: e.target.value, exporterName: exporter?.name || "" });
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  >
                    <option value="">请选择</option>
                    {exporters.map((ex: any) => (
                      <option key={ex.id} value={ex.id}>{ex.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">海外公司</span>
                  <select
                    value={form.overseasCompanyId}
                    onChange={(e) => {
                      const company = overseasCompanies.find((c) => c.id === e.target.value);
                      setForm({ ...form, overseasCompanyId: e.target.value, overseasCompanyName: company?.name || "" });
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  >
                    <option value="">请选择</option>
                    {overseasCompanies.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">目的仓库</span>
                  <select
                    value={form.warehouseId}
                    onChange={(e) => {
                      const warehouse = warehouses.find((w) => w.id === e.target.value);
                      setForm({ ...form, warehouseId: e.target.value, warehouseName: warehouse?.name || "" });
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  >
                    <option value="">请选择</option>
                    {warehouses.filter((w: any) => w.type === "OVERSEAS").map((w: any) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">销售平台</span>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm({ ...form, platform: e.target.value })}
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
              </div>

              {/* 产品明细 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-300">产品明细</span>
                  <button onClick={addItem} className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                    <Plus className="h-3 w-3" /> 添加产品
                  </button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50">
                      <select
                        value={item.variantId}
                        onChange={(e) => { void updateItem(index, "variantId", e.target.value); }}
                        className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400"
                      >
                        <option value="">选择产品</option>
                        {variantOptions.map((v) => (
                          <option key={v.variantId} value={v.variantId}>
                            {v.productName} / {v.skuId}{v.color ? ` / ${v.color}` : ""}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => updateItem(index, "qty", parseInt(e.target.value) || 0)}
                        className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400"
                        placeholder="数量"
                      />
                      <span className="text-xs text-slate-400 w-24">
                        体积: {(item.unitVolumeCBM * item.qty).toFixed(4)} CBM
                      </span>
                      <button onClick={() => removeItem(index)} className="p-1 text-slate-400 hover:text-red-400">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 计算结果 */}
              <div className="p-3 rounded-lg bg-primary-500/10 border border-primary-500/30">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">装柜产品总数量: </span>
                    <span className="font-medium text-slate-200">{form.items.reduce((s, it) => s + (Number(it.qty) || 0), 0)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">装柜产品总体积: </span>
                    <span className="font-medium text-slate-200">{calc.totalVolume.toFixed(3)} CBM</span>
                  </div>
                  <div>
                    <span className="text-slate-400">总重量: </span>
                    <span className="font-medium text-slate-200">{calc.totalWeight.toFixed(2)} KG</span>
                  </div>
                  <div>
                    <span className="text-slate-400">建议柜型: </span>
                    <span className="font-medium text-primary-400">{suggested || "-"}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
                <button onClick={() => setIsModalOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:text-white">
                  取消
                </button>
                <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 转柜弹窗 */}
      {convertModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-700 p-4">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">转为正式柜子</h2>
            <div className="space-y-3">
              <div>
                <span className="text-sm text-slate-300">预录单: {convertModal.record?.name || "未命名"}</span>
                <div className="text-xs text-slate-500 mt-1">
                  体积: {convertModal.record?.totalVolumeCBM} CBM | 建议柜型: {convertModal.record?.suggestedContainerType}
                </div>
              </div>
              <label className="space-y-1 block">
                <span className="text-xs text-slate-300">柜号 *</span>
                <input
                  value={convertForm.containerNo}
                  onChange={(e) => setConvertForm({ ...convertForm, containerNo: e.target.value })}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  placeholder="如 MSKU1234567"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs text-slate-300">柜型</span>
                <select
                  value={convertForm.containerType}
                  onChange={(e) => setConvertForm({ ...convertForm, containerType: e.target.value })}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                >
                  <option value="20GP">20GP</option>
                  <option value="40GP">40GP</option>
                  <option value="40HQ">40HQ</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setConvertModal({ open: false, record: null })} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:text-white">
                取消
              </button>
              <button onClick={handleConvert} disabled={convertingId !== null} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
                {convertingId ? "转柜中..." : "确认转柜"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
