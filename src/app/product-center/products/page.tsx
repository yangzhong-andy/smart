"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";
import { type Product, type ProductStatus, type SpuListItem, getSpuListFromAPI, getVariantsBySpuIdFromAPI, getProductsFromAPI } from "@/lib/products-store";
import { formatCurrency, formatCurrencyString } from "@/lib/currency-utils";
import { PRODUCT_STATUS_LABEL } from "@/lib/enum-mapping";
import { Package, TrendingUp, DollarSign, Search, X, SortAsc, SortDesc, Download, Pencil, Trash2, Info, Plus, Trash, Palette } from "lucide-react";
import InventoryDistribution from "@/components/InventoryDistribution";
import { useWeightCalculation } from "@/hooks/use-weight-calculation";

// 变体颜色/尺寸预设选项（下拉选择，可选「其他」后自定义）
const VARIANT_COLOR_OPTIONS = ["红色", "蓝色", "黑色", "白色", "灰色", "黄色", "绿色", "粉色", "紫色", "橙色"];
const VARIANT_SIZE_OPTIONS = ["S", "M", "L", "XL", "XXL", "均码"];
const OTHER_LABEL = "其他";

// 颜色名称 → 圆点展示用背景色（规格选择区颜色点）
const COLOR_DOT_MAP: Record<string, string> = {
  红色: "#ef4444", 蓝色: "#3b82f6", 黑色: "#1f2937", 白色: "#f3f4f6", 灰色: "#9ca3af",
  黄色: "#eab308", 绿色: "#22c55e", 粉色: "#ec4899", 紫色: "#a855f7", 橙色: "#f97316"
};
const getColorDotStyle = (color: string | undefined) => {
  if (!color?.trim()) return { backgroundColor: "#64748b", borderColor: "rgba(255,255,255,0.2)" };
  const c = COLOR_DOT_MAP[color.trim()] ?? "#64748b";
  return { backgroundColor: c, borderColor: "rgba(255,255,255,0.25)" };
};

// 格式化数字
const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

// 计算体积重（千克）- 公式：长(cm) × 宽(cm) × 高(cm) ÷ 体积重换算系数
const calculateVolumetricWeight = (length: number, width: number, height: number, divisor: number = 5000): number => {
  if (!length || !width || !height || !divisor) return 0;
  // 体积重 = 长 × 宽 × 高 ÷ 体积重换算系数（结果单位：千克）
  return (length * width * height) / divisor;
};

// 计算计费重量（实际重量和体积重取较大值）
const calculateChargeableWeight = (actualWeight: number, volumetricWeight: number): number => {
  return Math.max(actualWeight || 0, volumetricWeight || 0);
};

// 兼容加载供应商数据（优先从 API 加载）
async function loadSuppliers(): Promise<Array<{ id: string; name: string }>> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/suppliers");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((s: any) => ({ id: s.id, name: s.name }));
      }
    }
  } catch (e) {
    console.error("Failed to load suppliers", e);
  }
  return [];
}

