"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate as swrMutate } from "swr";
import ImageUploader from "@/components/ImageUploader";
import { Factory, TrendingUp, DollarSign, Search, X, SortAsc, SortDesc, Download, Pencil, Trash2, Building2, Package, ChevronDown, ChevronUp, ExternalLink, MapPin } from "lucide-react";
import { getProductsFromAPI, type Product } from "@/lib/products-store";
import { SETTLE_BASE_LABEL, INVOICE_REQUIREMENT_LABEL } from "@/lib/enum-mapping";

type Supplier = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  depositRate: number;
  tailPeriodDays: number;
  settleBase: "SHIPMENT" | "INBOUND";
  // 新增字段
  level?: "S" | "A" | "B" | "C"; // 供应商等级
  category?: string; // 主营类目
  address?: string; // 详细地址
  bankAccount?: string; // 银行账号
  bankName?: string; // 开户行
  taxId?: string; // 纳税人识别号
  invoiceRequirement?: "SPECIAL_INVOICE" | "GENERAL_INVOICE" | "NO_INVOICE"; // 发票要求
  invoicePoint?: number; // 开票点数（%）
  defaultLeadTime?: number; // 默认生产周期（天）
  moq?: number; // 起订量 (MOQ)
  factoryImages?: string | string[]; // 工厂实拍图
  createdAt?: string; // 创建时间
};

// SWR fetcher
const fetcher = (url: string) => fetch(url).then(res => res.json());

// 格式化数字
const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

