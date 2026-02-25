"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { 
  Warehouse, Plus, Download, Pencil, Trash2, 
  MapPin, Phone, Mail, X, Package 
} from "lucide-react";
import { 
  PageHeader, StatCard, ActionButton, 
  SearchBar, EmptyState 
} from "@/components/ui";
import {
  useWarehouses,
  useWarehouseActions,
  formatDate
} from "@/logistics/hooks";
import {
  Warehouse as WarehouseType,
  WarehouseLocation
} from "@/logistics/types";
import {
  LOCATION_OPTIONS,
  WAREHOUSE_TYPE_LABELS
} from "@/logistics/constants";

// 表单数据类型
interface WarehouseFormData {
  name: string;
  code: string;
  address: string;
  contact: string;
  phone: string;
  manager: string;
  email: string;
  capacity: string;
  locationType: "国内仓" | "海外仓" | "工厂仓" | "其他";
  warehouseType: "DOMESTIC" | "OVERSEAS";
  status: "启用" | "停用";
  notes: string;
}

// 位置反向映射
const LOCATION_REVERSE_MAP: Record<string, WarehouseLocation> = {
  "工厂仓": "FACTORY",
  "国内仓": "DOMESTIC",
  "海外仓": "OVERSEAS",
  "其他": "TRANSIT"
};

// 初始表单数据
const initialFormData: WarehouseFormData = {
  name: "",
  code: "",
  address: "",
  contact: "",
  phone: "",
  manager: "",
  email: "",
  capacity: "",
  locationType: "国内仓",
  warehouseType: "DOMESTIC",
  status: "启用",
  notes: ""
};

