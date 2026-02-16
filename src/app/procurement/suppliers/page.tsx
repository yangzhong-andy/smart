"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Factory, TrendingUp, DollarSign, Search, X, Download, Pencil, Trash2, Building2, Package, ChevronDown, ChevronUp, ExternalLink, MapPin } from "lucide-react";
import {
  PageHeader, StatCard, ActionButton,
  SearchBar, EmptyState
} from "@/components/ui";
import {
  useSuppliers,
  useSupplierActions,
  formatDate,
  formatDateTime
} from "@/procurement/hooks";
import type { Supplier, SupplierFormData } from "@/procurement/types";

// 供应商等级颜色
const getLevelColor = (level?: string) => {
  switch (level) {
    case "S": return "text-purple-300 bg-purple-500/20";
    case "A": return "text-blue-300 bg-blue-500/20";
    case "B": return "text-emerald-300 bg-emerald-500/20";
    case "C": return "text-slate-300 bg-slate-700/40";
    default: return "text-slate-400 bg-slate-800/40";
  }
};

// 格式化数字
const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

// 初始表单数据
const initialFormData: SupplierFormData = {
  name: "",
  contact: "",
  phone: "",
  depositRate: "",
  tailPeriodDays: "",
  settleBase: "SHIPMENT",
  level: "",
  category: "",
  address: "",
  bankAccount: "",
  bankName: "",
  taxId: "",
  invoiceRequirement: "",
  invoicePoint: "",
  defaultLeadTime: "",
  moq: "",
  factoryImages: ""
};