export default function SuppliersPage() {
  const [mounted, setMounted] = useState(false);
  
  // 使用 SWR 加载供应商数据
  const { data: suppliersRaw, error: suppliersError, isLoading: suppliersLoading, mutate: mutateSuppliers } = useSWR<any>('/api/suppliers?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    keepPreviousData: true,
    dedupingInterval: 600000,
    onError: (error) => {
      console.error('Failed to load suppliers:', error);
      toast.error('加载供应商数据失败，请检查网络连接');
    }
  });
  const suppliers = (Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data ?? [])) as Supplier[];

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: productsDataRaw } = useSWR<any>('/api/products?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 600000
  });
  const productsData = (Array.isArray(productsDataRaw) ? productsDataRaw : (productsDataRaw?.data ?? productsDataRaw?.list ?? [])) as Product[];
  const products = productsData;
  const initialized = !suppliersLoading;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  // 搜索、筛选、排序状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSettleBase, setFilterSettleBase] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "depositRate" | "tailPeriod" | "none">("none");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [hoveredSupplierId, setHoveredSupplierId] = useState<string | null>(null);
  const [expandedSupplierIds, setExpandedSupplierIds] = useState<Set<string>>(new Set());
  const [buttonHoveredSupplierId, setButtonHoveredSupplierId] = useState<string | null>(null);
  const [imageViewModal, setImageViewModal] = useState<{ images: string[]; currentIndex: number } | null>(null);
  
  const [form, setForm] = useState({
    name: "",
    contact: "",
    phone: "",
    depositRate: "",
    tailPeriodDays: "",
    settleBase: "SHIPMENT" as "SHIPMENT" | "INBOUND",
    level: "" as "" | "S" | "A" | "B" | "C",
    category: "",
    address: "",
    bankAccount: "",
    bankName: "",
    taxId: "",
    invoiceRequirement: "" as "" | "SPECIAL_INVOICE" | "GENERAL_INVOICE" | "NO_INVOICE",
    invoicePoint: "",
    defaultLeadTime: "",
    moq: "",
    factoryImages: "" as string | string[]
  });

  // 数据已通过 SWR 加载，无需 useEffect

  // 获取所有分类
  const categories = useMemo(() => {
    if (!suppliers || !Array.isArray(suppliers)) return [];
    const cats = suppliers
      .map((s) => s.category)
      .filter((c): c is string => !!c);
    return Array.from(new Set(cats)).sort();
  }, [suppliers]);

  // 筛选和排序后的供应商列表
  const filteredSuppliers = useMemo(() => {
    if (!suppliers || !Array.isArray(suppliers)) return [];
    let result = [...suppliers];
    
    // 1. 等级筛选
    if (filterLevel !== "all") {
      result = result.filter((s) => s.level === filterLevel);
    }
    
    // 2. 分类筛选
    if (filterCategory !== "all") {
      result = result.filter((s) => s.category === filterCategory);
    }
    
    // 3. 结算基准筛选
    if (filterSettleBase !== "all") {
      result = result.filter((s) => s.settleBase === filterSettleBase);
    }
    
    // 4. 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((s) =>
        s.name.toLowerCase().includes(keyword) ||
        s.contact.toLowerCase().includes(keyword) ||
        s.phone.toLowerCase().includes(keyword) ||
        (s.category && s.category.toLowerCase().includes(keyword)) ||
        (s.address && s.address.toLowerCase().includes(keyword))
      );
    }
    
    // 5. 排序
    if (sortBy !== "none") {
      result.sort((a, b) => {
        let aVal: any;
        let bVal: any;
        
        switch (sortBy) {
          case "name":
            aVal = a.name;
            bVal = b.name;
            break;
          case "depositRate":
            aVal = a.depositRate;
            bVal = b.depositRate;
            break;
          case "tailPeriod":
            aVal = a.tailPeriodDays;
            bVal = b.tailPeriodDays;
            break;
          default:
            return 0;
        }
        
        if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
        if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      // 默认按名称排序
      result.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    }
    
    return result;
  }, [suppliers, filterLevel, filterCategory, filterSettleBase, searchKeyword, sortBy, sortOrder]);

  // 供应商统计摘要
  const supplierSummary = useMemo(() => {
    const totalCount = filteredSuppliers.length;
    const levelCounts = {
      S: filteredSuppliers.filter((s) => s.level === "S").length,
      A: filteredSuppliers.filter((s) => s.level === "A").length,
      B: filteredSuppliers.filter((s) => s.level === "B").length,
      C: filteredSuppliers.filter((s) => s.level === "C").length
    };
    const avgDepositRate = totalCount > 0
      ? filteredSuppliers.reduce((sum, s) => sum + s.depositRate, 0) / totalCount
      : 0;
    const avgTailPeriod = totalCount > 0
      ? filteredSuppliers.reduce((sum, s) => sum + s.tailPeriodDays, 0) / totalCount
      : 0;
    
    return {
      totalCount,
      levelCounts,
      avgDepositRate,
      avgTailPeriod
    };
  }, [filteredSuppliers]);

  // 获取供应商关联的产品信息（使用 API 数据）
  const getSupplierProducts = (supplierId: string): Product[] => {
    if (!products || products.length === 0) return [];
    const supplier = suppliers.find((s) => s.id === supplierId);
    const productsByFactoryId = products.filter((p) => {
      if (p.factory_id === supplierId) return true;
      if (p.suppliers && Array.isArray(p.suppliers)) {
        return p.suppliers.some((s) => s.id === supplierId);
      }
      return false;
    });
    if (supplier) {
      const productsByName = products.filter(
        (p) => p.factory_name === supplier.name && !p.factory_id
      );
      const allLinkedProducts = [...productsByFactoryId, ...productsByName];
      return allLinkedProducts.filter(
        (product, index, self) => index === self.findIndex((p) => p.sku_id === product.sku_id)
      );
    }
    return productsByFactoryId;
  };

  // 获取供应商产品统计
  const getSupplierProductStats = (supplierId: string) => {
    const products = getSupplierProducts(supplierId);
    const totalProducts = products.length;
    const categories = products
      .map((p) => p.category)
      .filter((c): c is string => !!c);
    const categoryCounts: Record<string, number> = {};
    categories.forEach((cat) => {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const mainCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    
    return {
      totalProducts,
      mainCategory,
      categoryCounts
    };
  };

  // 导出供应商数据
  const handleExportData = () => {
    if (filteredSuppliers.length === 0) {
      toast.error("没有可导出的数据");
      return;
    }

    const headers = [
      "供应商名称",
      "联系人",
      "手机号",
      "供应商等级",
      "主营类目",
      "详细地址",
      "定金比例(%)",
      "尾款账期(天)",
      "结算基准",
      "银行账号",
      "开户行",
      "纳税人识别号",
      "发票要求",
      "开票点数(%)",
      "默认生产周期(天)",
      "起订量(MOQ)"
    ];

    const rows = filteredSuppliers.map((s) => {
      return [
        s.name || "",
        s.contact || "",
        s.phone || "",
        s.level || "",
        s.category || "",
        s.address || "",
        formatNumber(s.depositRate),
        String(s.tailPeriodDays),
        s.settleBase || "",
        s.bankAccount || "",
        s.bankName || "",
        s.taxId || "",
        s.invoiceRequirement || "",
        s.invoicePoint ? formatNumber(s.invoicePoint) : "",
        s.defaultLeadTime ? String(s.defaultLeadTime) : "",
        s.moq ? String(s.moq) : ""
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `供应商库_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`已导出 ${filteredSuppliers.length} 条供应商数据`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("⚠️ 确定要删除这个供应商吗？\n此操作不可恢复！")) return;
    
    try {
      const response = await fetch(`/api/suppliers/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        await mutateSuppliers((prev: Supplier[] | undefined) => (prev || []).filter((item) => item.id !== id));
        toast.success("供应商已删除");
      } else {
        const error = await response.json();
        toast.error(error.error || "删除失败");
      }
    } catch (error) {
      console.error('Error deleting supplier:', error);
      toast.error("网络错误，请稍后重试");
    }
  };

  const resetForm = () => {
    setForm({
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
    });
    setEditingSupplier(null);
  };

  const handleOpenModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setForm({
        name: supplier.name,
        contact: supplier.contact,
        phone: supplier.phone,
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
        factoryImages: supplier.factoryImages || ""
      });
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // 防止重复提交
    if (isSubmitting) {
      toast.loading("正在提交，请勿重复点击");
      return;
    }
    
    if (!form.name.trim() || !form.contact.trim() || !form.phone.trim()) {
      toast.error("请填写供应商名称、联系人、手机号");
      return;
    }
    const depositRateNum = Number(form.depositRate);
    const tailPeriodNum = Number(form.tailPeriodDays);
    if (Number.isNaN(depositRateNum) || Number.isNaN(tailPeriodNum)) {
      toast.error("定金比例和尾款账期需为数字");
      return;
    }
    
    const supplierData = {
      name: form.name.trim(),
      contact: form.contact.trim(),
      phone: form.phone.trim(),
      depositRate: depositRateNum,
      tailPeriodDays: tailPeriodNum,
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
      factoryImages: form.factoryImages || null,
    };
    
    setIsSubmitting(true);
    try {
      let response;
      if (editingSupplier) {
        // 更新供应商
        response = await fetch(`/api/suppliers/${editingSupplier.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(supplierData),
        });
      } else {
        // 创建新供应商
        response = await fetch('/api/suppliers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(supplierData),
        });
      }
      
      if (response.ok) {
        const savedSupplier = await response.json();
        if (editingSupplier) {
          await mutateSuppliers((prev: Supplier[] | undefined) => (prev || []).map((s) => (s.id === editingSupplier.id ? savedSupplier : s)));
          toast.success("供应商已更新");
        } else {
          await mutateSuppliers((prev: Supplier[] | undefined) => [...(prev || []), savedSupplier]);
          toast.success("供应商已创建");
        }
        resetForm();
        setIsModalOpen(false);
      } else {
        const error = await response.json();
        toast.error(error.error || "操作失败");
      }
    } catch (error) {
      console.error('Error saving supplier:', error);
      toast.error("网络错误，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 格式化创建时间
  const formatCreatedAt = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  // 获取等级颜色
  const getLevelColor = (level?: string) => {
    switch (level) {
      case "S":
        return "text-purple-300 bg-purple-500/20";
      case "A":
        return "text-blue-300 bg-blue-500/20";
      case "B":
        return "text-emerald-300 bg-emerald-500/20";
      case "C":
        return "text-slate-300 bg-slate-700/40";
      default:
        return "text-slate-400 bg-slate-800/40";
    }
  };

  return (
    <div className="space-y-4" suppressHydrationWarning>
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">供应商库</h1>
          <p className="mt-1 text-sm text-slate-400">管理工厂档案，支持多工厂、多品类维度。</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportData}
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 shadow hover:bg-slate-700 active:translate-y-px transition-colors"
          >
            <Download className="h-4 w-4" />
            导出数据
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px"
          >
            新增供应商
          </button>
        </div>
      </header>

      {/* 统计面板 */}
      <section className="grid gap-6 md:grid-cols-4">
        {/* 总供应商数 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Factory className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">总供应商数</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }} suppressHydrationWarning>
              {suppliersLoading ? "-" : supplierSummary.totalCount}
            </div>
          </div>
        </div>

        {/* 平均定金比例 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">平均定金比例</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }} suppressHydrationWarning>
              {suppliersLoading ? "-" : `${formatNumber(supplierSummary.avgDepositRate)}%`}
            </div>
          </div>
        </div>

        {/* 平均尾款账期 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">平均尾款账期</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }} suppressHydrationWarning>
              {suppliersLoading ? "-" : `${formatNumber(supplierSummary.avgTailPeriod)} 天`}
            </div>
          </div>
        </div>

        {/* 等级分布 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Building2 className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">S级供应商</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }} suppressHydrationWarning>
              {suppliersLoading ? "-" : supplierSummary.levelCounts.S}
            </div>
          </div>
        </div>
      </section>

      {/* 搜索、筛选和排序 */}
      <section className="space-y-3">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索供应商名称、联系人、手机号、分类或地址..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 pl-10 pr-10 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
          />
          {searchKeyword && (
            <button
              onClick={() => setSearchKeyword("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 快速筛选和排序 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 等级筛选 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">等级：</span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterLevel("all")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterLevel === "all"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setFilterLevel("S")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterLevel === "S"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                S级
              </button>
              <button
                onClick={() => setFilterLevel("A")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterLevel === "A"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                A级
              </button>
              <button
                onClick={() => setFilterLevel("B")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterLevel === "B"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                B级
              </button>
              <button
                onClick={() => setFilterLevel("C")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterLevel === "C"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                C级
              </button>
            </div>
          </div>

          {/* 分类筛选 */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">分类：</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 outline-none focus:border-primary-400"
              >
                <option value="all">全部</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 结算基准筛选 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">结算基准：</span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterSettleBase("all")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterSettleBase === "all"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setFilterSettleBase("SHIPMENT")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterSettleBase === "SHIPMENT"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                发货
              </button>
              <button
                onClick={() => setFilterSettleBase("INBOUND")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterSettleBase === "INBOUND"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                入库
              </button>
            </div>
          </div>

          {/* 排序 */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-400">排序：</span>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  if (sortBy === "name") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("name");
                    setSortOrder("asc");
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  sortBy === "name"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                名称
                {sortBy === "name" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
              </button>
              <button
                onClick={() => {
                  if (sortBy === "depositRate") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("depositRate");
                    setSortOrder("desc");
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  sortBy === "depositRate"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                定金比例
                {sortBy === "depositRate" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
              </button>
              <button
                onClick={() => {
                  if (sortBy === "tailPeriod") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("tailPeriod");
                    setSortOrder("desc");
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  sortBy === "tailPeriod"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                尾款账期
                {sortBy === "tailPeriod" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 供应商卡片列表 */}
      <section>
        {suppliersLoading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
            <p className="text-slate-500">加载中...</p>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
            <p className="text-slate-500">暂无供应商，请点击右上角"新增供应商"</p>
          </div>
        ) : (
          <div
            className="grid gap-6"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "24px"
            }}
          >
            {filteredSuppliers.map((supplier) => {
              const isHovered = hoveredSupplierId === supplier.id && !buttonHoveredSupplierId;
              const factoryImages = Array.isArray(supplier.factoryImages)
                ? supplier.factoryImages
                : supplier.factoryImages
                ? [supplier.factoryImages]
                : [];
              const firstImage = factoryImages.length > 0 ? factoryImages[0] : null;
              
              return (
                <div
                  key={supplier.id}
                  className="group relative overflow-hidden rounded-2xl border p-5 transition-all"
                  style={{
                    background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                    borderRadius: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.1)"
                  }}
                  onMouseEnter={() => {
                    if (!buttonHoveredSupplierId) {
                      setHoveredSupplierId(supplier.id);
                    }
                  }}
                  onMouseLeave={() => {
                    if (!buttonHoveredSupplierId) {
                      setHoveredSupplierId(null);
                    }
                  }}
                >
                  {/* 顶部：Logo和等级标签 */}
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-white/10 p-2">
                        <Factory className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-white">{supplier.name}</div>
                        {supplier.category && (
                          <div className="text-xs text-slate-400">{supplier.category}</div>
                        )}
                      </div>
                    </div>
                    {supplier.level && (
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${getLevelColor(supplier.level)}`}>
                        {supplier.level}级
                      </span>
                    )}
                  </div>

                  {/* 中间：关键信息 */}
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">联系人</span>
                      <span className="text-white">{supplier.contact}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">手机号</span>
                      <span className="text-white font-mono text-xs">{supplier.phone}</span>
                    </div>
                    {supplier.address && (
                      <div className="flex items-start gap-2 text-sm pt-1">
                        <MapPin className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-400 block mb-1">工厂地址</span>
                          <span className="text-white text-xs leading-relaxed break-words">{supplier.address}</span>
                        </div>
                      </div>
                    )}
                    {(() => {
                      const productStats = getSupplierProductStats(supplier.id);
                      return (
                        <div className="flex items-center justify-between text-sm pt-2 border-t border-white/10">
                          <span className="text-slate-400 flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            关联产品
                          </span>
                          <span className="text-primary-300 font-medium">
                            {productStats.totalProducts} 个
                          </span>
                        </div>
                      );
                    })()}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">定金比例</span>
                      <span className="text-emerald-300 font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {supplier.depositRate}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">尾款账期</span>
                      <span className="text-blue-300 font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {supplier.tailPeriodDays} 天
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">结算基准</span>
                    <span className="text-slate-300">{SETTLE_BASE_LABEL[supplier.settleBase]}</span>
                    </div>
                  </div>

                  {/* 工厂图片预览 */}
                  {firstImage && (
                    <div 
                      className="mb-4 relative h-32 bg-slate-800 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setImageViewModal({ images: factoryImages, currentIndex: 0 })}
                    >
                      <img
                        src={firstImage}
                        alt={supplier.name}
                        className="w-full h-full object-cover"
                      />
                      {factoryImages.length > 1 && (
                        <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
                          +{factoryImages.length - 1}
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors">
                        <div className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          点击查看
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 操作按钮（始终显示在底部，z-index 高于悬停预览） */}
                  <div 
                    className="relative z-30 mt-4"
                    onMouseEnter={() => {
                      setButtonHoveredSupplierId(supplier.id);
                      setHoveredSupplierId(null);
                    }}
                    onMouseLeave={() => {
                      setButtonHoveredSupplierId(null);
                    }}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setHoveredSupplierId(null);
                            handleOpenModal(supplier);
                          }}
                          className="flex-1 rounded-lg bg-primary-500/20 px-3 py-2 text-xs text-primary-300 hover:bg-primary-500/30 transition-colors"
                        >
                          编辑
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setHoveredSupplierId(null);
                            handleDelete(supplier.id);
                          }}
                          className="flex-1 rounded-lg bg-rose-500/20 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/30 transition-colors"
                        >
                          删除
                        </button>
                      </div>
                      {(() => {
                        const products = getSupplierProducts(supplier.id);
                        if (products.length > 0) {
                          const isExpanded = expandedSupplierIds.has(supplier.id);
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setHoveredSupplierId(null);
                                setExpandedSupplierIds((prev) => {
                                  const newSet = new Set(prev);
                                  if (isExpanded) {
                                    newSet.delete(supplier.id);
                                  } else {
                                    newSet.add(supplier.id);
                                  }
                                  return newSet;
                                });
                              }}
                              className="flex items-center justify-center gap-2 rounded-lg bg-slate-700/40 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700/60 transition-colors"
                            >
                              <Package className="h-3 w-3" />
                              {isExpanded ? "收起产品" : "查看产品"}
                              {isExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* 详情预览（悬停时显示） */}
                  {isHovered && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-2xl p-5 flex flex-col justify-between z-20 overflow-y-auto pointer-events-none">
                      <div className="space-y-2 text-xs">
                        {/* 基本信息 */}
                        <div className="pb-2 border-b border-white/10">
                          <div className="text-xs font-semibold text-slate-300 mb-2">基本信息</div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">供应商名称：</span>
                            <span className="text-white font-medium">{supplier.name}</span>
                          </div>
                          {supplier.level && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">供应商等级：</span>
                              <span className={`px-2 py-0.5 rounded text-xs ${getLevelColor(supplier.level)}`}>
                                {supplier.level}级
                              </span>
                            </div>
                          )}
                          {supplier.category && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">主营类目：</span>
                              <span className="text-white">{supplier.category}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">联系人：</span>
                            <span className="text-white">{supplier.contact}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">手机号：</span>
                            <span className="text-white font-mono">{supplier.phone}</span>
                          </div>
                          {supplier.address && (
                            <div className="pt-1">
                              <div className="text-slate-400 mb-1">详细地址：</div>
                              <div className="text-white text-xs">{supplier.address}</div>
                            </div>
                          )}
                        </div>

                        {/* 财务结算信息 */}
                        <div className="pb-2 border-b border-white/10">
                          <div className="text-xs font-semibold text-slate-300 mb-2">财务结算</div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">定金比例：</span>
                            <span className="text-white font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              {supplier.depositRate}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">尾款账期：</span>
                            <span className="text-white font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              {supplier.tailPeriodDays} 天
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">结算基准：</span>
                            <span className="text-white">{supplier.settleBase}</span>
                          </div>
                          {supplier.bankAccount && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">银行账号：</span>
                              <span className="text-white font-mono text-xs">{supplier.bankAccount}</span>
                            </div>
                          )}
                          {supplier.bankName && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">开户行：</span>
                              <span className="text-white">{supplier.bankName}</span>
                            </div>
                          )}
                          {supplier.taxId && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">纳税人识别号：</span>
                              <span className="text-white font-mono text-xs">{supplier.taxId}</span>
                            </div>
                          )}
                          {supplier.invoiceRequirement && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">发票要求：</span>
                              <span className="text-white">{INVOICE_REQUIREMENT_LABEL[supplier.invoiceRequirement]}</span>
                            </div>
                          )}
                          {supplier.invoicePoint && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">开票点数：</span>
                              <span className="text-white">{formatNumber(supplier.invoicePoint)}%</span>
                            </div>
                          )}
                        </div>

                        {/* 供应能力信息 */}
                        {(supplier.defaultLeadTime || supplier.moq) && (
                          <div className="pb-2 border-b border-white/10">
                            <div className="text-xs font-semibold text-slate-300 mb-2">供应能力</div>
                            {supplier.defaultLeadTime && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">默认生产周期：</span>
                                <span className="text-white">{supplier.defaultLeadTime} 天</span>
                              </div>
                            )}
                            {supplier.moq && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">起订量(MOQ)：</span>
                                <span className="text-white">{supplier.moq}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 关联产品信息 */}
                        {(() => {
                          const products = getSupplierProducts(supplier.id);
                          const productStats = getSupplierProductStats(supplier.id);
                          if (products.length > 0) {
                            return (
                              <div className="pb-2 border-b border-white/10">
                                <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1">
                                  <Package className="h-3 w-3" />
                                  关联产品 ({productStats.totalProducts}个)
                                </div>
                                {productStats.mainCategory && (
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-slate-400">主要类别：</span>
                                    <span className="text-white">{productStats.mainCategory}</span>
                                  </div>
                                )}
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                  {products.slice(0, 5).map((product) => (
                                    <div key={product.sku_id} className="flex items-center justify-between text-xs">
                                      <span className="text-slate-400 truncate flex-1">{product.name}</span>
                                      <span className="text-slate-500 ml-2">{product.sku_id}</span>
                                    </div>
                                  ))}
                                  {products.length > 5 && (
                                    <div className="text-xs text-slate-500 text-center pt-1">
                                      还有 {products.length - 5} 个产品...
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* 其他信息 */}
                        {supplier.createdAt && (
                          <div>
                            <div className="text-xs font-semibold text-slate-300 mb-2">其他信息</div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">创建时间：</span>
                              <span className="text-white text-xs">{formatCreatedAt(supplier.createdAt)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {/* 展开的产品列表 */}
        {filteredSuppliers.map((supplier) => {
          if (!expandedSupplierIds.has(supplier.id)) return null;
          const products = getSupplierProducts(supplier.id);
          if (products.length === 0) return null;
          
          return (
            <div key={`products-${supplier.id}`} className="mt-4 mb-8">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-slate-700"></div>
                <div className="flex items-center gap-2">
                  <Factory className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-300 font-medium">{supplier.name}</span>
                  <span className="text-slate-500 text-sm">的产品列表</span>
                  <span className="rounded-full bg-primary-500/20 px-2 py-0.5 text-xs text-primary-300">
                    {products.length} 个
                  </span>
                </div>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent via-slate-700 to-slate-700"></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {products.map((product) => (
                  <div
                    key={product.sku_id}
                    className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-3 hover:border-primary-500/50 transition-all cursor-pointer"
                    onClick={() => window.open(`/product-center/products`, '_blank')}
                  >
                    {/* 产品图片 */}
                    <div className="relative aspect-square mb-3 rounded-lg overflow-hidden bg-slate-800">
                      {product.main_image ? (
                        <img
                          src={product.main_image}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-8 w-8 text-slate-600" />
                        </div>
                      )}
                    </div>
                    
                    {/* 产品信息 */}
                    <div className="space-y-1">
                      <h4 className="font-medium text-sm text-white line-clamp-2 min-h-[2.5rem]">
                        {product.name}
                      </h4>
                      <p className="text-xs text-slate-400 font-mono">{product.sku_id}</p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-slate-400">拿货价</span>
                        <span className="text-emerald-300 font-medium text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          ¥{formatNumber(product.cost_price)}
                        </span>
                      </div>
                      {product.category && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {product.category}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* 悬停效果 */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="rounded-lg bg-black/60 p-1.5 backdrop-blur-sm">
                        <ExternalLink className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* 新增/编辑供应商模态框 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  {editingSupplier ? "编辑供应商" : "新增供应商"}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  录入后将自动保存在浏览器本地存储（localStorage），刷新也不会丢失。
                </p>
              </div>
              <button
                onClick={() => {
                  resetForm();
                  setIsModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 text-sm">
              {/* 左右两栏布局 */}
              <div className="grid grid-cols-2 gap-6">
                {/* 左栏 */}
                <div className="space-y-6">
                  {/* 基本信息 */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                      <div className="w-1 h-4 bg-primary-500 rounded-full"></div>
                      <h3 className="text-sm font-semibold text-slate-200">基本信息</h3>
                    </div>
                    <div className="space-y-3">
                      <label className="space-y-1 block">
                        <span className="text-slate-300">供应商名称 <span className="text-rose-400">*</span></span>
                        <input
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                          required
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1 block">
                          <span className="text-slate-300">联系人 <span className="text-rose-400">*</span></span>
                          <input
                            value={form.contact}
                            onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                            required
                          />
                        </label>
                        <label className="space-y-1 block">
                          <span className="text-slate-300">手机号 <span className="text-rose-400">*</span></span>
                          <input
                            value={form.phone}
                            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                            required
                          />
                        </label>
                      </div>
                      <label className="space-y-1 block">
                        <span className="text-slate-300">供应商等级</span>
                        <select
                          value={form.level}
                          onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as "" | "S" | "A" | "B" | "C" }))}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                        >
                          <option value="">请选择</option>
                          <option value="S">S级</option>
                          <option value="A">A级</option>
                          <option value="B">B级</option>
                          <option value="C">C级</option>
                        </select>
                      </label>
                      <label className="space-y-1 block">
                        <span className="text-slate-300">主营类目</span>
                        <input
                          value={form.category}
                          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                          placeholder="如：电子产品、服装、家居用品等"
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                        />
                      </label>
                      <label className="space-y-1 block">
                        <span className="text-slate-300">详细地址</span>
                        <textarea
                          value={form.address}
                          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                          rows={2}
                          placeholder="请输入详细地址"
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)] resize-none"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* 右栏 */}
                <div className="space-y-6">
                  {/* 财务结算 */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                      <div className="w-1 h-4 bg-primary-500 rounded-full"></div>
                      <h3 className="text-sm font-semibold text-slate-200">财务结算</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1 block">
                          <span className="text-slate-300">定金比例 (%) <span className="text-rose-400">*</span></span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={form.depositRate}
                            onChange={(e) => setForm((f) => ({ ...f, depositRate: e.target.value }))}
                            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                            required
                          />
                        </label>
                        <label className="space-y-1 block">
                          <span className="text-slate-300">尾款账期 (天) <span className="text-rose-400">*</span></span>
                          <input
                            type="number"
                            min={0}
                            value={form.tailPeriodDays}
                            onChange={(e) => setForm((f) => ({ ...f, tailPeriodDays: e.target.value }))}
                            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                            required
                          />
                        </label>
                      </div>
                      <label className="space-y-1 block">
                        <span className="text-slate-300">结算基准 <span className="text-rose-400">*</span></span>
                        <select
                          value={form.settleBase}
                          onChange={(e) => setForm((f) => ({ ...f, settleBase: e.target.value as "SHIPMENT" | "INBOUND" }))}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                          required
                        >
                          <option value="SHIPMENT">发货</option>
                          <option value="INBOUND">入库</option>
                        </select>
                        <p className="text-xs text-slate-500 mt-1">
                          该配置将自动关联至财务对账模块的付款提醒
                        </p>
                      </label>
                      <label className="space-y-1 block">
                        <span className="text-slate-300">银行账号</span>
                        <input
                          value={form.bankAccount}
                          onChange={(e) => setForm((f) => ({ ...f, bankAccount: e.target.value }))}
                          placeholder="请输入银行账号"
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                        />
                      </label>
                      <label className="space-y-1 block">
                        <span className="text-slate-300">开户行</span>
                        <input
                          value={form.bankName}
                          onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                          placeholder="请输入开户行名称"
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                        />
                      </label>
                      <label className="space-y-1 block">
                        <span className="text-slate-300">纳税人识别号</span>
                        <input
                          value={form.taxId}
                          onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                          placeholder="请输入纳税人识别号"
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                        />
                      </label>
                      <label className="space-y-1 block">
                        <span className="text-slate-300">发票要求</span>
                        <select
                          value={form.invoiceRequirement}
                          onChange={(e) => setForm((f) => ({ ...f, invoiceRequirement: e.target.value as "" | "SPECIAL_INVOICE" | "GENERAL_INVOICE" | "NO_INVOICE" }))}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                        >
                          <option value="">请选择</option>
                          <option value="SPECIAL_INVOICE">专票</option>
                          <option value="GENERAL_INVOICE">普票</option>
                          <option value="NO_INVOICE">不开票</option>
                        </select>
                      </label>
                      <label className="space-y-1 block">
                        <span className="text-slate-300">开票点数 (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          value={form.invoicePoint}
                          onChange={(e) => setForm((f) => ({ ...f, invoicePoint: e.target.value }))}
                          placeholder="如：5、8、13"
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          开票需要额外加收的费用比例
                        </p>
                      </label>
                    </div>
                  </div>

                  {/* 供应能力 */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                      <div className="w-1 h-4 bg-primary-500 rounded-full"></div>
                      <h3 className="text-sm font-semibold text-slate-200">供应能力</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1 block">
                          <span className="text-slate-300">默认生产周期 (天)</span>
                          <input
                            type="number"
                            min={0}
                            value={form.defaultLeadTime}
                            onChange={(e) => setForm((f) => ({ ...f, defaultLeadTime: e.target.value }))}
                            placeholder="如：7、15、30"
                            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                          />
                        </label>
                        <label className="space-y-1 block">
                          <span className="text-slate-300">起订量 (MOQ)</span>
                          <input
                            type="number"
                            min={0}
                            value={form.moq}
                            onChange={(e) => setForm((f) => ({ ...f, moq: e.target.value }))}
                            placeholder="如：100、500"
                            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                          />
                        </label>
                      </div>
                      <div>
                        <ImageUploader
                          value={form.factoryImages}
                          onChange={(value) => setForm((f) => ({ ...f, factoryImages: value }))}
                          label="工厂实拍图"
                          multiple={true}
                          maxImages={5}
                          placeholder="点击上传或直接 Ctrl + V 粘贴图片，最多5张"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(false);
                  }}
                  className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:shadow-primary-500/25 hover:from-primary-600 hover:to-primary-700 transition-all duration-200 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (editingSupplier ? "更新中..." : "保存中...") : (editingSupplier ? "更新" : "保存")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 图片查看弹窗 */}
      {imageViewModal && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm"
          style={{ zIndex: 9999 }}
          onClick={() => setImageViewModal(null)}
        >
          <div 
            className="relative max-w-6xl max-h-[95vh] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setImageViewModal(null)}
              className="absolute top-4 right-4 text-white text-2xl hover:text-slate-300 z-10 bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
            >
              ✕
            </button>
            
            {/* 图片导航 */}
            {imageViewModal.images.length > 1 && (
              <div className="absolute top-4 left-4 right-16 flex items-center justify-center gap-2 z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageViewModal({
                      images: imageViewModal.images,
                      currentIndex: imageViewModal.currentIndex > 0 
                        ? imageViewModal.currentIndex - 1 
                        : imageViewModal.images.length - 1
                    });
                  }}
                  className="bg-black/70 hover:bg-black/90 text-white rounded-full w-8 h-8 flex items-center justify-center transition"
                >
                  ←
                </button>
                <span className="text-white text-sm bg-black/70 px-3 py-1 rounded">
                  {imageViewModal.currentIndex + 1} / {imageViewModal.images.length}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageViewModal({
                      images: imageViewModal.images,
                      currentIndex: imageViewModal.currentIndex < imageViewModal.images.length - 1
                        ? imageViewModal.currentIndex + 1
                        : 0
                    });
                  }}
                  className="bg-black/70 hover:bg-black/90 text-white rounded-full w-8 h-8 flex items-center justify-center transition"
                >
                  →
                </button>
              </div>
            )}

            {/* 当前图片 */}
            {(() => {
              const currentImage = imageViewModal.images[imageViewModal.currentIndex];
              let imageSrc = currentImage;
              
              // 处理 base64 图片
              if (currentImage && /^[A-Za-z0-9+/=]+$/.test(currentImage) && currentImage.length > 100 && !currentImage.startsWith('data:')) {
                imageSrc = `data:image/jpeg;base64,${currentImage}`;
              }
              
              return (
                <img 
                  src={imageSrc || currentImage} 
                  alt={`工厂图片 ${imageViewModal.currentIndex + 1}`}
                  className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain bg-white/5"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.error-message')) {
                      const errorDiv = document.createElement("div");
                      errorDiv.className = "error-message text-white text-center p-8 bg-rose-500/20 rounded-lg border border-rose-500/40";
                      errorDiv.innerHTML = `<div class="text-rose-300 text-lg mb-2">❌ 图片加载失败</div><div class="text-slate-300 text-sm">请检查图片格式或数据是否正确</div>`;
                      parent.appendChild(errorDiv);
                    }
                  }}
                />
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
