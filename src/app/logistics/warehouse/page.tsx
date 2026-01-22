"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Warehouse, Plus, Search, X, Download, Eye, Pencil, Trash2, Package, MapPin, Phone, Mail } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import { getProducts, type Product } from "@/lib/products-store";

// 仓库类型
type WarehouseInfo = {
  id: string;
  name: string; // 仓库名称
  code?: string; // 仓库编码
  address?: string; // 仓库地址
  contact?: string; // 联系人
  phone?: string; // 联系电话
  email?: string; // 邮箱
  capacity?: number; // 容量（平方米或立方米）
  type: "国内仓" | "海外仓" | "工厂仓" | "其他"; // 仓库类型
  status: "启用" | "停用"; // 状态
  notes?: string; // 备注
  createdAt: string;
  updatedAt: string;
};

const WAREHOUSES_KEY = "warehouses";

// 获取所有仓库
function getWarehouses(): WarehouseInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(WAREHOUSES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse warehouses", e);
    return [];
  }
}

// 保存仓库
function saveWarehouses(warehouses: WarehouseInfo[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WAREHOUSES_KEY, JSON.stringify(warehouses));
  } catch (e) {
    console.error("Failed to save warehouses", e);
  }
}

// 获取仓库库存（从产品数据中统计）
function getWarehouseInventory(warehouseName: string, products: Product[]): { sku: string; qty: number }[] {
  // 这里简化处理，实际应该根据入库批次记录来统计
  // 暂时返回空数组，后续可以根据入库批次数据来统计
  return [];
}

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

