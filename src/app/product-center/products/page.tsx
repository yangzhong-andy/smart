"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";
import { type Product, type ProductStatus } from "@/lib/products-store";
import { formatCurrency } from "@/lib/currency-utils";
import { PRODUCT_STATUS_LABEL } from "@/lib/enum-mapping";
import { Package, TrendingUp, DollarSign, Search, X, SortAsc, SortDesc, Download, Pencil, Trash2, Info, Plus, Trash } from "lucide-react";
import InventoryDistribution from "@/components/InventoryDistribution";

// 格式化数字
const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

// 计算体积重（千克）- 体积重公式返回的是克，需要除以1000转换为千克
const calculateVolumetricWeight = (length: number, width: number, height: number, divisor: number = 5000): number => {
  if (!length || !width || !height) return 0;
  return (length * width * height) / divisor / 1000; // 转换为千克
};

// 计算计费重量（实际重量和体积重取较大值）
const calculateChargeableWeight = (actualWeight: number, volumetricWeight: number): number => {
  return Math.max(actualWeight || 0, volumetricWeight || 0);
};

// 兼容加载供应商数据（从旧的suppliers存储或新的supplier-reconciliation-store）
function loadSuppliers() {
  if (typeof window === "undefined") return [];
  
  // 先尝试从新的供应商对账存储加载
  try {
    const { getSupplierProfiles } = require("@/lib/supplier-reconciliation-store");
    const profiles = getSupplierProfiles();
    if (profiles.length > 0) {
      return profiles.map((p: any) => ({ id: p.id, name: p.name }));
    }
  } catch (e) {
    // 忽略错误，继续尝试旧的方式
  }
  
  // 尝试从旧的suppliers存储加载
  try {
    const stored = window.localStorage.getItem("suppliers");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s: any) => ({ id: s.id, name: s.name }));
      }
    }
  } catch (e) {
    console.error("Failed to load suppliers", e);
  }
  
  return [];
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [productsReady, setProductsReady] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // 搜索、筛选、排序状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<ProductStatus | "all">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterFactory, setFilterFactory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "cost" | "created" | "none">("none");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [hoveredProductId, setHoveredProductId] = useState<string | null>(null);
  
  const [form, setForm] = useState({
    sku_id: "",
    name: "",
    main_image: "",
    category: "",
    status: "ACTIVE" as ProductStatus,
    cost_price: "",
    target_roi: "",
    currency: "CNY" as Product["currency"],
    weight_kg: "",
    length: "",
    width: "",
    height: "",
    volumetric_divisor: "5000",
    factory_id: "",
    moq: "",
    lead_time: "",
    suppliers: [] as Array<{
      id: string;
      name: string;
      price?: number;
      moq?: number;
      lead_time?: number;
      isPrimary?: boolean;
    }>
  });

  const { data: swrProducts, error: productsError, mutate: mutateProducts } = useSWR<Product[]>('/api/products');

  useEffect(() => {
    if (swrProducts) {
      // 确保 swrProducts 是数组
      const productsArray = Array.isArray(swrProducts) ? swrProducts : [];
      setProducts(productsArray);
      setProductsReady(true);
    } else if (swrProducts === undefined) {
      // 数据还在加载中，保持 products 为空数组
      setProducts([]);
    }
  }, [swrProducts]);

  useEffect(() => {
    if (productsError) {
      console.error('Failed to load products:', productsError);
      toast.error('加载产品数据失败');
      setProductsReady(true);
    }
  }, [productsError]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadedSuppliers = loadSuppliers();
    setSuppliers(loadedSuppliers);
  }, []);

  // 获取所有分类
  const categories = useMemo(() => {
    // 确保 products 是数组
    if (!Array.isArray(products)) {
      return [];
    }
    const cats = products
      .map((p) => p.category)
      .filter((c): c is string => !!c);
    return Array.from(new Set(cats)).sort();
  }, [products]);

  // 筛选和排序后的产品列表
  const filteredProducts = useMemo(() => {
    // 确保 products 是数组
    if (!Array.isArray(products)) {
      return [];
    }
    let result = [...products];
    
    // 1. 状态筛选
    if (filterStatus !== "all") {
      result = result.filter((p) => p.status === filterStatus);
    }
    
    // 2. 分类筛选
    if (filterCategory !== "all") {
      result = result.filter((p) => p.category === filterCategory);
    }
    
    // 3. 工厂筛选
    if (filterFactory !== "all") {
      result = result.filter((p) => p.factory_id === filterFactory);
    }
    
    // 4. 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((p) =>
        p.sku_id.toLowerCase().includes(keyword) ||
        p.name.toLowerCase().includes(keyword) ||
        (p.category && p.category.toLowerCase().includes(keyword)) ||
        (p.factory_name && p.factory_name.toLowerCase().includes(keyword))
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
          case "cost":
            aVal = a.cost_price;
            bVal = b.cost_price;
            break;
          case "created":
            aVal = new Date(a.createdAt).getTime();
            bVal = new Date(b.createdAt).getTime();
            break;
          default:
            return 0;
        }
        
        if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
        if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      // 默认按SKU排序
      result.sort((a, b) => a.sku_id.localeCompare(b.sku_id, "zh-Hans-CN"));
    }
    
    return result;
  }, [products, filterStatus, filterCategory, filterFactory, searchKeyword, sortBy, sortOrder]);

  // 产品统计摘要
  const productSummary = useMemo(() => {
    const totalCount = filteredProducts.length;
    const onSaleCount = filteredProducts.filter((p) => p.status === "ACTIVE").length;
    const offSaleCount = filteredProducts.filter((p) => p.status === "INACTIVE").length;
    
    const totalCost = filteredProducts.reduce((sum, p) => sum + p.cost_price, 0);
    const avgCost = totalCount > 0 ? totalCost / totalCount : 0;
    
    // 按币种统计
    const costByCurrency = filteredProducts.reduce((acc, p) => {
      const currency = p.currency || "CNY";
      if (!acc[currency]) acc[currency] = 0;
      acc[currency] += p.cost_price;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalCount,
      onSaleCount,
      offSaleCount,
      avgCost,
      costByCurrency
    };
  }, [filteredProducts]);

  // 导出产品数据
  const handleExportData = () => {
    if (filteredProducts.length === 0) {
      toast.error("没有可导出的数据", { icon: "⚠️", duration: 2000 });
      return;
    }

    const headers = [
      "SKU编码",
      "产品名称",
      "分类",
      "状态",
      "拿货价",
      "币种",
      "目标ROI(%)",
      "重量(kg)",
      "长度(cm)",
      "宽度(cm)",
      "高度(cm)",
      "关联工厂",
      "最小起订量(MOQ)",
      "生产周期(天)",
      "创建时间",
      "更新时间"
    ];

    const rows = filteredProducts.map((p) => {
      return [
        p.sku_id || "",
        p.name || "",
        p.category || "",
        p.status || "",
        formatNumber(p.cost_price),
        p.currency || "CNY",
        p.target_roi ? formatNumber(p.target_roi) : "",
        p.weight_kg ? formatNumber(p.weight_kg) : "",
        p.length ? formatNumber(p.length) : "",
        p.width ? formatNumber(p.width) : "",
        p.height ? formatNumber(p.height) : "",
        p.factory_name || "",
        p.moq ? String(p.moq) : "",
        p.lead_time ? String(p.lead_time) : "",
        p.createdAt ? new Date(p.createdAt).toLocaleString("zh-CN") : "",
        p.updatedAt ? new Date(p.updatedAt).toLocaleString("zh-CN") : ""
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
    link.setAttribute("download", `产品档案_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`已导出 ${filteredProducts.length} 条产品数据`, { icon: "✅", duration: 2000 });
  };

  const resetForm = () => {
    setForm({
      sku_id: "",
      name: "",
      main_image: "",
      category: "",
      status: "ACTIVE",
      cost_price: "",
      target_roi: "",
      currency: "CNY",
      weight_kg: "",
      length: "",
      width: "",
      height: "",
      volumetric_divisor: "5000",
      factory_id: "",
      moq: "",
      lead_time: "",
      suppliers: []
    });
    setEditingProduct(null);
  };

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setForm({
        sku_id: product.sku_id,
        name: product.name,
        main_image: product.main_image || "",
        category: product.category || "",
        status: product.status,
        cost_price: product.cost_price.toString(),
        target_roi: product.target_roi?.toString() || "",
        currency: product.currency,
        weight_kg: product.weight_kg?.toString() || "",
        length: product.length?.toString() || "",
        width: product.width?.toString() || "",
        height: product.height?.toString() || "",
        volumetric_divisor: product.volumetric_divisor?.toString() || "5000",
        factory_id: product.factory_id || "",
        moq: product.moq?.toString() || "",
        lead_time: product.lead_time?.toString() || "",
        suppliers: product.suppliers || (product.factory_id ? [{
          id: product.factory_id,
          name: product.factory_name || "",
          price: product.cost_price,
          moq: product.moq,
          lead_time: product.lead_time,
          isPrimary: true
        }] : [])
      });
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!form.sku_id.trim() || !form.name.trim()) {
      toast.error("请填写 SKU 编码与产品名称");
      return;
    }
    
    const costPrice = Number(form.cost_price);
    if (Number.isNaN(costPrice) || costPrice < 0) {
      toast.error("成本价需为数字且不小于 0");
      return;
    }
    
    // 检查SKU是否重复（编辑时排除自己）
    const duplicate = products.find((p) => 
      p.sku_id === form.sku_id.trim() && 
      (!editingProduct || p.sku_id !== editingProduct.sku_id)
    );
    if (duplicate) {
      toast.error("SKU 编码已存在");
      return;
    }
    
    // 处理供应商信息
    // 如果有新的多供应商列表，使用它；否则兼容旧的单供应商模式
    let primarySupplier = null;
    let suppliersList = form.suppliers && form.suppliers.length > 0 ? form.suppliers.filter((s) => s.id) : [];
    
    if (suppliersList.length > 0) {
      primarySupplier = suppliersList.find((s) => s.isPrimary) || suppliersList[0];
    } else if (form.factory_id) {
      const selectedSupplier = suppliers.find((s) => s.id === form.factory_id);
      primarySupplier = {
        id: form.factory_id,
        name: selectedSupplier?.name || "",
        price: costPrice,
        moq: form.moq ? Number(form.moq) : undefined,
        lead_time: form.lead_time ? Number(form.lead_time) : undefined,
        isPrimary: true
      };
      suppliersList = [primarySupplier];
    }
    
    const productData: any = {
      sku_id: form.sku_id.trim(),
      name: form.name.trim(),
      main_image: form.main_image,
      category: form.category.trim() || undefined,
      status: form.status,
      cost_price: costPrice,
      target_roi: form.target_roi ? Number(form.target_roi) : undefined,
      currency: form.currency,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined,
      length: form.length ? Number(form.length) : undefined,
      width: form.width ? Number(form.width) : undefined,
      height: form.height ? Number(form.height) : undefined,
      volumetric_divisor: form.volumetric_divisor ? Number(form.volumetric_divisor) : undefined,
      suppliers: suppliersList.length > 0 ? suppliersList : undefined,
    };
    
    const url = editingProduct 
      ? `/api/products/${encodeURIComponent(editingProduct.sku_id)}`
      : '/api/products';
    const method = editingProduct ? 'PUT' : 'POST';

    const optimistic = editingProduct
      ? products.map((p) => (p.sku_id === editingProduct.sku_id ? { ...productData } : p))
      : [...products, productData];

    try {
      const updated = await mutateProducts?.(
        async (prev = []) => {
          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
          });
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || '操作失败');
          }
          const saved = await response.json();
          return editingProduct
            ? prev.map((p: any) => (p.sku_id === editingProduct.sku_id ? saved : p))
            : [...prev, saved];
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: false, populateCache: true }
      );

      if (updated) {
        setProducts(updated as Product[]);
      }

      toast.success(editingProduct ? "产品已更新" : "产品已创建");
      resetForm();
      setIsModalOpen(false);
    } catch (error: any) {
      console.error('Failed to save product:', error);
      toast.error(error.message || '保存产品失败');
    }
  };

  const handleDelete = async (skuId: string) => {
    if (!confirm("⚠️ 确定要删除这个产品吗？\n此操作不可恢复！")) return;
    
    const optimistic = products.filter((p) => p.sku_id !== skuId);

    try {
      const updated = await mutateProducts?.(
        async (prev = []) => {
          const response = await fetch(`/api/products/${encodeURIComponent(skuId)}`, {
            method: 'DELETE'
          });
          
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || '删除失败');
          }
          
          return prev.filter((p: any) => p.sku_id !== skuId);
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: false, populateCache: true }
      );

      if (updated) {
        setProducts(updated as Product[]);
      }

      toast.success("产品已删除");
    } catch (error: any) {
      console.error('Failed to delete product:', error);
      toast.error(error.message || '删除产品失败');
    }
  };

  const getFactoryName = (factoryId?: string) => {
    if (!factoryId) return "-";
    const supplier = suppliers.find((s) => s.id === factoryId);
    return supplier?.name || "-";
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

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">产品档案</h1>
          <p className="mt-1 text-sm text-slate-400">管理产品SKU档案，包含财务、物理、供应等全维度信息。</p>
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
            录入产品
          </button>
        </div>
      </header>

      {/* 统计面板 */}
      <section className="grid gap-6 md:grid-cols-4">
        {/* 总产品数 */}
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
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">总产品数</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {productSummary.totalCount}
            </div>
          </div>
        </div>

        {/* 在售产品 */}
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
            <div className="text-xs font-medium text-white/80 mb-1">在售产品</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {productSummary.onSaleCount}
            </div>
          </div>
        </div>

        {/* 下架产品 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #6b7280 0%, #374151 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">下架产品</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {productSummary.offSaleCount}
            </div>
          </div>
        </div>

        {/* 平均成本 */}
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
            <div className="text-xs font-medium text-white/80 mb-1">平均成本</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {formatNumber(productSummary.avgCost)}
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
            placeholder="搜索 SKU、产品名称、分类或工厂..."
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
          {/* 状态筛选 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">状态：</span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterStatus("all")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterStatus === "all"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setFilterStatus("ACTIVE")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterStatus === "ACTIVE"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                在售
              </button>
              <button
                onClick={() => setFilterStatus("INACTIVE")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterStatus === "INACTIVE"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                下架
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

          {/* 工厂筛选 */}
          {suppliers.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">工厂：</span>
              <select
                value={filterFactory}
                onChange={(e) => setFilterFactory(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 outline-none focus:border-primary-400"
              >
                <option value="all">全部</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                  if (sortBy === "cost") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("cost");
                    setSortOrder("desc");
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  sortBy === "cost"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                价格
                {sortBy === "cost" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
              </button>
              <button
                onClick={() => {
                  if (sortBy === "created") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("created");
                    setSortOrder("desc");
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  sortBy === "created"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                创建时间
                {sortBy === "created" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 产品卡片列表 */}
      <section>
        {filteredProducts.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
            <p className="text-slate-500">暂无产品，请点击右上角"录入产品"</p>
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
            {filteredProducts.map((product) => {
              const isHovered = hoveredProductId === product.sku_id;
              
              return (
                <div
                  key={product.sku_id}
                  className="group relative overflow-hidden rounded-2xl border p-5 transition-all"
                  style={{
                    background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                    borderRadius: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.1)"
                  }}
                  onMouseEnter={() => setHoveredProductId(product.sku_id)}
                  onMouseLeave={() => setHoveredProductId(null)}
                >
                  {/* 顶部：图片和状态 */}
                  <div className="mb-4 relative h-48 bg-slate-800 rounded-lg overflow-hidden group/product-img">
                    {product.main_image ? (
                      <a
                        href={product.main_image}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="block w-full h-full cursor-zoom-in"
                        title="点击查看大图"
                      >
                        <img
                          src={product.main_image}
                          alt={product.name}
                          className="w-full h-full object-cover transition-transform group-hover/product-img:scale-[1.01]"
                        />
                      </a>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Package className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          product.status === "ACTIVE"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-slate-700/50 text-slate-400"
                        }`}
                      >
                        {PRODUCT_STATUS_LABEL[product.status]}
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮（始终显示在右上角） */}
                  <div className="absolute top-3 right-3 flex gap-2 z-30">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHoveredProductId(null); // 关闭悬停预览
                        handleOpenModal(product);
                      }}
                      className="flex items-center gap-1 rounded-md border border-primary-500/40 bg-primary-500/10 px-2 py-1 text-xs font-medium text-primary-100 hover:bg-primary-500/20 transition-colors"
                      title="编辑产品"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHoveredProductId(null); // 关闭悬停预览
                        handleDelete(product.sku_id);
                      }}
                      className="flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-100 hover:bg-rose-500/20 transition-colors"
                      title="删除产品"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {/* 中间：产品信息 */}
                  <div className="mb-4">
                    <h3 className="font-semibold text-white text-base mb-1">{product.name}</h3>
                    <p className="text-xs text-slate-400 mb-3">SKU: {product.sku_id}</p>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">拿货价</span>
                      <span className="text-emerald-300 font-medium text-lg" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {formatCurrency(product.cost_price, product.currency, "balance")}
                      </span>
                    </div>

                    {product.category && (
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-slate-400">分类</span>
                        <span className="text-slate-300">{product.category}</span>
                      </div>
                    )}

                    {product.factory_name && (
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-slate-400">工厂</span>
                        <span className="text-slate-300">{product.factory_name}</span>
                      </div>
                    )}

                    {/* 库存分布 */}
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="text-xs text-slate-400 mb-2">库存分布</div>
                      <InventoryDistribution
                        atFactory={product.at_factory || 0}
                        atDomestic={product.at_domestic || 0}
                        inTransit={product.in_transit || 0}
                        unitPrice={product.cost_price}
                        size="sm"
                        showValue={false}
                      />
                    </div>
                  </div>

                  {/* 详情预览（悬停时显示） */}
                  {isHovered && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-2xl p-5 flex flex-col justify-between z-10 overflow-y-auto"
                      onMouseEnter={() => setHoveredProductId(product.sku_id)}
                      onMouseLeave={() => setHoveredProductId(null)}
                    >
                      <div className="space-y-2 text-xs">
                        {/* 基本信息 */}
                        <div className="pb-2 border-b border-white/10">
                          <div className="text-xs font-semibold text-slate-300 mb-2">基本信息</div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">SKU编码：</span>
                            <span className="text-white font-mono">{product.sku_id}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">产品名称：</span>
                            <span className="text-white">{product.name}</span>
                          </div>
                          {product.category && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">分类：</span>
                              <span className="text-white">{product.category}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">状态：</span>
                            <span className="text-white">{product.status}</span>
                          </div>
                        </div>

                        {/* 财务信息 */}
                        <div className="pb-2 border-b border-white/10">
                          <div className="text-xs font-semibold text-slate-300 mb-2">财务信息</div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">拿货价：</span>
                            <span className="text-white font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              {formatCurrency(product.cost_price, product.currency, "balance")}
                            </span>
                          </div>
                          {product.target_roi && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">目标ROI：</span>
                              <span className="text-white">{formatNumber(product.target_roi)}%</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">币种：</span>
                            <span className="text-white">{product.currency}</span>
                          </div>
                        </div>

                        {/* 物理信息 */}
                        {(product.weight_kg || product.length || product.width || product.height) && (
                          <div className="pb-2 border-b border-white/10">
                            <div className="text-xs font-semibold text-slate-300 mb-2">物理信息</div>
                            {product.weight_kg && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">实际重量：</span>
                                <span className="text-white">{formatNumber(product.weight_kg)}kg</span>
                              </div>
                            )}
                            {(product.length || product.width || product.height) && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">尺寸：</span>
                                <span className="text-white">
                                  {product.length ? `${formatNumber(product.length)}` : "-"} ×{" "}
                                  {product.width ? `${formatNumber(product.width)}` : "-"} ×{" "}
                                  {product.height ? `${formatNumber(product.height)}` : "-"} cm
                                </span>
                              </div>
                            )}
                            {product.length && product.width && product.height && (
                              <>
                                {(() => {
                                  const divisor = product.volumetric_divisor || 5000;
                                  const volumetricWeight = calculateVolumetricWeight(
                                    product.length,
                                    product.width,
                                    product.height,
                                    divisor
                                  );
                                  const chargeableWeight = calculateChargeableWeight(
                                    product.weight_kg || 0,
                                    volumetricWeight
                                  );
                                  return (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-400">体积重：</span>
                                        <span className="text-white text-xs">
                                          {formatNumber(volumetricWeight / 1000)}kg
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-400 text-xs">计算公式：</span>
                                        <span className="text-slate-500 text-xs">
                                          {formatNumber(product.length)} × {formatNumber(product.width)} × {formatNumber(product.height)} ÷ {divisor}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-400">计费重量：</span>
                                        <span className="text-primary-300 font-semibold">
                                          {formatNumber(chargeableWeight / 1000)}kg
                                        </span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                        )}

                        {/* 供应商价格对比 */}
                        {product.suppliers && product.suppliers.length > 0 && (
                          <div className="pb-2 border-b border-white/10">
                            <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              供应商价格对比 ({product.suppliers.length}个)
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-white/10">
                                    <th className="text-left py-1.5 px-2 text-slate-400">供应商</th>
                                    <th className="text-right py-1.5 px-2 text-slate-400">价格</th>
                                    <th className="text-right py-1.5 px-2 text-slate-400">MOQ</th>
                                    <th className="text-right py-1.5 px-2 text-slate-400">交期</th>
                                    <th className="text-center py-1.5 px-2 text-slate-400">主</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {product.suppliers
                                    .sort((a, b) => {
                                      // 主供应商优先，然后按价格排序
                                      if (a.isPrimary && !b.isPrimary) return -1;
                                      if (!a.isPrimary && b.isPrimary) return 1;
                                      const priceA = a.price || Infinity;
                                      const priceB = b.price || Infinity;
                                      return priceA - priceB;
                                    })
                                    ?.map((supplier, idx) => {
                                      const isLowestPrice = (product.suppliers || []).every(
                                        (s) => !s.price || !supplier.price || s.price >= supplier.price
                                      );
                                      return (
                                        <tr key={idx} className="border-b border-white/5">
                                          <td className="py-1.5 px-2">
                                            <span className="text-white">{supplier.name || "未命名"}</span>
                                          </td>
                                          <td className="py-1.5 px-2 text-right">
                                            {supplier.price ? (
                                              <span className={`font-medium ${isLowestPrice ? "text-emerald-300" : "text-slate-300"}`}>
                                                {formatCurrency(supplier.price, product.currency, "balance")}
                                              </span>
                                            ) : (
                                              <span className="text-slate-500">-</span>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-2 text-right">
                                            <span className="text-slate-300">{supplier.moq || "-"}</span>
                                          </td>
                                          <td className="py-1.5 px-2 text-right">
                                            <span className="text-slate-300">{supplier.lead_time ? `${supplier.lead_time}天` : "-"}</span>
                                          </td>
                                          <td className="py-1.5 px-2 text-center">
                                            {supplier.isPrimary && (
                                              <span className="px-1.5 py-0.5 rounded text-xs bg-primary-500/20 text-primary-300">
                                                主
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* 供应信息（向后兼容，仅当没有多供应商时显示） */}
                        {(!product.suppliers || product.suppliers.length === 0) && (product.factory_name || product.moq || product.lead_time) && (
                          <div className="pb-2 border-b border-white/10">
                            <div className="text-xs font-semibold text-slate-300 mb-2">供应信息</div>
                            {product.factory_name && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">关联工厂：</span>
                                <span className="text-white">{product.factory_name}</span>
                              </div>
                            )}
                            {product.moq && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">最小起订量：</span>
                                <span className="text-white">{product.moq}</span>
                              </div>
                            )}
                            {product.lead_time && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">生产周期：</span>
                                <span className="text-white">{product.lead_time} 天</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 其他信息 */}
                        {product.createdAt && (
                          <div>
                            <div className="text-xs font-semibold text-slate-300 mb-2">其他信息</div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">创建时间：</span>
                              <span className="text-white text-xs">{formatCreatedAt(product.createdAt)}</span>
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
      </section>

      {/* 录入/编辑产品模态框 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  {editingProduct ? "编辑产品" : "录入产品"}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  填写产品的全维度信息，支持上传主图
                </p>
              </div>
              <button
                onClick={() => {
                  resetForm();
                  setIsModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              {/* 基础信息 */}
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-slate-300">SKU 编码 <span className="text-rose-400">*</span></span>
                  <input
                    value={form.sku_id}
                    onChange={(e) => setForm((f) => ({ ...f, sku_id: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    required
                    disabled={!!editingProduct}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">产品名称 <span className="text-rose-400">*</span></span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">分类</span>
                  <input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="如：电子产品、服装等"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">状态</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProductStatus }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  >
                    <option value="ACTIVE">在售</option>
                    <option value="INACTIVE">下架</option>
                  </select>
                </label>
              </div>

              {/* 主图上传 */}
              <div>
                <ImageUploader
                  value={form.main_image}
                  onChange={(value) => setForm((f) => ({ ...f, main_image: value as string }))}
                  label="产品主图"
                  placeholder="点击上传或直接 Ctrl + V 粘贴图片"
                />
              </div>

              {/* 财务信息 */}
              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-slate-300 font-medium mb-3">财务信息</h3>
                <div className="grid grid-cols-3 gap-4">
                  <label className="space-y-1">
                    <span className="text-slate-300">参考拿货价 <span className="text-rose-400">*</span></span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.cost_price}
                      onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      required
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-300">目标 ROI (%)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={form.target_roi}
                      onChange={(e) => setForm((f) => ({ ...f, target_roi: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-300">币种</span>
                    <select
                      value={form.currency}
                      onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as Product["currency"] }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    >
                      <option value="CNY">CNY (人民币)</option>
                      <option value="USD">USD (美元)</option>
                      <option value="HKD">HKD (港币)</option>
                      <option value="JPY">JPY (日元)</option>
                      <option value="GBP">GBP (英镑)</option>
                      <option value="EUR">EUR (欧元)</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* 物理信息 */}
              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-slate-300 font-medium mb-3">物理信息（用于计算运费）</h3>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <label className="space-y-1">
                    <span className="text-slate-300">实际重量 (kg)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.weight_kg}
                      onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-300">长度 (cm)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={form.length}
                      onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-300">宽度 (cm)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={form.width}
                      onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-300">高度 (cm)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={form.height}
                      onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <label className="space-y-1">
                    <span className="text-slate-300">体积重换算系数</span>
                    <select
                      value={form.volumetric_divisor}
                      onChange={(e) => setForm((f) => ({ ...f, volumetric_divisor: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    >
                      <option value="5000">5000 (常见)</option>
                      <option value="6000">6000 (部分物流)</option>
                    </select>
                  </label>
                </div>
                {/* 实时显示计算结果 */}
                {form.length && form.width && form.height && (
                  <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 space-y-2">
                    <div className="text-xs text-slate-400 mb-2">重量计算结果：</div>
                    {(() => {
                      const length = Number(form.length) || 0;
                      const width = Number(form.width) || 0;
                      const height = Number(form.height) || 0;
                      const divisor = Number(form.volumetric_divisor) || 5000;
                      const actualWeight = Number(form.weight_kg) || 0;
                      const volumetricWeight = calculateVolumetricWeight(length, width, height, divisor);
                      const chargeableWeight = calculateChargeableWeight(actualWeight, volumetricWeight);
                      return (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-400">实际重量：</span>
                            <span className="text-slate-200">{actualWeight > 0 ? `${formatNumber(actualWeight / 1000)}kg` : "未填写"}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-400">体积重：</span>
                            <span className="text-slate-200">
                              {formatNumber(volumetricWeight / 1000)}kg
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">计算公式：</span>
                            <span className="text-slate-400">
                              {formatNumber(length)} × {formatNumber(width)} × {formatNumber(height)} ÷ {divisor}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-700">
                            <span className="text-slate-300 font-medium">计费重量：</span>
                            <span className="text-primary-300 font-semibold">
                              {formatNumber(chargeableWeight / 1000)}kg
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* 供应信息 - 多供应商支持 */}
              <div className="border-t border-slate-800 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-slate-300 font-medium">供应商信息</h3>
                  <button
                    type="button"
                    onClick={() => {
                      const costPrice = form.cost_price ? Number(form.cost_price) : undefined;
                      const newSupplier = {
                        id: "",
                        name: "",
                        price: costPrice && !isNaN(costPrice) ? costPrice : undefined,
                        moq: undefined,
                        lead_time: undefined,
                        isPrimary: form.suppliers.length === 0
                      };
                      setForm((f) => ({
                        ...f,
                        suppliers: [...f.suppliers, newSupplier]
                      }));
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-500/20 text-primary-300 text-xs hover:bg-primary-500/30 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    添加供应商
                  </button>
                </div>
                
                {form.suppliers.length === 0 ? (
                  <div className="text-sm text-slate-500 text-center py-4 border border-slate-800 rounded-lg">
                    暂无供应商，点击"添加供应商"开始添加
                  </div>
                ) : (
                  <>
                    {/* 价格对比表格 */}
                    {(() => {
                      const validSuppliers = form.suppliers.filter((s) => s.id);
                      return validSuppliers.length > 1;
                    })() && (
                      <div className="mb-4 p-4 rounded-lg border border-slate-800 bg-slate-900/50">
                        <div className="flex items-center gap-2 mb-3">
                          <TrendingUp className="h-4 w-4 text-primary-300" />
                          <h4 className="text-sm font-medium text-slate-300">供应商价格对比</h4>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-700">
                                <th className="text-left py-2 px-3 text-slate-400">供应商</th>
                                <th className="text-right py-2 px-3 text-slate-400">价格</th>
                                <th className="text-right py-2 px-3 text-slate-400">MOQ</th>
                                <th className="text-right py-2 px-3 text-slate-400">交期</th>
                                <th className="text-center py-2 px-3 text-slate-400">主</th>
                              </tr>
                            </thead>
                            <tbody>
                              {form.suppliers
                                .filter((s) => s.id)
                                .sort((a, b) => {
                                  if (a.isPrimary && !b.isPrimary) return -1;
                                  if (!a.isPrimary && b.isPrimary) return 1;
                                  const priceA = a.price || Infinity;
                                  const priceB = b.price || Infinity;
                                  return priceA - priceB;
                                })
                                .map((supplier, idx) => {
                                  const isLowestPrice = form.suppliers
                                    .filter((s) => s.id && s.price)
                                    .every((s) => !s.price || !supplier.price || s.price >= supplier.price);
                                  return (
                                    <tr key={idx} className="border-b border-slate-800">
                                      <td className="py-2 px-3">
                                        <span className="text-white">{supplier.name || "未命名"}</span>
                                      </td>
                                      <td className="py-2 px-3 text-right">
                                        {supplier.price ? (
                                          <span className={`font-medium ${isLowestPrice ? "text-emerald-300" : "text-slate-300"}`}>
                                            {formatCurrency(supplier.price, form.currency, "balance")}
                                          </span>
                                        ) : (
                                          <span className="text-slate-500">-</span>
                                        )}
                                      </td>
                                      <td className="py-2 px-3 text-right">
                                        <span className="text-slate-300">{supplier.moq || "-"}</span>
                                      </td>
                                      <td className="py-2 px-3 text-right">
                                        <span className="text-slate-300">{supplier.lead_time ? `${supplier.lead_time}天` : "-"}</span>
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        {supplier.isPrimary && (
                                          <span className="px-1.5 py-0.5 rounded text-xs bg-primary-500/20 text-primary-300">
                                            主
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      {form.suppliers.map((supplier, index) => {
                      const supplierData = suppliers.find((s) => s.id === supplier.id);
                      return (
                        <div key={index} className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              {supplier.isPrimary && (
                                <span className="px-2 py-0.5 rounded text-xs bg-primary-500/20 text-primary-300">
                                  主供应商
                                </span>
                              )}
                              <span className="text-sm text-slate-400">供应商 #{index + 1}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setForm((f) => ({
                                    ...f,
                                    suppliers: f.suppliers.map((s, i) =>
                                      i === index ? { ...s, isPrimary: !s.isPrimary } : { ...s, isPrimary: false }
                                    )
                                  }));
                                }}
                                className={`px-2 py-1 rounded text-xs transition-colors ${
                                  supplier.isPrimary
                                    ? "bg-primary-500/20 text-primary-300"
                                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                                }`}
                              >
                                设为主供应商
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setForm((f) => ({
                                    ...f,
                                    suppliers: f.suppliers.filter((_, i) => i !== index)
                                  }));
                                }}
                                className="p-1.5 rounded text-rose-400 hover:bg-rose-500/20 transition-colors"
                              >
                                <Trash className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1">
                              <span className="text-xs text-slate-400">供应商</span>
                              <select
                                value={supplier.id}
                                onChange={(e) => {
                                  const selected = suppliers.find((s) => s.id === e.target.value);
                                  setForm((f) => ({
                                    ...f,
                                    suppliers: f.suppliers.map((s, i) =>
                                      i === index
                                        ? { ...s, id: e.target.value, name: selected?.name || "" }
                                        : s
                                    )
                                  }));
                                }}
                                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                              >
                                <option value="">请选择供应商</option>
                                {suppliers.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-slate-400">拿货价</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={supplier.price || ""}
                                onChange={(e) => {
                                  setForm((f) => ({
                                    ...f,
                                    suppliers: f.suppliers.map((s, i) =>
                                      i === index ? { ...s, price: e.target.value ? Number(e.target.value) : undefined } : s
                                    )
                                  }));
                                }}
                                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                                placeholder="自动使用产品参考价"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-slate-400">最小起订量 (MOQ)</span>
                              <input
                                type="number"
                                min={0}
                                value={supplier.moq || ""}
                                onChange={(e) => {
                                  setForm((f) => ({
                                    ...f,
                                    suppliers: f.suppliers.map((s, i) =>
                                      i === index ? { ...s, moq: e.target.value ? Number(e.target.value) : undefined } : s
                                    )
                                  }));
                                }}
                                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-slate-400">生产周期 (天)</span>
                              <input
                                type="number"
                                min={0}
                                value={supplier.lead_time || ""}
                                onChange={(e) => {
                                  setForm((f) => ({
                                    ...f,
                                    suppliers: f.suppliers.map((s, i) =>
                                      i === index ? { ...s, lead_time: e.target.value ? Number(e.target.value) : undefined } : s
                                    )
                                  }));
                                }}
                                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                              />
                            </label>
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(false);
                  }}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px"
                >
                  {editingProduct ? "更新" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