export default function SuppliersPage() {
  // 使用统一 Hooks
  const { suppliers, isLoading, mutate } = useSuppliers();
  const { createSupplier, updateSupplier, deleteSupplier } = useSupplierActions();

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterLevel, setFilterLevel] = useState("all");
  
  // Modal 状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 统计信息
  const stats = useMemo(() => ({
    total: suppliers.length,
    avgDepositRate: suppliers.length > 0 
      ? suppliers.reduce((sum, s) => sum + s.depositRate, 0) / suppliers.length 
      : 0,
    avgTailPeriod: suppliers.length > 0 
      ? suppliers.reduce((sum, s) => sum + s.tailPeriodDays, 0) / suppliers.length 
      : 0,
    sLevelCount: suppliers.filter(s => s.level === "S").length
  }), [suppliers]);

  // 筛选供应商
  const filteredSuppliers = useMemo(() => {
    let result = [...suppliers];

    // 等级筛选
    if (filterLevel !== "all") {
      result = result.filter(s => s.level === filterLevel);
    }

    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(keyword) ||
        s.contact?.toLowerCase().includes(keyword) ||
        s.phone?.toLowerCase().includes(keyword) ||
        s.category?.toLowerCase().includes(keyword) ||
        s.address?.toLowerCase().includes(keyword)
      );
    }

    // 默认按名称排序
    result.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

    return result;
  }, [suppliers, filterLevel, searchKeyword]);

  // 获取所有分类
  const categories = useMemo(() => {
    const cats = new Set(suppliers.map(s => s.category).filter(Boolean));
    return Array.from(cats);
  }, [suppliers]);

  // 打开 Modal
  const handleOpenModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setForm({
        name: supplier.name,
        contact: supplier.contact || "",
        phone: supplier.phone || "",
        depositRate: supplier.depositRate.toString(),
        tailPeriodDays: supplier.tailPeriodDays.toString(),
        settleBase: supplier.settleBase,
        level: supplier.level || "",
        category: supplier.category || "",
        address: supplier.address || "",
        bankAccount: supplier.bankAccount || "",
        bankName: supplier.bankName || "",
        taxId: supplier.taxId || "",
        invoiceRequirement: supplier.invoiceRequirement || "",
        invoicePoint: supplier.invoicePoint?.toString() || "",
        defaultLeadTime: supplier.defaultLeadTime?.toString() || "",
        moq: supplier.moq?.toString() || "",
        factoryImages: ""
      });
    } else {
      setEditingSupplier(null);
      setForm(initialFormData);
    }
    setIsModalOpen(true);
  };

  // 关闭 Modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
    setForm(initialFormData);
  };

  // 保存供应商
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.contact.trim() || !form.phone.trim()) {
      toast.error("请填写供应商名称、联系人、手机号");
      return;
    }

    const depositRate = Number(form.depositRate);
    const tailPeriodDays = Number(form.tailPeriodDays);

    if (Number.isNaN(depositRate) || Number.isNaN(tailPeriodDays)) {
      toast.error("定金比例和尾款账期需为数字");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        depositRate,
        tailPeriodDays,
        settleBase: form.settleBase,
        level: form.level || null,
        category: form.category.trim() || null,
        address: form.address.trim() || null,
        bankAccount: form.bankAccount.trim() || null,
        bankName: form.bankName.trim() || null,
        taxId: form.taxId.trim() || null,
        invoiceRequirement: form.invoiceRequirement || null,
        invoicePoint: form.invoicePoint ? Number(form.invoicePoint) : null,
        defaultLeadTime: form.defaultLeadTime ? Number(form.defaultLeadTime) : null,
        moq: form.moq ? Number(form.moq) : null,
      };

      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, payload);
      } else {
        await createSupplier(payload);
      }

      handleCloseModal();
      toast.success(editingSupplier ? "供应商已更新" : "供应商已创建");
    } catch (error) {
      toast.error("操作失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 删除供应商
  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个供应商吗？此操作不可恢复！")) return;

    const success = await deleteSupplier(id);
    if (success) {
      toast.success("供应商已删除");
    }
  };

  // 导出数据
  const handleExport = () => {
    if (filteredSuppliers.length === 0) {
      toast.error("没有可导出的数据");
      return;
    }

    const headers = [
      "供应商名称", "联系人", "手机号", "等级", "类目", "地址",
      "定金比例", "尾款账期", "结算基准", "银行账号", "开户行", "税号"
    ];

    const rows = filteredSuppliers.map(s => [
      s.name, s.contact || "", s.phone || "", s.level || "", s.category || "", s.address || "",
      formatNumber(s.depositRate), String(s.tailPeriodDays), s.settleBase,
      s.bankAccount || "", s.bankName || "", s.taxId || ""
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `供应商_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast.success(`已导出 ${filteredSuppliers.length} 条数据`);
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="供应商库"
        description="管理工厂档案，支持多工厂、多品类维度"
        actions={
          <div className="flex gap-2">
            <ActionButton onClick={handleExport} variant="secondary" icon={Download}>
              导出数据
            </ActionButton>
            <ActionButton onClick={() => handleOpenModal()} variant="primary" icon={Factory}>
              新增供应商
            </ActionButton>
          </div>
        }
      />

      {/* 统计面板 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="总供应商数" value={stats.total} icon={Building2} />
        <StatCard title="平均定金比例" value={`${formatNumber(stats.avgDepositRate)}%`} icon={DollarSign} />
        <StatCard title="平均账期" value={`${formatNumber(stats.avgTailPeriod)}天`} icon={TrendingUp} />
        <StatCard title="S级供应商" value={stats.sLevelCount} icon={Factory} />
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索名称、联系人、地址..."
        />

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">等级：</span>
          <div className="flex gap-1">
            {["all", "S", "A", "B", "C"].map(level => (
              <button
                key={level}
                onClick={() => setFilterLevel(level)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterLevel === level
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {level === "all" ? "全部" : `${level}级`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 供应商列表 */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="暂无供应商"
          description='点击"新增供应商"按钮创建'
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map(supplier => (
            <SupplierCard
              key={supplier.id}
              supplier={supplier}
              onEdit={() => handleOpenModal(supplier)}
              onDelete={() => handleDelete(supplier.id)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <SupplierModal
          form={form}
          setForm={setForm}
          isEditing={!!editingSupplier}
          isSubmitting={isSubmitting}
          onSave={handleSave}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

// ==================== 供应商卡片组件 ====================

interface SupplierCardProps {
  supplier: Supplier;
  onEdit: () => void;
  onDelete: () => void;
}

function SupplierCard({ supplier, onEdit, onDelete }: SupplierCardProps) {
  const levelColor = getLevelColor(supplier.level);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:bg-slate-800/40 transition-all">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-white/10 p-2">
            <Factory className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-medium text-white">{supplier.name}</h3>
            {supplier.category && (
              <p className="text-xs text-slate-400">{supplier.category}</p>
            )}
          </div>
        </div>
        {supplier.level && (
          <span className={`px-2 py-0.5 rounded text-xs ${levelColor}`}>
            {supplier.level}级
          </span>
        )}
      </div>

      {/* 信息 */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">联系人</span>
          <span className="text-slate-300">{supplier.contact}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">手机号</span>
          <span className="text-slate-300 font-mono">{supplier.phone}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">定金比例</span>
          <span className="text-emerald-300">{supplier.depositRate}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">尾款账期</span>
          <span className="text-blue-300">{supplier.tailPeriodDays}天</span>
        </div>
      </div>

      {/* 操作 */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-800">
        <button
          onClick={onEdit}
          className="flex-1 rounded-lg bg-primary-500/20 px-3 py-2 text-xs text-primary-300 hover:bg-primary-500/30 transition-colors"
        >
          编辑
        </button>
        <button
          onClick={onDelete}
          className="flex-1 rounded-lg bg-rose-500/20 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/30 transition-colors"
        >
          删除
        </button>
      </div>
    </div>
  );
}

// ==================== 供应商表单 Modal ====================

interface SupplierModalProps {
  form: SupplierFormData;
  setForm: React.Dispatch<React.SetStateAction<SupplierFormData>>;
  isEditing: boolean;
  isSubmitting: boolean;
  onSave: (e: React.FormEvent) => void;
  onClose: () => void;
}

function SupplierModal({ form, setForm, isEditing, isSubmitting, onSave, onClose }: SupplierModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">
              {isEditing ? "编辑供应商" : "新增供应商"}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* 基本信息 */}
            <label className="block space-y-1">
              <span className="text-sm text-slate-300">名称 *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">联系人 *</span>
              <input
                type="text"
                value={form.contact}
                onChange={(e) => setForm(f => ({ ...f, contact: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">手机号 *</span>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                required
              />
            </label>

            {/* 财务信息 */}
            <label className="block space-y-1">
              <span className="text-sm text-slate-300">定金比例(%) *</span>
              <input
                type="number"
                step="0.01"
                value={form.depositRate}
                onChange={(e) => setForm(f => ({ ...f, depositRate: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">尾款账期(天) *</span>
              <input
                type="number"
                value={form.tailPeriodDays}
                onChange={(e) => setForm(f => ({ ...f, tailPeriodDays: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">结算基准</span>
              <select
                value={form.settleBase}
                onChange={(e) => setForm(f => ({ ...f, settleBase: e.target.value as any }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="SHIPMENT">发货</option>
                <option value="INBOUND">入库</option>
              </select>
            </label>

            {/* 其他信息 */}
            <label className="block space-y-1">
              <span className="text-sm text-slate-300">供应商等级</span>
              <select
                value={form.level}
                onChange={(e) => setForm(f => ({ ...f, level: e.target.value as any }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              >
                <option value="">请选择</option>
                <option value="S">S级</option>
                <option value="A">A级</option>
                <option value="B">B级</option>
                <option value="C">C级</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">主营类目</span>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>

            <label className="block space-y-1 col-span-2">
              <span className="text-sm text-slate-300">详细地址</span>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>

            {/* 银行信息 */}
            <label className="block space-y-1">
              <span className="text-sm text-slate-300">银行账号</span>
              <input
                type="text"
                value={form.bankAccount}
                onChange={(e) => setForm(f => ({ ...f, bankAccount: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">开户行</span>
              <input
                type="text"
                value={form.bankName}
                onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-slate-300">纳税人识别号</span>
              <input
                type="text"
                value={form.taxId}
                onChange={(e) => setForm(f => ({ ...f, taxId: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
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