export default function WarehousePage() {
  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseInfo | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    contact: "",
    phone: "",
    email: "",
    capacity: "",
    type: "国内仓" as WarehouseInfo["type"],
    status: "启用" as WarehouseInfo["status"],
    notes: ""
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setWarehouses(getWarehouses());
    setProducts(getProducts());
  }, []);

  // 统计信息
  const stats = useMemo(() => {
    const total = warehouses.length;
    const active = warehouses.filter((w) => w.status === "启用").length;
    const domestic = warehouses.filter((w) => w.type === "国内仓").length;
    const overseas = warehouses.filter((w) => w.type === "海外仓").length;
    return { total, active, domestic, overseas };
  }, [warehouses]);

  // 筛选仓库
  const filteredWarehouses = useMemo(() => {
    let result = [...warehouses];

    // 类型筛选
    if (filterType !== "all") {
      result = result.filter((w) => w.type === filterType);
    }

    // 状态筛选
    if (filterStatus !== "all") {
      result = result.filter((w) => w.status === filterStatus);
    }

    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(keyword) ||
          w.code?.toLowerCase().includes(keyword) ||
          w.address?.toLowerCase().includes(keyword) ||
          w.contact?.toLowerCase().includes(keyword) ||
          w.phone?.toLowerCase().includes(keyword)
      );
    }

    return result.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  }, [warehouses, filterType, filterStatus, searchKeyword]);

  // 重置表单
  const resetForm = () => {
    setForm({
      name: "",
      code: "",
      address: "",
      contact: "",
      phone: "",
      email: "",
      capacity: "",
      type: "国内仓",
      status: "启用",
      notes: ""
    });
    setEditingWarehouse(null);
  };

  // 打开创建/编辑模态框
  const handleOpenModal = (warehouse?: WarehouseInfo) => {
    if (warehouse) {
      setEditingWarehouse(warehouse);
      setForm({
        name: warehouse.name,
        code: warehouse.code || "",
        address: warehouse.address || "",
        contact: warehouse.contact || "",
        phone: warehouse.phone || "",
        email: warehouse.email || "",
        capacity: warehouse.capacity?.toString() || "",
        type: warehouse.type,
        status: warehouse.status,
        notes: warehouse.notes || ""
      });
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  // 保存仓库
  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("请输入仓库名称");
      return;
    }

    if (editingWarehouse) {
      // 更新
      const updated = warehouses.map((w) =>
        w.id === editingWarehouse.id
          ? {
              ...w,
              ...form,
              capacity: form.capacity ? Number(form.capacity) : undefined,
              updatedAt: new Date().toISOString()
            }
          : w
      );
      setWarehouses(updated);
      saveWarehouses(updated);
      toast.success("仓库信息已更新");
    } else {
      // 创建
      const newWarehouse: WarehouseInfo = {
        id: crypto.randomUUID(),
        ...form,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const updated = [...warehouses, newWarehouse];
      setWarehouses(updated);
      saveWarehouses(updated);
      toast.success("仓库创建成功");
    }

    setIsModalOpen(false);
    resetForm();
  };

  // 删除仓库
  const handleDelete = (id: string) => {
    if (!confirm("确定要删除这个仓库吗？")) return;
    const updated = warehouses.filter((w) => w.id !== id);
    setWarehouses(updated);
    saveWarehouses(updated);
    toast.success("仓库已删除");
  };

  // 导出数据
  const handleExportData = () => {
    const csvRows = [
      ["仓库名称", "仓库编码", "类型", "地址", "联系人", "电话", "邮箱", "容量", "状态", "创建时间"].join(",")
    ];

    filteredWarehouses.forEach((w) => {
      csvRows.push([
        w.name,
        w.code || "",
        w.type,
        w.address || "",
        w.contact || "",
        w.phone || "",
        w.email || "",
        w.capacity?.toString() || "",
        w.status,
        formatDate(w.createdAt)
      ].join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `仓库列表_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast.success("数据已导出");
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="仓储管理"
        description="管理仓库信息，包括国内仓、海外仓、工厂仓等"
        actions={
          <div className="flex gap-2">
            <ActionButton onClick={() => handleOpenModal()} variant="primary" icon={Plus}>
              新增仓库
            </ActionButton>
            <ActionButton onClick={handleExportData} variant="secondary" icon={Download}>
              导出数据
            </ActionButton>
          </div>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="仓库总数" value={stats.total} icon={Warehouse} />
        <StatCard title="启用中" value={stats.active} icon={Package} />
        <StatCard title="国内仓" value={stats.domestic} icon={MapPin} />
        <StatCard title="海外仓" value={stats.overseas} icon={MapPin} />
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索仓库名称、编码、地址、联系人..."
        />

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">类型：</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            <option value="国内仓">国内仓</option>
            <option value="海外仓">海外仓</option>
            <option value="工厂仓">工厂仓</option>
            <option value="其他">其他</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">状态：</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            <option value="启用">启用</option>
            <option value="停用">停用</option>
          </select>
        </div>
      </div>

      {/* 仓库列表 */}
      {filteredWarehouses.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="暂无仓库"
          description='点击"新增仓库"按钮创建新仓库'
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWarehouses.map((warehouse) => (
            <div
              key={warehouse.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:bg-slate-800/40 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-slate-100">{warehouse.name}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        warehouse.status === "启用"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-slate-500/20 text-slate-300"
                      }`}
                    >
                      {warehouse.status}
                    </span>
                  </div>
                  {warehouse.code && (
                    <p className="text-sm text-slate-400">编码：{warehouse.code}</p>
                  )}
                  <p className="text-sm text-slate-300 mt-1">{warehouse.type}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenModal(warehouse)}
                    className="p-1.5 rounded text-slate-400 hover:text-primary-300 hover:bg-primary-500/10 transition-colors"
                    title="编辑"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(warehouse.id)}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {warehouse.address && (
                  <div className="flex items-start gap-2 text-slate-300">
                    <MapPin className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <span>{warehouse.address}</span>
                  </div>
                )}
                {warehouse.contact && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-slate-400">联系人：</span>
                    <span>{warehouse.contact}</span>
                  </div>
                )}
                {warehouse.phone && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{warehouse.phone}</span>
                  </div>
                )}
                {warehouse.email && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span>{warehouse.email}</span>
                  </div>
                )}
                {warehouse.capacity && (
                  <div className="text-slate-400">
                    容量：{warehouse.capacity} m²
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建/编辑模态框 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">
                  {editingWarehouse ? "编辑仓库" : "新增仓库"}
                </h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">仓库名称 *</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">仓库编码</span>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>

                <label className="block space-y-1 col-span-2">
                  <span className="text-sm text-slate-300">仓库地址</span>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">联系人</span>
                  <input
                    type="text"
                    value={form.contact}
                    onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">联系电话</span>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">邮箱</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">容量 (m²)</span>
                  <input
                    type="number"
                    min={0}
                    value={form.capacity}
                    onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">仓库类型 *</span>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as WarehouseInfo["type"] }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  >
                    <option value="国内仓">国内仓</option>
                    <option value="海外仓">海外仓</option>
                    <option value="工厂仓">工厂仓</option>
                    <option value="其他">其他</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">状态 *</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as WarehouseInfo["status"] }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  >
                    <option value="启用">启用</option>
                    <option value="停用">停用</option>
                  </select>
                </label>

                <label className="block space-y-1 col-span-2">
                  <span className="text-sm text-slate-300">备注</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    placeholder="可选：仓库相关备注信息"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <ActionButton type="button" onClick={() => setIsModalOpen(false)} variant="secondary">
                  取消
                </ActionButton>
                <ActionButton type="submit" variant="primary">
                  {editingWarehouse ? "保存" : "创建"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