export default function WarehousePage() {
  // 使用统一 Hook 获取数据
  const { warehouses, isLoading, mutate } = useWarehouses();
  const { createWarehouse, updateWarehouse, deleteWarehouse } = useWarehouseActions();

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  // Modal 状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseType | null>(null);
  const [form, setForm] = useState<WarehouseFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const list = Array.isArray(warehouses) ? warehouses : [];

  // 统计信息
  const stats = useMemo(() => ({
    total: list.length,
    active: list.filter(w => w.isActive).length,
    domestic: list.filter(w => w.location === "DOMESTIC").length,
    overseas: list.filter(w => w.location === "OVERSEAS").length
  }), [list]);

  // 筛选仓库
  const filteredWarehouses = useMemo(() => {
    let result = [...list];

    // 类型筛选
    if (filterType !== "all") {
      result = result.filter(w => {
        const locLabel = w.location === "DOMESTIC" ? "国内仓" : 
                        w.location === "OVERSEAS" ? "海外仓" : 
                        w.location === "FACTORY" ? "工厂仓" : "其他";
        return locLabel === filterType;
      });
    }

    // 状态筛选
    if (filterStatus !== "all") {
      const statusFilter = filterStatus === "启用";
      result = result.filter(w => w.isActive === statusFilter);
    }

    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(w =>
        w.name.toLowerCase().includes(keyword) ||
        w.code?.toLowerCase().includes(keyword) ||
        w.address?.toLowerCase().includes(keyword) ||
        w.contact?.toLowerCase().includes(keyword) ||
        w.phone?.toLowerCase().includes(keyword)
      );
    }

    return result.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  }, [list, filterType, filterStatus, searchKeyword]);

  // 打开 Modal
  const handleOpenModal = (warehouse?: WarehouseType) => {
    if (warehouse) {
      setEditingWarehouse(warehouse);
      const locLabel = warehouse.location === "DOMESTIC" ? "国内仓" : 
                       warehouse.location === "OVERSEAS" ? "海外仓" : 
                       warehouse.location === "FACTORY" ? "工厂仓" : "其他";
      setForm({
        name: warehouse.name,
        code: warehouse.code || "",
        address: warehouse.address || "",
        contact: warehouse.contact || "",
        phone: warehouse.phone || "",
        manager: warehouse.manager || "",
        email: warehouse.email || "",
        capacity: warehouse.capacity?.toString() || "",
        locationType: locLabel,
        warehouseType: warehouse.type,
        status: warehouse.isActive ? "启用" : "停用",
        notes: warehouse.notes || ""
      });
    } else {
      setEditingWarehouse(null);
      setForm(initialFormData);
    }
    setIsModalOpen(true);
  };

  // 关闭 Modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingWarehouse(null);
    setForm(initialFormData);
  };

  // 保存仓库
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("请输入仓库名称");
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        address: form.address.trim() || undefined,
        contact: form.contact.trim() || undefined,
        phone: form.phone.trim() || undefined,
        manager: form.manager.trim() || undefined,
        email: form.email.trim() || undefined,
        location: LOCATION_REVERSE_MAP[form.locationType],
        type: form.warehouseType,
        isActive: form.status === "启用",
        capacity: form.capacity ? Number(form.capacity) : undefined,
        notes: form.notes.trim() || undefined
      };

      if (editingWarehouse) {
        await updateWarehouse(editingWarehouse.id, payload);
      } else {
        await createWarehouse(payload);
      }

      handleCloseModal();
    } catch (error) {
      console.error("保存失败:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 删除仓库
  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个仓库吗？")) return;
    
    const success = await deleteWarehouse(id);
    if (success) {
      toast.success("仓库已删除");
    }
  };

  // 导出数据
  const handleExport = () => {
    const headers = ["仓库名称", "仓库编码", "类型", "地址", "联系人", "电话", "邮箱", "容量", "状态", "创建时间"];
    const rows = filteredWarehouses.map(w => [
      w.name,
      w.code || "",
      w.type === "OVERSEAS" ? "海外仓" : "国内仓",
      w.address || "",
      w.contact || "",
      w.phone || "",
      w.email || "",
      w.capacity?.toString() || "",
      w.isActive ? "启用" : "停用",
      formatDate(w.createdAt)
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `仓库列表_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast.success("数据已导出");
  };

  // 位置类型标签
  const getLocationLabel = (location: WarehouseLocation) => {
    const map: Record<WarehouseLocation, string> = {
      FACTORY: "工厂仓",
      DOMESTIC: "国内仓",
      TRANSIT: "中转仓",
      OVERSEAS: "海外仓"
    };
    return map[location] || "其他";
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
            <ActionButton onClick={handleExport} variant="secondary" icon={Download}>
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
          placeholder="搜索仓库名称、编码、地址..."
        />

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
        >
          <option value="all">全部类型</option>
          <option value="国内仓">国内仓</option>
          <option value="海外仓">海外仓</option>
          <option value="工厂仓">工厂仓</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
        >
          <option value="all">全部状态</option>
          <option value="启用">启用</option>
          <option value="停用">停用</option>
        </select>
      </div>

      {/* 仓库列表 */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : filteredWarehouses.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="暂无仓库"
          description='点击"新增仓库"按钮创建新仓库'
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWarehouses.map((warehouse) => (
            <WarehouseCard
              key={warehouse.id}
              warehouse={warehouse}
              onEdit={() => handleOpenModal(warehouse)}
              onDelete={() => handleDelete(warehouse.id)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <WarehouseModal
          form={form}
          setForm={setForm}
          isEditing={!!editingWarehouse}
          isSubmitting={isSubmitting}
          onSave={handleSave}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

// ==================== 仓库卡片组件 ====================

interface WarehouseCardProps {
  warehouse: WarehouseType;
  onEdit: () => void;
  onDelete: () => void;
}

function WarehouseCard({ warehouse, onEdit, onDelete }: WarehouseCardProps) {
  const getLocationLabel = (location: WarehouseLocation) => {
    const map: Record<WarehouseLocation, string> = {
      FACTORY: "工厂仓",
      DOMESTIC: "国内仓",
      TRANSIT: "中转仓",
      OVERSEAS: "海外仓"
    };
    return map[location] || "其他";
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:bg-slate-800/40 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-semibold text-slate-100">{warehouse.name}</h3>
            <span className={`px-2 py-0.5 rounded text-xs ${
              warehouse.isActive
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-slate-500/20 text-slate-300"
            }`}>
              {warehouse.isActive ? "启用" : "停用"}
            </span>
          </div>
          {warehouse.code && (
            <p className="text-sm text-slate-400">编码：{warehouse.code}</p>
          )}
          <p className="text-sm text-slate-300 mt-1">
            {warehouse.type === "OVERSEAS" ? "海外仓" : "国内仓"} · {getLocationLabel(warehouse.location)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="p-1.5 rounded text-slate-400 hover:text-primary-300 hover:bg-primary-500/10 transition-colors"
            title="编辑"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
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
  );
}

// ==================== 仓库表单 Modal ====================

interface WarehouseModalProps {
  form: WarehouseFormData;
  setForm: React.Dispatch<React.SetStateAction<WarehouseFormData>>;
  isEditing: boolean;
  isSubmitting: boolean;
  onSave: (e: React.FormEvent) => void;
  onClose: () => void;
}

function WarehouseModal({ form, setForm, isEditing, isSubmitting, onSave, onClose }: WarehouseModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">
              {isEditing ? "编辑仓库" : "新增仓库"}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-sm text-slate-300">仓库名称 *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">仓库编码</span>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>

            <label className="block space-y-1 col-span-2">
              <span className="text-sm text-slate-300">仓库地址</span>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">联系人</span>
              <input
                type="text"
                value={form.contact}
                onChange={(e) => setForm(f => ({ ...f, contact: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">联系电话</span>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">邮箱</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">容量 (m²)</span>
              <input
                type="number"
                min={0}
                value={form.capacity}
                onChange={(e) => setForm(f => ({ ...f, capacity: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">位置类型</span>
              <select
                value={form.locationType}
                onChange={(e) => setForm(f => ({ ...f, locationType: e.target.value as any }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="国内仓">国内仓</option>
                <option value="海外仓">海外仓</option>
                <option value="工厂仓">工厂仓</option>
                <option value="其他">其他</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">仓库类型 *</span>
              <select
                value={form.warehouseType}
                onChange={(e) => setForm(f => ({ ...f, warehouseType: e.target.value as any }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="DOMESTIC">国内仓（国内中转）</option>
                <option value="OVERSEAS">海外仓（海外分发）</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">状态 *</span>
              <select
                value={form.status}
                onChange={(e) => setForm(f => ({ ...f, status: e.target.value as any }))}
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
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                placeholder="可选：仓库相关备注信息"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <ActionButton type="button" onClick={onClose} variant="secondary">
              取消
            </ActionButton>
            <ActionButton 
              type="submit" 
              variant="primary" 
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {isSubmitting 
                ? (isEditing ? "保存中..." : "创建中...") 
                : (isEditing ? "保存" : "创建")}
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}