export default function ProductsPage() {
  const [spuList, setSpuList] = useState<SpuListItem[]>([]);
  const [variantCache, setVariantCache] = useState<Record<string, Product[]>>({});
  const [expandedSpuId, setExpandedSpuId] = useState<string | null>(null);
  const [loadingSpuId, setLoadingSpuId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [productsReady, setProductsReady] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 搜索、筛选、排序状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<ProductStatus | "all">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterFactory, setFilterFactory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "cost" | "created" | "none">("none");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [hoveredProductId, setHoveredProductId] = useState<string | null>(null);
  
  type VariantRow = { tempId: string; color: string; sku_id: string; cost_price: string; size: string; barcode: string };
  const newVariantRow = (): VariantRow => ({ tempId: crypto.randomUUID(), color: "", sku_id: "", cost_price: "", size: "", barcode: "" });
  const [formVariants, setFormVariants] = useState<VariantRow[]>(() => [newVariantRow()]);
  const [addVariantProduct, setAddVariantProduct] = useState<SpuListItem | null>(null);
  const [addVariantFormVariants, setAddVariantFormVariants] = useState<VariantRow[]>(() => [newVariantRow()]);
  const [form, setForm] = useState({
    sku_id: "",
    name: "",
    main_image: "",
    category: "",
    brand: "",
    description: "",
    material: "",
    customs_name_cn: "",
    customs_name_en: "",
    default_supplier_id: "",
    status: "ACTIVE" as ProductStatus,
    cost_price: "",
    target_roi: "",
    currency: "CNY" as Product["currency"],
    weight_kg: "",
    length: "",
    width: "",
    height: "",
    volumetric_divisor: "5000",
    color: "",
    size: "",
    barcode: "",
    stock_quantity: "",
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

  const { data: swrSpuList, error: productsError, mutate: mutateProducts } = useSWR<SpuListItem[]>('/api/products?list=spu');

  // 使用重量计算 Hook - 自动计算体积重和计费重量
  const weightCalculation = useWeightCalculation(
    form.length,
    form.width,
    form.height,
    form.volumetric_divisor,
    form.weight_kg
  );

  useEffect(() => {
    if (swrSpuList) {
      const list = Array.isArray(swrSpuList) ? swrSpuList : [];
      setSpuList(list);
      setProductsReady(true);
    } else if (swrSpuList === undefined) {
      setSpuList([]);
    }
  }, [swrSpuList]);

  useEffect(() => {
    if (productsError) {
      console.error('Failed to load products:', productsError);
      toast.error('加载产品数据失败');
      setProductsReady(true);
    }
  }, [productsError]);

  const loadVariantsForSpu = useCallback(async (productId: string) => {
    if (variantCache[productId]?.length) return;
    setLoadingSpuId(productId);
    try {
      const variants = await getVariantsBySpuIdFromAPI(productId);
      setVariantCache((prev) => ({ ...prev, [productId]: variants }));
    } catch (e) {
      toast.error("加载规格失败");
    } finally {
      setLoadingSpuId(null);
    }
  }, [variantCache]);

  const products = useMemo(() => Object.values(variantCache).flat(), [variantCache]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    loadSuppliers().then(setSuppliers);
  }, []);

  // 获取所有分类（来自 SPU 列表）
  const categories = useMemo(() => {
    const cats = spuList.map((s) => s.category).filter((c): c is string => !!c);
    return Array.from(new Set(cats)).sort();
  }, [spuList]);

  // 筛选和排序后的 SPU 列表（一个 SPU 一张卡片）
  const filteredSpuList = useMemo(() => {
    let result = [...spuList];
    if (filterStatus !== "all") {
      result = result.filter((s) => (s.status as string) === filterStatus);
    }
    if (filterCategory !== "all") {
      result = result.filter((s) => s.category === filterCategory);
    }
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((s) =>
        s.name.toLowerCase().includes(keyword) || (s.category && s.category.toLowerCase().includes(keyword))
      );
    }
    result.sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-Hans-CN"));
    return result;
  }, [spuList, filterStatus, filterCategory, searchKeyword]);

  const filteredProducts = useMemo(() => products, [products]);

  // 产品统计摘要（按 SPU 卡片数）
  const productSummary = useMemo(() => {
    const totalCount = filteredSpuList.length;
    const onSaleCount = filteredSpuList.filter((s) => (s.status as string) === "ACTIVE").length;
    const offSaleCount = filteredSpuList.filter((s) => (s.status as string) === "INACTIVE").length;
    const totalCost = products.reduce((sum, p) => sum + Number(p.cost_price ?? 0), 0);
    const avgCost = products.length > 0 ? totalCost / products.length : 0;
    
    // 按币种统计
    const costByCurrency = filteredProducts.reduce((acc, p) => {
      const currency = p.currency ?? "CNY";
      if (!acc[currency]) acc[currency] = 0;
      acc[currency] += Number(p.cost_price ?? 0);
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

  // 导出产品数据（导出时拉取全量变体）
  const handleExportData = async () => {
    const fullList = await getProductsFromAPI();
    if (!fullList?.length) {
      toast.error("没有可导出的数据");
      return;
    }
    const filtered = fullList.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterCategory !== "all" && p.category !== filterCategory) return false;
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        if (!p.name?.toLowerCase().includes(kw) && !p.sku_id?.toLowerCase().includes(kw) && !p.category?.toLowerCase().includes(kw)) return false;
      }
      return true;
    });
    if (filtered.length === 0) {
      toast.error("没有可导出的数据");
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

    const rows = filtered.map((p: Product) => {
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

    toast.success(`已导出 ${filtered.length} 条产品数据`);
  };

  const resetForm = () => {
    setForm({
      sku_id: "",
      name: "",
      main_image: "",
      category: "",
      brand: "",
      description: "",
      material: "",
      customs_name_cn: "",
      customs_name_en: "",
      default_supplier_id: "",
      status: "ACTIVE",
      cost_price: "",
      target_roi: "",
      currency: "CNY",
      weight_kg: "",
      length: "",
      width: "",
      height: "",
      volumetric_divisor: "5000",
      color: "",
      size: "",
      barcode: "",
      stock_quantity: "",
      factory_id: "",
      moq: "",
      lead_time: "",
      suppliers: []
    });
    setFormVariants([newVariantRow()]);
    setEditingProduct(null);
  };

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormVariants([newVariantRow()]); // 编辑时不需要多行
      setForm({
        sku_id: product.sku_id,
        name: product.name,
        main_image: product.main_image || "",
        category: product.category || "",
        brand: product.brand || "",
        description: product.description || "",
        material: product.material || "",
        customs_name_cn: product.customs_name_cn || "",
        customs_name_en: product.customs_name_en || "",
        default_supplier_id: product.default_supplier_id || "",
        status: product.status,
        cost_price: Number(product.cost_price ?? 0).toString(),
        target_roi: product.target_roi != null ? String(product.target_roi) : "",
        currency: product.currency ?? "CNY",
        weight_kg: product.weight_kg?.toString() || "",
        length: product.length?.toString() || "",
        width: product.width?.toString() || "",
        height: product.height?.toString() || "",
        color: product.color || "",
        size: product.size || "",
        barcode: product.barcode || "",
        stock_quantity: product.stock_quantity?.toString() || "",
        volumetric_divisor: product.volumetric_divisor?.toString() || "5000",
        factory_id: product.factory_id || "",
        moq: product.moq?.toString() || "",
        lead_time: product.lead_time?.toString() || "",
        suppliers: product.suppliers ?? (product.factory_id ? [{
          id: product.factory_id,
          name: product.factory_name ?? "",
          price: Number(product.cost_price ?? 0),
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
    if (isSubmitting) {
      toast.loading("正在提交，请勿重复点击");
      return;
    }

    // 新建且使用多变体模式
    if (!editingProduct && formVariants.some((r) => r.sku_id?.trim())) {
      const valid = formVariants.filter((r) => r.sku_id?.trim());
      if (valid.length === 0) {
        toast.error("请至少填写一个变体的 SKU 编码");
        return;
      }
      if (!form.name.trim()) {
        toast.error("请填写产品名称");
        return;
      }
      const skuIds = valid.map((r) => r.sku_id.trim());
      if (new Set(skuIds).size !== skuIds.length) {
        toast.error("变体 SKU 编码不能重复");
        return;
      }
      const duplicate = products.filter((p) => skuIds.includes(p.sku_id!));
      if (duplicate.length > 0) {
        toast.error(`SKU 已存在：${duplicate.map((d) => d.sku_id).join(", ")}`);
        return;
      }
      for (const r of valid) {
        const cp = Number(r.cost_price);
        if (Number.isNaN(cp) || cp < 0) {
          toast.error(`变体 ${r.sku_id || r.color || "未命名"} 的单价需为有效数字`);
          return;
        }
      }

      const suppliersList = form.suppliers?.filter((s) => s.id) || [];
      type SupplierOption = { id: string; name: string; price?: number; moq?: number; lead_time?: number; isPrimary?: boolean };
      let primarySupplier: SupplierOption | undefined = suppliersList.find((s) => s.isPrimary) ?? suppliersList[0];
      if (!primarySupplier && form.factory_id) {
        const s = suppliers.find((x) => x.id === form.factory_id);
        primarySupplier = s ? { id: s.id, name: s.name, price: Number(valid[0].cost_price), isPrimary: true } : undefined;
      }
      const suppliersData = primarySupplier ? [primarySupplier] : suppliersList;

      const productData: any = {
        name: form.name.trim(),
        main_image: form.main_image,
        category: form.category.trim() || undefined,
        brand: form.brand.trim() || undefined,
        description: form.description.trim() || undefined,
        material: form.material.trim() || undefined,
        customs_name_cn: form.customs_name_cn.trim() || undefined,
        customs_name_en: form.customs_name_en.trim() || undefined,
        default_supplier_id: form.default_supplier_id.trim() || undefined,
        status: form.status,
        currency: form.currency,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined,
        length: form.length ? Number(form.length) : undefined,
        width: form.width ? Number(form.width) : undefined,
        height: form.height ? Number(form.height) : undefined,
        volumetric_divisor: form.volumetric_divisor ? Number(form.volumetric_divisor) : undefined,
        factory_id: form.factory_id || undefined,
        factory_name: suppliers.find((s) => s.id === form.factory_id)?.name,
        moq: form.moq || undefined,
        lead_time: form.lead_time || undefined,
        suppliers: suppliersData,
        variants: valid.map((r) => ({
          sku_id: r.sku_id.trim(),
          color: r.color.trim() || undefined,
          cost_price: Number(r.cost_price),
          size: r.size.trim() || undefined,
          barcode: r.barcode.trim() || undefined,
        })),
      };

      setIsSubmitting(true);
      try {
        const response = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productData),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || "操作失败");
        }
        await mutateProducts?.();
        toast.success(`已创建产品「${form.name}」及 ${valid.length} 个变体`);
        resetForm();
        setIsModalOpen(false);
      } catch (err: any) {
        toast.error(err?.message || "保存失败");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // 单变体模式（编辑或旧式新建）
    if (!form.sku_id.trim() || !form.name.trim()) {
      toast.error("请填写 SKU 编码与产品名称");
      return;
    }
    const costPrice = Number(form.cost_price);
    if (Number.isNaN(costPrice) || costPrice < 0) {
      toast.error("成本价需为数字且不小于 0");
      return;
    }
    const duplicate = products.find((p) =>
      p.sku_id === form.sku_id.trim() && (!editingProduct || p.sku_id !== editingProduct.sku_id)
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
      brand: form.brand.trim() || undefined,
      description: form.description.trim() || undefined,
      material: form.material.trim() || undefined,
      customs_name_cn: form.customs_name_cn.trim() || undefined,
      customs_name_en: form.customs_name_en.trim() || undefined,
      default_supplier_id: form.default_supplier_id.trim() || undefined,
      status: form.status,
      cost_price: costPrice,
      target_roi: form.target_roi ? Number(form.target_roi) : undefined,
      currency: form.currency,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined,
      length: form.length ? Number(form.length) : undefined,
      width: form.width ? Number(form.width) : undefined,
      height: form.height ? Number(form.height) : undefined,
      volumetric_divisor: form.volumetric_divisor ? Number(form.volumetric_divisor) : undefined,
      color: form.color.trim() || undefined,
      size: form.size.trim() || undefined,
      barcode: form.barcode.trim() || undefined,
      stock_quantity: form.stock_quantity ? Number(form.stock_quantity) : undefined,
      suppliers: suppliersList.length > 0 ? suppliersList : undefined,
    };
    
    const url = editingProduct
      ? `/api/products/${encodeURIComponent(editingProduct.sku_id)}`
      : '/api/products';
    const method = editingProduct ? 'PUT' : 'POST';

    setIsSubmitting(true);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || '操作失败');
      }
      await mutateProducts?.();
      if (editingProduct?.product_id) {
        setVariantCache((prev) => {
          const next = { ...prev };
          delete next[editingProduct.product_id!];
          return next;
        });
      }
      toast.success(editingProduct ? "产品已更新" : "产品已创建");
      resetForm();
      setIsModalOpen(false);
    } catch (error: any) {
      console.error('Failed to save product:', error);
      toast.error(error.message || '保存产品失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddVariants = async () => {
    if (!addVariantProduct) return;
    const spuId = addVariantProduct.productId;
    if (!spuId) {
      toast.error("无法识别所属产品，请刷新页面后重试");
      return;
    }
    const valid = addVariantFormVariants.filter((r) => r.sku_id?.trim());
    if (valid.length === 0) {
      toast.error("请至少填写一个变体的 SKU 编码");
      return;
    }
    const skuIds = valid.map((r) => r.sku_id.trim());
    if (new Set(skuIds).size !== skuIds.length) {
      toast.error("变体 SKU 编码不能重复");
      return;
    }
    const existingSkuIds = products.map((p) => p.sku_id);
    const duplicate = skuIds.filter((id) => existingSkuIds.includes(id));
    if (duplicate.length > 0) {
      toast.error(`SKU 已存在：${duplicate.join(", ")}`);
      return;
    }
    for (const r of valid) {
      const cp = Number(r.cost_price);
      if (Number.isNaN(cp) || cp < 0) {
        toast.error(`变体 ${r.sku_id || r.color || "未命名"} 的单价需为有效数字`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: addVariantProduct.name,
        product_id: spuId,
        variants: valid.map((r) => ({
          sku_id: r.sku_id.trim(),
          color: r.color.trim() || undefined,
          cost_price: Number(r.cost_price),
          size: r.size.trim() || undefined,
          barcode: r.barcode.trim() || undefined,
        })),
      };
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "添加失败");
      }
      await mutateProducts?.();
      setVariantCache((prev) => {
        const next = { ...prev };
        delete next[spuId];
        return next;
      });
      toast.success(`已为「${addVariantProduct.name}」添加 ${valid.length} 个变体`);
      setAddVariantProduct(null);
      setAddVariantFormVariants([newVariantRow()]);
    } catch (err: any) {
      toast.error(err?.message || "添加变体失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (skuId: string) => {
    if (!confirm("⚠️ 确定要删除这个产品吗？\n此操作不可恢复！")) return;

    try {
      const response = await fetch(`/api/products/${encodeURIComponent(skuId)}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || '删除失败');
      }
      const productId = Object.keys(variantCache).find((pid) =>
        variantCache[pid].some((p) => p.sku_id === skuId)
      );
      if (productId) {
        setVariantCache((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
      }
      await mutateProducts?.();
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
        {filteredSpuList.length === 0 ? (
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
            {filteredSpuList.map((spu) => {
              const variants = variantCache[spu.productId] ?? [];
              const isExpanded = expandedSpuId === spu.productId;
              const isLoading = loadingSpuId === spu.productId;
              const prices = variants.map((v) => Number((v as Product).cost_price ?? 0)).filter((n) => n > 0);
              const priceRange: string | null =
                prices.length === 0
                  ? null
                  : prices.length === 1
                    ? formatCurrencyString(prices[0], "CNY")
                    : `${formatCurrencyString(Math.min(...prices), "CNY")} ~ ${formatCurrencyString(Math.max(...prices), "CNY")}`;

              return (
                <div
                  key={spu.productId}
                  className="group relative overflow-hidden rounded-2xl border p-5 transition-all"
                  style={{
                    background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                    borderRadius: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.1)"
                  }}
                >
                  {/* 聚合展示：主图、名称、状态、价格范围（点击卡片即按需加载变体并展开规格） */}
                  <div
                    role="button"
                    tabIndex={0}
                    className="mb-4 cursor-pointer rounded-lg outline-none focus:ring-2 focus:ring-primary-500/50"
                    onClick={() => loadVariantsForSpu(spu.productId).then(() => setExpandedSpuId(spu.productId))}
                    onKeyDown={(e) => e.key === "Enter" && loadVariantsForSpu(spu.productId).then(() => setExpandedSpuId(spu.productId))}
                  >
                    <div className="relative h-48 bg-slate-800 rounded-lg overflow-hidden">
                      {spu.mainImage ? (
                        <a href={spu.mainImage} target="_blank" rel="noreferrer" className="block w-full h-full" onClick={(e) => e.stopPropagation()}>
                          <img src={spu.mainImage} alt={spu.name} className="w-full h-full object-cover" />
                        </a>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <Package className="h-12 w-12" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            spu.status === "ACTIVE" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700/50 text-slate-400"
                          }`}
                        >
                          {PRODUCT_STATUS_LABEL[(spu.status as ProductStatus) ?? "ACTIVE"]}
                        </span>
                      </div>
                    </div>

                    <div className="absolute top-3 right-3 flex gap-2 z-30">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddVariantProduct(spu);
                          setAddVariantFormVariants([newVariantRow()]);
                        }}
                        className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20"
                        title="添加变体"
                      >
                        <Palette className="h-3 w-3" />
                      </button>
                      {variants[0] && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleOpenModal(variants[0]); }}
                          className="flex items-center gap-1 rounded-md border border-primary-500/40 bg-primary-500/10 px-2 py-1 text-xs font-medium text-primary-100 hover:bg-primary-500/20"
                          title="编辑"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <div className="mb-3 mt-1">
                      <h3 className="font-semibold text-white text-base mb-1">{spu.name}</h3>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-400">价格范围</span>
                        <span className="text-emerald-300 font-medium text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {priceRange ?? (isLoading ? "加载中…" : "点击卡片加载规格")}
                        </span>
                      </div>
                      {spu.category && (
                        <p className="text-xs text-slate-400">分类：{spu.category}</p>
                      )}
                    </div>
                  </div>

                  {/* 规格选择：平时 3～5 个颜色圆点，展开后表格 */}
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-slate-400 mb-2">规格选择</p>
                    {!variants.length && !isLoading && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); loadVariantsForSpu(spu.productId).then(() => setExpandedSpuId(spu.productId)); }}
                        className="text-xs text-primary-400 hover:text-primary-300"
                      >
                        展开加载规格
                      </button>
                    )}
                    {isLoading && <span className="text-xs text-slate-500">加载中…</span>}
                    {variants.length > 0 && (
                      <>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {variants.slice(0, 5).map((v) => (
                            <span
                              key={v.sku_id}
                              className="w-5 h-5 rounded-full border flex-shrink-0"
                              style={getColorDotStyle((v as Product).color)}
                              title={(v as Product).color || v.sku_id}
                            />
                          ))}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedSpuId(isExpanded ? null : spu.productId); }}
                            className="text-xs text-primary-400 hover:text-primary-300"
                          >
                            {isExpanded ? "收起" : "展开"}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border border-slate-700 rounded">
                              <thead>
                                <tr className="bg-slate-800/80">
                                  <th className="px-2 py-1.5 text-left text-slate-400">颜色</th>
                                  <th className="px-2 py-1.5 text-left text-slate-400">SKU</th>
                                  <th className="px-2 py-1.5 text-right text-slate-400">单价</th>
                                  <th className="px-2 py-1.5 text-right text-slate-400">库存</th>
                                  <th className="px-2 py-1.5 w-20"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {variants.map((v) => (
                                  <tr key={v.sku_id} className="border-t border-slate-700">
                                    <td className="px-2 py-1.5 text-slate-200">{(v as Product).color || "—"}</td>
                                    <td className="px-2 py-1.5 text-slate-400 font-mono">{v.sku_id}</td>
                                    <td className="px-2 py-1.5 text-right text-slate-200">
                                      {formatCurrency(Number((v as Product).cost_price ?? 0), (v as Product).currency ?? "CNY", "balance")}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-slate-200">{(v as Product).stock_quantity ?? 0}</td>
                                    <td className="px-2 py-1.5 flex gap-1">
                                      <button type="button" onClick={() => handleOpenModal(v as Product)} className="text-primary-400 hover:underline">编辑</button>
                                      <button type="button" onClick={() => handleDelete(v.sku_id)} className="text-rose-400 hover:underline">删除</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
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
                {editingProduct ? (
                  <label className="space-y-1">
                    <span className="text-slate-300">SPU 编码 <span className="text-rose-400">*</span></span>
                    <input
                      value={form.sku_id}
                      onChange={(e) => setForm((f) => ({ ...f, sku_id: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      required
                      disabled
                    />
                  </label>
                ) : null}
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
                  <span className="text-slate-300">品牌</span>
                  <input
                    value={form.brand}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="产品品牌"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">材质</span>
                  <input
                    value={form.material}
                    onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="如：棉、聚酯纤维等"
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

              {/* 产品描述 */}
              <label className="space-y-1">
                <span className="text-slate-300">产品描述</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  placeholder="产品详细描述..."
                  rows={3}
                />
              </label>

              {/* 报关信息 */}
              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-slate-300 font-medium mb-3">报关信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <label className="space-y-1">
                    <span className="text-slate-300">报关名（中文）</span>
                    <input
                      value={form.customs_name_cn}
                      onChange={(e) => setForm((f) => ({ ...f, customs_name_cn: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      placeholder="中文报关名称"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-300">报关名（英文）</span>
                    <input
                      value={form.customs_name_en}
                      onChange={(e) => setForm((f) => ({ ...f, customs_name_en: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      placeholder="English Customs Name"
                    />
                  </label>
                </div>
              </div>

              {/* 默认供应商 */}
              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-slate-300 font-medium mb-3">默认供应商</h3>
                <label className="space-y-1">
                  <span className="text-slate-300">默认供应商</span>
                  <select
                    value={form.default_supplier_id}
                    onChange={(e) => setForm((f) => ({ ...f, default_supplier_id: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  >
                    <option value="">请选择默认供应商</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    选择该产品的默认供应商（也可通过供应商列表设置主供应商）
                  </p>
                </label>
              </div>

              {/* SKU 变体信息：新建时支持多变体，编辑时为单变体 */}
              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-slate-300 font-medium mb-3 flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  {editingProduct ? "SKU 变体信息" : "变体列表（可添加多个颜色/规格）"}
                </h3>
                {editingProduct ? (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500">
                      当前变体的规格与库存信息，用于采购与入库区分颜色/尺寸。
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <label className="space-y-1">
                        <span className="text-slate-300">SKU 编码</span>
                        <input
                          value={form.sku_id}
                          readOnly
                          className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-slate-400 cursor-not-allowed"
                          title="变体 SKU 不可修改"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-slate-300">颜色</span>
                        <select
                          value={VARIANT_COLOR_OPTIONS.includes(form.color) ? form.color : (form.color ? OTHER_LABEL : "")}
                          onChange={(e) => setForm((f) => ({ ...f, color: e.target.value === OTHER_LABEL ? "" : e.target.value }))}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                        >
                          <option value="">请选择</option>
                          {VARIANT_COLOR_OPTIONS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          <option value={OTHER_LABEL}>{OTHER_LABEL}</option>
                        </select>
                        {(!form.color || form.color === OTHER_LABEL || !VARIANT_COLOR_OPTIONS.includes(form.color)) && (
                          <input
                            value={VARIANT_COLOR_OPTIONS.includes(form.color) ? "" : form.color}
                            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-primary-400"
                            placeholder="自定义颜色"
                          />
                        )}
                      </label>
                      <label className="space-y-1">
                        <span className="text-slate-300">尺寸</span>
                        <select
                          value={VARIANT_SIZE_OPTIONS.includes(form.size) ? form.size : (form.size ? OTHER_LABEL : "")}
                          onChange={(e) => setForm((f) => ({ ...f, size: e.target.value === OTHER_LABEL ? "" : e.target.value }))}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                        >
                          <option value="">请选择</option>
                          {VARIANT_SIZE_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                          <option value={OTHER_LABEL}>{OTHER_LABEL}</option>
                        </select>
                        {(!form.size || form.size === OTHER_LABEL || !VARIANT_SIZE_OPTIONS.includes(form.size)) && (
                          <input
                            value={VARIANT_SIZE_OPTIONS.includes(form.size) ? "" : form.size}
                            onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-primary-400"
                            placeholder="自定义尺寸"
                          />
                        )}
                      </label>
                      <label className="space-y-1">
                        <span className="text-slate-300">条形码</span>
                        <input
                          value={form.barcode}
                          onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                          placeholder="产品条形码（选填）"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-slate-300">成本价（元）<span className="text-rose-400">*</span></span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={form.cost_price}
                          onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                          placeholder="0.00"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-slate-300">总库存数量</span>
                        <input
                          type="number"
                          min={0}
                          value={form.stock_quantity}
                          onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                          placeholder="0"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">每个变体一行，填写颜色、SKU 编码、单价</p>
                      <button
                        type="button"
                        onClick={() => setFormVariants((prev) => [...prev, newVariantRow()])}
                        className="flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
                      >
                        <Plus className="h-3 w-3" />
                        添加变体
                      </button>
                    </div>
                    <div className="rounded-lg border border-slate-700 overflow-hidden">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-800/80">
                          <tr>
                            <th className="px-3 py-2 text-left text-slate-400 w-10">#</th>
                            <th className="px-3 py-2 text-left text-slate-400">颜色</th>
                            <th className="px-3 py-2 text-left text-slate-400">SKU 编码 <span className="text-rose-400">*</span></th>
                            <th className="px-3 py-2 text-left text-slate-400">单价(元) <span className="text-rose-400">*</span></th>
                            <th className="px-3 py-2 text-left text-slate-400">尺寸</th>
                            <th className="px-3 py-2 text-left text-slate-400">条形码</th>
                            <th className="px-3 py-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {formVariants.map((row, idx) => (
                            <tr key={row.tempId} className="bg-slate-900/40">
                              <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={VARIANT_COLOR_OPTIONS.includes(row.color) ? row.color : (row.color ? OTHER_LABEL : "")}
                                  onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, color: e.target.value === OTHER_LABEL ? "" : e.target.value } : r)))}
                                  className="w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 text-xs"
                                >
                                  <option value="">选择</option>
                                  {VARIANT_COLOR_OPTIONS.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                  <option value={OTHER_LABEL}>{OTHER_LABEL}</option>
                                </select>
                                {row.color && !VARIANT_COLOR_OPTIONS.includes(row.color) && (
                                  <input
                                    value={row.color}
                                    onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, color: e.target.value } : r)))}
                                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 text-xs"
                                    placeholder="自定义"
                                  />
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  value={row.sku_id}
                                  onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, sku_id: e.target.value } : r)))}
                                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
                                  placeholder="如：mazha-red"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={row.cost_price}
                                  onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, cost_price: e.target.value } : r)))}
                                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-right text-slate-200"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={VARIANT_SIZE_OPTIONS.includes(row.size) ? row.size : (row.size ? OTHER_LABEL : "")}
                                  onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, size: e.target.value === OTHER_LABEL ? "" : e.target.value } : r)))}
                                  className="w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 text-xs"
                                >
                                  <option value="">选择</option>
                                  {VARIANT_SIZE_OPTIONS.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                  <option value={OTHER_LABEL}>{OTHER_LABEL}</option>
                                </select>
                                {row.size && !VARIANT_SIZE_OPTIONS.includes(row.size) && (
                                  <input
                                    value={row.size}
                                    onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, size: e.target.value } : r)))}
                                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 text-xs"
                                    placeholder="自定义"
                                  />
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  value={row.barcode}
                                  onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, barcode: e.target.value } : r)))}
                                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
                                  placeholder="可选"
                                />
                              </td>
                              <td className="px-3 py-2">
                                {formVariants.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setFormVariants((prev) => prev.filter((r) => r.tempId !== row.tempId))}
                                    className="text-slate-400 hover:text-rose-400"
                                    title="删除"
                                  >
                                    <Trash className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
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
                    <span className="text-slate-300">参考拿货价 {editingProduct ? <span className="text-rose-400">*</span> : null}</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.cost_price}
                      onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      required={!!editingProduct}
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
                {/* 实时显示计算结果 - 使用 Hook 自动计算 */}
                {weightCalculation.hasValidDimensions && (
                  <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 space-y-2">
                    <div className="text-xs text-slate-400 mb-2">重量计算结果：</div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">实际重量：</span>
                      <span className="text-slate-200">
                        {weightCalculation.actualWeight > 0 
                          ? `${formatNumber(weightCalculation.actualWeight)}kg` 
                          : "未填写"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">体积重：</span>
                      <span className="text-slate-200">
                        {formatNumber(weightCalculation.volumetricWeight)}kg
                      </span>
                    </div>
                    {weightCalculation.formula && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">计算公式：</span>
                        <span className="text-slate-400">
                          {weightCalculation.formula}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-700">
                      <span className="text-slate-300 font-medium">计费重量：</span>
                      <span className="text-primary-300 font-semibold">
                        {formatNumber(weightCalculation.chargeableWeight)}kg
                      </span>
                    </div>
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
                  className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (editingProduct ? "更新中..." : "保存中...") : (editingProduct ? "更新" : "保存")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 为已有产品添加变体 */}
      {addVariantProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">为「{addVariantProduct.name}」添加变体</h2>
                <p className="text-xs text-slate-400 mt-1">为已有产品添加新的颜色/规格变体</p>
              </div>
              <button
                onClick={() => {
                  setAddVariantProduct(null);
                  setAddVariantFormVariants([newVariantRow()]);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">填写新变体信息，可一次添加多个</span>
                <button
                  type="button"
                  onClick={() => setAddVariantFormVariants((prev) => [...prev, newVariantRow()])}
                  className="flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
                >
                  <Plus className="h-3 w-3" />
                  添加变体
                </button>
              </div>
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-800/80">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-400 w-10">#</th>
                      <th className="px-3 py-2 text-left text-slate-400">颜色</th>
                      <th className="px-3 py-2 text-left text-slate-400">SKU 编码 <span className="text-rose-400">*</span></th>
                      <th className="px-3 py-2 text-left text-slate-400">单价(元) <span className="text-rose-400">*</span></th>
                      <th className="px-3 py-2 text-left text-slate-400">尺寸</th>
                      <th className="px-3 py-2 text-left text-slate-400">条形码</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {addVariantFormVariants.map((row, idx) => (
                      <tr key={row.tempId} className="bg-slate-900/40">
                        <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <select
                            value={VARIANT_COLOR_OPTIONS.includes(row.color) ? row.color : (row.color ? OTHER_LABEL : "")}
                            onChange={(e) => setAddVariantFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, color: e.target.value === OTHER_LABEL ? "" : e.target.value } : r)))}
                            className="w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 text-xs"
                          >
                            <option value="">选择</option>
                            {VARIANT_COLOR_OPTIONS.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                            <option value={OTHER_LABEL}>{OTHER_LABEL}</option>
                          </select>
                          {row.color && !VARIANT_COLOR_OPTIONS.includes(row.color) && (
                            <input
                              value={row.color}
                              onChange={(e) => setAddVariantFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, color: e.target.value } : r)))}
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 text-xs"
                              placeholder="自定义"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.sku_id}
                            onChange={(e) => setAddVariantFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, sku_id: e.target.value } : r)))}
                            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
                            placeholder="如：mazha-red"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.cost_price}
                            onChange={(e) => setAddVariantFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, cost_price: e.target.value } : r)))}
                            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-right text-slate-200"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={VARIANT_SIZE_OPTIONS.includes(row.size) ? row.size : (row.size ? OTHER_LABEL : "")}
                            onChange={(e) => setAddVariantFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, size: e.target.value === OTHER_LABEL ? "" : e.target.value } : r)))}
                            className="w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 text-xs"
                          >
                            <option value="">选择</option>
                            {VARIANT_SIZE_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                            <option value={OTHER_LABEL}>{OTHER_LABEL}</option>
                          </select>
                          {row.size && !VARIANT_SIZE_OPTIONS.includes(row.size) && (
                            <input
                              value={row.size}
                              onChange={(e) => setAddVariantFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, size: e.target.value } : r)))}
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 text-xs"
                              placeholder="自定义"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.barcode}
                            onChange={(e) => setAddVariantFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, barcode: e.target.value } : r)))}
                            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
                            placeholder="可选"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {addVariantFormVariants.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setAddVariantFormVariants((prev) => prev.filter((r) => r.tempId !== row.tempId))}
                              className="text-slate-400 hover:text-rose-400"
                              title="删除"
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddVariantProduct(null);
                    setAddVariantFormVariants([newVariantRow()]);
                  }}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleAddVariants}
                  disabled={isSubmitting}
                  className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50"
                >
                  {isSubmitting ? "添加中..." : "确定添加"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
