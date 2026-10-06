"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { type Product, type ProductStatus, type SpuListItem, getProductsFromAPI } from "@/lib/products-store";
import { formatCurrency, formatCurrencyString } from "@/lib/currency-utils";
import { Download, X, ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { filterProductWorkspace, incompleteSku, productMatchesGroup, skuMatchesKeyword } from "@/lib/product-workspace";
import { validateVariantRows, serializeVariantRows, variantRowFromProduct } from "@/lib/product-variant-entry";
import { ProductsStats } from "./components/ProductsStats";
import { ProductsFilters } from "./components/ProductsFilters";
import { ProductsTable } from "./components/ProductsTable";
import { ProductFormDialog } from "./components/ProductFormDialog";
import { ProductDetailDialog } from "./components/ProductDetailDialog";
import { AddVariantDialog } from "./components/AddVariantDialog";
import type { ProductFormState, VariantRow } from "./components/types";
import { newVariantRow } from "./components/types";
import { formatNumber } from "./components/constants";
import { useSystemConfirm } from "@/hooks/use-system-confirm";

// 鍏煎鍔犺浇渚涘簲鍟嗘暟鎹紙浼樺厛�?API 鍔犺浇锛?
async function loadSuppliers(): Promise<Array<{ id: string; name: string }>> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/suppliers?page=1&pageSize=50");
    if (res.ok) {
      const json = await res.json();
      const data = Array.isArray(json) ? json : (json?.data ?? []);
      if (data.length > 0) return data.map((s: any) => ({ id: s.id, name: s.name }));
    }
  } catch (e) {
    console.error("Failed to load suppliers", e);
  }
  return [];
}

export default function ProductsPage() {
  const { confirm, confirmDialog } = useSystemConfirm();
  const [spuList, setSpuList] = useState<SpuListItem[]>([]);
  const [variantCache, setVariantCache] = useState<Record<string, Product[]>>({});
  const [expandedSpuId, setExpandedSpuId] = useState<string | null>(null);
  const [loadingSpuId, setLoadingSpuId] = useState<string | null>(null);
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>({});
  const autoExpanded = useRef(false);
  const pendingVariants = useRef(new Map<string, Promise<Product[]>>());
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [productsReady, setProductsReady] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 鎼滅储銆佺瓫閫夈€佹帓搴忕姸�?
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<ProductStatus | "all">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterFactory, setFilterFactory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "cost" | "created" | "none">("none");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [hoveredProductId, setHoveredProductId] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const [formVariants, setFormVariants] = useState<VariantRow[]>(() => [newVariantRow()]);
  const [addVariantProduct, setAddVariantProduct] = useState<SpuListItem | null>(null);
  const [addVariantFormVariants, setAddVariantFormVariants] = useState<VariantRow[]>(() => [newVariantRow()]);
  const [form, setForm] = useState<ProductFormState>({
    spu_code: "",
    sku_id: "",
    name: "",
    main_image: "",
    gallery_images: [],
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

  const { data: swrProductsData, error: productsError, mutate: mutateProducts, isValidating } = useSWR<any>(
    '/api/products?list=spu&workspace=true&includeImages=true',
    async (url: string) => {
      const response = await fetch(url + "&noCache=true", { cache: "no-store", signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error("产品资料加载失败，请重试");
      const data = await response.json();
      if (!Array.isArray(data?.list)) throw new Error("产品资料格式异常");
      return data;
    }, { revalidateOnFocus: false }
  );

  // 按供应商过滤�?productId 集合（来�?/api/product-suppliers?supplierId=...�?
  const [supplierFilterProductIds, setSupplierFilterProductIds] = useState<Set<string> | null>(null);
  const [supplierFilterName, setSupplierFilterName] = useState<string | null>(null);


  useEffect(() => {
    if (swrProductsData) {
      const list = Array.isArray(swrProductsData) ? swrProductsData : (swrProductsData.list ?? swrProductsData.data ?? []);
      setSpuList(Array.isArray(list) ? list : []);
      setProductsReady(true);
    } else if (swrProductsData === undefined) {
      setSpuList([]);
    }
  }, [swrProductsData]);

  useEffect(() => {
    if (productsError) {
      console.error('Failed to load products:', productsError);
      toast.error('加载产品数据失败');
      setProductsReady(true);
    }
  }, [productsError]);

  // 如果 URL 中带�?supplierId，则按供应商过滤产品列表
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const supplierId = params.get("supplierId");
    if (!supplierId) return;
    const supplierName = params.get("supplierName");
    if (supplierName) setSupplierFilterName(supplierName);
    (async () => {
      try {
        const res = await fetch(
          `/api/product-suppliers?supplierId=${encodeURIComponent(supplierId)}&page=1&pageSize=2000`
        );
        if (!res.ok) return;
        const json = await res.json();
        const list: any[] = Array.isArray(json) ? json : json?.data ?? [];
        const ids = new Set<string>();
        for (const ps of list) {
          if (ps.productId) ids.add(ps.productId as string);
        }
        setSupplierFilterProductIds(ids);
      } catch (error) {
        console.error("Failed to load supplier filter products", error);
      }
    })();
  }, []);

  const loadVariantsForSpu = useCallback(async (productId: string, force = false): Promise<Product[]> => {
    if (!force && variantCache[productId]) return variantCache[productId];
    const pending = pendingVariants.current.get(productId);
    if (pending) {
      if (!force) return pending;
      // A save-triggered refresh must not reuse an older pre-save response.
      await pending;
    }
    const request = (async () => {
      setLoadingSpuId(productId);
      setVariantErrors(prev => ({ ...prev, [productId]: "" }));
      try {
        const response = await fetch("/api/products?spuId=" + encodeURIComponent(productId), { cache: "no-store", signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error("SKU 明细加载失败，请重试");
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("SKU 明细格式异常");
        const variants = rows.filter((row: Product) => row.variant_id);
        setVariantCache(prev => ({ ...prev, [productId]: variants }));
        return variants;
      } catch (error) {
        setVariantErrors(prev => ({ ...prev, [productId]: error instanceof Error ? error.message : "加载失败" }));
        return [];
      } finally {
        pendingVariants.current.delete(productId);
        setLoadingSpuId(current => current === productId ? null : current);
      }
    })();
    pendingVariants.current.set(productId, request);
    return request;
  }, [variantCache]);

  useEffect(() => {
    if (!autoExpanded.current && spuList.length > 0) {
      autoExpanded.current = true;
      setExpandedSpuId(spuList[0].productId);
      void loadVariantsForSpu(spuList[0].productId);
    }
  }, [spuList, loadVariantsForSpu]);

  const refreshWorkspace = async (productId?: string) => {
    try { await mutateProducts(); } catch { toast.error("保存已成功，但列表刷新失败，请点刷新资料；无需重新提交"); }
    if (productId) await loadVariantsForSpu(productId, true);
  };

  const existingSkuIds = useMemo(() => spuList.flatMap(item => (item.skuIndex ?? []).map(row => row.sku_id)), [spuList]);

  const products = useMemo(() => Object.values(variantCache).flat(), [variantCache]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    loadSuppliers().then(setSuppliers);
  }, []);

  // 鑾峰彇鎵€鏈夊垎绫伙紙鏉ヨ嚜 SPU 鍒楄〃锛?
  const categories = useMemo(() => {
    const cats = spuList.map((s) => s.category).filter((c): c is string => !!c);
    return Array.from(new Set(cats)).sort();
  }, [spuList]);

  // 绛涢€夊拰鎺掑簭鍚庣�?SPU 鍒楄〃锛堜竴�?SPU 涓€寮犲崱鐗囷級
  const filteredSpuList = useMemo(() => filterProductWorkspace(spuList, {
    keyword: searchKeyword, status: filterStatus, category: filterCategory, supplier: filterFactory,
    sortBy, sortOrder, supplierProductIds: supplierFilterProductIds,
  }), [spuList, filterStatus, filterCategory, filterFactory, searchKeyword, sortBy, sortOrder, supplierFilterProductIds]);

  const productSummary = useMemo(() => {
    const rows = filteredSpuList.flatMap(item => item.skuIndex ?? []);
    return {
      totalCount: filteredSpuList.length,
      onSaleCount: filteredSpuList.filter(item => item.status === "ACTIVE").length,
      offSaleCount: filteredSpuList.filter(item => item.status === "INACTIVE").length,
      skuCount: filteredSpuList.reduce((sum, item) => sum + item.variantCount, 0),
      incompleteCount: rows.filter(incompleteSku).length,
      avgCost: 0,
    };
  }, [filteredSpuList]);

  const handleExportData = async () => {
    const fullList = await getProductsFromAPI();
    if (!fullList?.length) {
      toast.error("没有可导出的数据");
      return;
    }
    const allowed = new Map(filteredSpuList.map(item => [item.productId, item]));
    const filtered = fullList.filter(product => {
      const group = allowed.get(product.product_id ?? "");
      return group && (productMatchesGroup(group, searchKeyword) || skuMatchesKeyword(product, searchKeyword));
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
      ...rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(","))
    ].join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "产品档案_" + new Date().toISOString().slice(0, 10) + ".csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("已导出 " + filtered.length + " 条产品数据");
  };

  const resetForm = () => {
    setForm({
      spu_code: "",
      sku_id: "",
      name: "",
      main_image: "",
      gallery_images: [],
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
      setFormVariants([newVariantRow()]); // 编辑时不需要多�?
      setForm({
        spu_code: (product as any).spu_code ?? "",
        sku_id: product.sku_id,
        name: product.name,
        main_image: product.main_image || "",
        gallery_images: Array.isArray((product as any).gallery_images) ? (product as any).gallery_images : [],
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

    // 鏂板缓涓斾娇鐢ㄥ鍙樹綋妯″紡
    if (!editingProduct) {
      const valid = formVariants;
      if (!validateVariantRows(valid, existingSkuIds).valid) {
        toast.error("请先修正 SKU 表格中标出的内容；不会跳过填写不完整的行");
        return;
      }
      if (!form.name.trim()) { toast.error("请填写产品名称"); return; }

      const suppliersList = form.suppliers?.filter((s) => s.id) || [];
      type SupplierOption = { id: string; name: string; price?: number; moq?: number; lead_time?: number; isPrimary?: boolean };
      let primarySupplier: SupplierOption | undefined = suppliersList.find((s) => s.isPrimary) ?? suppliersList[0];
      if (!primarySupplier && form.factory_id) {
        const s = suppliers.find((x) => x.id === form.factory_id);
        primarySupplier = s ? { id: s.id, name: s.name, price: Number(valid[0].cost_price), isPrimary: true } : undefined;
      }
      const suppliersData = suppliersList.length ? suppliersList : (primarySupplier ? [primarySupplier] : []);

      const galleryList = Array.isArray(form.gallery_images) ? form.gallery_images : [];
      const productData: any = {
        creation_mode: "new",
        target_roi: form.target_roi ? Number(form.target_roi) : undefined,
        spu_code: form.spu_code.trim() || undefined,
        name: form.name.trim(),
        main_image: form.main_image,
        gallery_images: galleryList.slice(0, 5),
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
        variants: serializeVariantRows(valid),
      };

      const PAYLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
      const bodyStrBatch = JSON.stringify(productData);
      if (bodyStrBatch.length > PAYLOAD_LIMIT_BYTES) {
        const mb = (bodyStrBatch.length / 1024 / 1024).toFixed(2);
        toast.error("请求体约 " + mb + "MB，超过线上限制（约 4.5MB）。请减少产品多图数量或使用更小图片后重试。");
        return;
      }

      setIsSubmitting(true);
      try {
        const response = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: bodyStrBatch,
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const message = response.status === 413
            ? "璇锋眰浣撹繃澶э紙鍥剧墖杩囧鎴栬繃澶э級锛岃鍑忓皯澶氬浘鏁伴噺鎴栦娇鐢ㄦ洿灏忓浘鐗囧悗閲嶈瘯"
            : (err?.error || "操作失败");
          throw new Error(message);
        }
        const created = await response.json();
        await refreshWorkspace(created.product_id);
        if (created.product_id) setExpandedSpuId(created.product_id);
        toast.success("已创建产品「" + form.name + "」及 " + valid.length + " 个变体");
        resetForm();
        setIsModalOpen(false);
      } catch (err: any) {
        toast.error(err?.message || "保存失败");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // 鍗曞彉浣撴ā寮忥紙缂栬緫鎴栨棫寮忔柊寤猴級
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
    
    // 澶勭悊渚涘簲鍟嗕俊鎭?
    // 濡傛灉鏈夋柊鐨勫渚涘簲鍟嗗垪琛紝浣跨敤瀹冿紱鍚﹀垯鍏煎鏃х殑鍗曚緵搴斿晢妯″紡
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
    
    const galleryList = Array.isArray(form.gallery_images) ? form.gallery_images : [];
    const origGallery = Array.isArray((editingProduct as any)?.gallery_images) ? (editingProduct as any).gallery_images : [];
    const galleryUnchanged = galleryList.length === origGallery.length && galleryList.every((url, i) => url === origGallery[i]);

    // 缂栬緫鏃朵粎鏀瑰彉浣撳瓧娈碉紙濡傚崟浠枫€佸簱瀛橈級鈫?�?PATCH锛岃姹傚皬銆佷繚瀛樺�?
    const variantOnlyFields = {
      cost_price: costPrice,
      color: form.color.trim() || undefined,
      size: form.size.trim() || undefined,
      barcode: form.barcode.trim() || undefined,
      target_roi: form.target_roi ? Number(form.target_roi) : undefined,
      currency: form.currency,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined,
      length: form.length ? Number(form.length) : undefined,
      width: form.width ? Number(form.width) : undefined,
      height: form.height ? Number(form.height) : undefined,
      volumetric_divisor: form.volumetric_divisor ? Number(form.volumetric_divisor) : undefined,
    };
    const onlyVariantChanged = editingProduct && (
      form.sku_id.trim() === editingProduct.sku_id &&
      form.name.trim() === editingProduct.name &&
      form.main_image === (editingProduct.main_image ?? "") &&
      galleryUnchanged &&
      form.category.trim() === (editingProduct.category ?? "") &&
      form.brand.trim() === (editingProduct.brand ?? "") &&
      form.description.trim() === (editingProduct.description ?? "") &&
      form.material.trim() === (editingProduct.material ?? "") &&
      form.status === editingProduct.status &&
      form.spu_code.trim() === ((editingProduct as any).spu_code ?? "") &&
      form.customs_name_cn.trim() === (editingProduct.customs_name_cn ?? "") &&
      form.customs_name_en.trim() === (editingProduct.customs_name_en ?? "") &&
      form.default_supplier_id.trim() === (editingProduct.default_supplier_id ?? "") &&
      JSON.stringify(suppliersList) === JSON.stringify(editingProduct.suppliers ?? [])
    );
    if (editingProduct && onlyVariantChanged) {
      const patchPayload: Record<string, unknown> = {};
      if (Number(costPrice) !== Number(editingProduct.cost_price ?? 0)) patchPayload.cost_price = costPrice;
      if ((form.color.trim() || "") !== ((editingProduct as any).color ?? "")) patchPayload.color = form.color.trim() || undefined;
      if ((form.size.trim() || "") !== ((editingProduct as any).size ?? "")) patchPayload.size = form.size.trim() || undefined;
      if ((form.barcode.trim() || "") !== ((editingProduct as any).barcode ?? "")) patchPayload.barcode = form.barcode.trim() || undefined;
      if ((form.target_roi ? Number(form.target_roi) : undefined) !== (editingProduct.target_roi ?? undefined)) patchPayload.target_roi = form.target_roi ? Number(form.target_roi) : undefined;
      if (form.currency !== (editingProduct.currency ?? "CNY")) patchPayload.currency = form.currency;
      if ((form.weight_kg ? Number(form.weight_kg) : undefined) !== ((editingProduct as any).weight_kg ?? undefined)) patchPayload.weight_kg = form.weight_kg ? Number(form.weight_kg) : undefined;
      if ((form.length ? Number(form.length) : undefined) !== ((editingProduct as any).length ?? undefined)) patchPayload.length = form.length ? Number(form.length) : undefined;
      if ((form.width ? Number(form.width) : undefined) !== ((editingProduct as any).width ?? undefined)) patchPayload.width = form.width ? Number(form.width) : undefined;
      if ((form.height ? Number(form.height) : undefined) !== ((editingProduct as any).height ?? undefined)) patchPayload.height = form.height ? Number(form.height) : undefined;
      if ((form.volumetric_divisor ? Number(form.volumetric_divisor) : undefined) !== ((editingProduct as any).volumetric_divisor ?? undefined)) patchPayload.volumetric_divisor = form.volumetric_divisor ? Number(form.volumetric_divisor) : undefined;
      if (Object.keys(patchPayload).length > 0) {
        setIsSubmitting(true);
        try {
          const response = await fetch("/api/products/" + encodeURIComponent(editingProduct.sku_id), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchPayload),
          });
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err?.error || "更新失败");
          }
          await refreshWorkspace(editingProduct.product_id);
          toast.success("产品已更新");
          resetForm();
          setIsModalOpen(false);
        } catch (error: any) {
          toast.error(error?.message || "保存产品失败");
        } finally {
          setIsSubmitting(false);
        }
        return;
      }
    }

    // 鏂板缓锛氬叏閲忔彁浜わ紱缂栬緫锛氬彧鍥炰紶鏈夊彉鏇寸殑瀛楁锛屽浘鐗囨湭鏀瑰姩鍒欎笉鍥炰紶锛岄伩鍏嶉噸澶嶄笂浼犲ぇ�?
    const orig = editingProduct as any;
    const productData: any = editingProduct ? {} : {
      sku_id: form.sku_id.trim(),
      spu_code: form.spu_code.trim() || undefined,
      name: form.name.trim(),
      main_image: form.main_image,
      gallery_images: galleryList.slice(0, 5),
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
      suppliers: suppliersList.length > 0 ? suppliersList : undefined,
    };
    if (editingProduct) {
      if (form.sku_id.trim() !== (orig.sku_id ?? "")) productData.sku_id = form.sku_id.trim();
      if ((form.spu_code.trim() || "") !== (orig.spu_code ?? "")) productData.spu_code = form.spu_code.trim() || undefined;
      if (form.name.trim() !== (orig.name ?? "")) productData.name = form.name.trim();
      if (form.main_image !== (orig.main_image ?? "")) productData.main_image = form.main_image;
      if (!galleryUnchanged) productData.gallery_images = galleryList.slice(0, 5);
      if ((form.category.trim() || "") !== (orig.category ?? "")) productData.category = form.category.trim() || undefined;
      if ((form.brand.trim() || "") !== (orig.brand ?? "")) productData.brand = form.brand.trim() || undefined;
      if ((form.description.trim() || "") !== (orig.description ?? "")) productData.description = form.description.trim() || undefined;
      if ((form.material.trim() || "") !== (orig.material ?? "")) productData.material = form.material.trim() || undefined;
      if ((form.customs_name_cn.trim() || "") !== (orig.customs_name_cn ?? "")) productData.customs_name_cn = form.customs_name_cn.trim() || undefined;
      if ((form.customs_name_en.trim() || "") !== (orig.customs_name_en ?? "")) productData.customs_name_en = form.customs_name_en.trim() || undefined;
      if ((form.default_supplier_id.trim() || "") !== (orig.default_supplier_id ?? "")) productData.default_supplier_id = form.default_supplier_id.trim() || undefined;
      if (form.status !== (orig.status ?? "ACTIVE")) productData.status = form.status;
      if (Number(costPrice) !== Number(orig.cost_price ?? 0)) productData.cost_price = costPrice;
      if ((form.target_roi ? Number(form.target_roi) : undefined) !== (orig.target_roi ?? undefined)) productData.target_roi = form.target_roi ? Number(form.target_roi) : undefined;
      if (form.currency !== (orig.currency ?? "CNY")) productData.currency = form.currency;
      if ((form.weight_kg ? Number(form.weight_kg) : undefined) !== (orig.weight_kg ?? undefined)) productData.weight_kg = form.weight_kg ? Number(form.weight_kg) : undefined;
      if ((form.length ? Number(form.length) : undefined) !== (orig.length ?? undefined)) productData.length = form.length ? Number(form.length) : undefined;
      if ((form.width ? Number(form.width) : undefined) !== (orig.width ?? undefined)) productData.width = form.width ? Number(form.width) : undefined;
      if ((form.height ? Number(form.height) : undefined) !== (orig.height ?? undefined)) productData.height = form.height ? Number(form.height) : undefined;
      if ((form.volumetric_divisor ? Number(form.volumetric_divisor) : undefined) !== (orig.volumetric_divisor ?? undefined)) productData.volumetric_divisor = form.volumetric_divisor ? Number(form.volumetric_divisor) : undefined;
      if ((form.color.trim() || "") !== (orig.color ?? "")) productData.color = form.color.trim() || undefined;
      if ((form.size.trim() || "") !== (orig.size ?? "")) productData.size = form.size.trim() || undefined;
      if ((form.barcode.trim() || "") !== (orig.barcode ?? "")) productData.barcode = form.barcode.trim() || undefined;
      const existingIds = (orig.suppliers ?? []).map((s: any) => s.id).sort().join(",");
      const newIds = suppliersList.map((s) => s.id).sort().join(",");
      if (existingIds !== newIds || JSON.stringify(suppliersList) !== JSON.stringify(orig.suppliers ?? [])) {
        productData.suppliers = suppliersList.length > 0 ? suppliersList : undefined;
      }
      if (Object.keys(productData).length === 0) {
        toast.info("无变更，未提交");
        return;
      }
    }

    const url = editingProduct
      ? "/api/products/" + encodeURIComponent(editingProduct.sku_id)
      : '/api/products';
    const method = editingProduct ? 'PUT' : 'POST';

    const PAYLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
    const bodyStr = JSON.stringify(productData);
    if (bodyStr.length > PAYLOAD_LIMIT_BYTES) {
      const mb = (bodyStr.length / 1024 / 1024).toFixed(2);
      toast.error("请求体约 " + mb + "MB，超过线上限制（约 4.5MB）。请减少产品多图数量或使用更小图片后重试。");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const message =
          response.status === 413
            ? '璇锋眰浣撹繃澶э紙鍥剧墖杩囧鎴栬繃澶э級锛岃鍑忓皯澶氬浘鏁伴噺鎴栦娇鐢ㄦ洿灏忓浘鐗囧悗閲嶈瘯'
            : (error?.error || '操作失败');
        throw new Error(message);
      }
      await refreshWorkspace(editingProduct?.product_id);
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
    if (!addVariantProduct || isSubmitting) return;
    const spuId = addVariantProduct.productId;
    if (!spuId) {
      toast.error("无法识别所属产品，请刷新页面后重试");
      return;
    }
    const valid = addVariantFormVariants;
    if (!validateVariantRows(valid, existingSkuIds).valid) {
      toast.error("请修正 SKU 表格中的错误后再保存");
      return;
    }

    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: addVariantProduct.name,
        product_id: spuId,
        variants: serializeVariantRows(valid),
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
      await refreshWorkspace(spuId);
      setExpandedSpuId(spuId);
      toast.success("已为「" + addVariantProduct.name + "」添加 " + valid.length + " 个变体");
      setAddVariantProduct(null);
      setAddVariantFormVariants([newVariantRow()]);
    } catch (err: any) {
      toast.error(err?.message || "添加变体失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (skuId: string) => {
    if (!(await confirm({ title: "删除确认", message: "确定要删除这个 SKU 吗？\n此操作不可恢复。", type: "danger" }))) return;

    try {
      const response = await fetch("/api/products/" + encodeURIComponent(skuId), {
        method: 'DELETE'
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || '删除失败');
      }
      const productId = Object.keys(variantCache).find((pid) =>
        variantCache[pid].some((p) => p.sku_id === skuId)
      );
      await refreshWorkspace(productId);
      toast.success("SKU 已删除");
    } catch (error: any) {
      console.error('Failed to delete product:', error);
      toast.error(error.message || '删除失败');
    }
  };

  /** 鍒犻櫎鏁翠釜浜у搧锛圫PU锛夊強鍏跺叏閮ㄥ彉浣?*/
  const handleDeleteSpu = async (productId: string) => {
    if (
      !(await confirm({
        title: "删除确认",
        message: "确定要删除该产品及其全部变体吗？\n此操作不可恢复。",
        type: "danger",
      }))
    )
      return;
    try {
      const res = await fetch("/api/products/spu/" + encodeURIComponent(productId), { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "删除失败");
      }
      setVariantCache((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      setExpandedSpuId((id) => (id === productId ? null : id));
      await mutateProducts?.();
      toast.success("产品及全部变体已删除");
    } catch (e: any) {
      toast.error(e?.message || "删除产品失败");
    }
  };


  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">产品档案</h1>
          <p className="mt-1 text-sm text-slate-400">产品资料统一维护，SKU 规格、成本与物流参数逐行管理。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isValidating} onClick={() => void refreshWorkspace(expandedSpuId ?? undefined)} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 disabled:opacity-50"><RefreshCw className={"h-4 w-4 " + (isValidating ? "animate-spin" : "")} />刷新资料</button>
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
            <Plus className="mr-1 inline h-4 w-4" />新建产品
          </button>
        </div>
      </header>

      <ProductsStats summary={productSummary} />
      <p className="text-xs text-slate-500">新建产品用于新增一个产品系列；同一产品增加规格，请使用“新增 SKU”或“复制 SKU”。库存由业务单据计算，不在这里修改。</p>
      {productsError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">产品列表加载失败。请点击“刷新资料”重试；现有数据显示不代表最新结果。</div>}
      {!productsReady && !productsError && <p role="status" className="p-6 text-slate-400">正在加载产品档案…</p>}

      <ProductsFilters
        searchKeyword={searchKeyword}
        onSearchKeywordChange={setSearchKeyword}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        filterCategory={filterCategory}
        onFilterCategoryChange={setFilterCategory}
        filterFactory={filterFactory}
        onFilterFactoryChange={setFilterFactory}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(by, order) => {
          setSortBy(by);
          setSortOrder(order);
        }}
        categories={categories}
        suppliers={Array.from(new Map([...suppliers, ...spuList.flatMap(item => item.suppliers ?? [])].map(item => [item.id, item])).values())}
      />

      {productsReady && !(!spuList.length && productsError) && <ProductsTable
        searchKeyword={searchKeyword}
        variantErrors={variantErrors}
        onCopySku={(spu, product) => {
          const row = variantRowFromProduct(product);
          if (spu.skuIndex?.find(item => item.sku_id === product.sku_id)?.cost_price === null) row.cost_price = "";
          setAddVariantProduct(spu);
          setAddVariantFormVariants([row]);
        }}
        filteredSpuList={filteredSpuList}
        variantCache={variantCache}
        expandedSpuId={expandedSpuId}
        setExpandedSpuId={setExpandedSpuId}
        loadingSpuId={loadingSpuId}
        loadVariantsForSpu={loadVariantsForSpu}
        onEditProduct={handleOpenModal}
        onDeleteSku={handleDelete}
        onDeleteSpu={handleDeleteSpu}
        onOpenAddVariant={(spu) => {
          setAddVariantProduct(spu);
          setAddVariantFormVariants([newVariantRow()]);
        }}
        onPreviewImages={(images, index) => {
          setPreviewImages(images);
          setPreviewIndex(index);
        }}
      />}

      {previewImages.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewImages([])}
          role="dialog"
          aria-modal="true"
          aria-label="查看大图"
        >
          <button
            type="button"
            onClick={() => setPreviewImages([])}
            className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="关闭"
          >
            <X className="h-6 w-6" />
          </button>
          {previewImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPreviewIndex((i) => (i <= 0 ? previewImages.length - 1 : i - 1)); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="上一张"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPreviewIndex((i) => (i >= previewImages.length - 1 ? 0 : i + 1)); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="下一张"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}
          <img
            src={previewImages[previewIndex]}
            alt={"产品大图 " + (previewIndex + 1) + "/" + previewImages.length}
            className="max-w-[90vw] max-h-[90vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {previewImages.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-white/80 text-sm">
              {previewIndex + 1} / {previewImages.length}
            </div>
          )}
        </div>
      )}

      <ProductFormDialog
        open={isModalOpen}
        onClose={() => {
          if (isSubmitting) return;
          void confirm({ title: "关闭编辑", message: "关闭后未保存的修改将丢失，是否继续？", confirmText: "放弃修改", cancelText: "继续编辑" }).then(ok => {
            if (ok) { resetForm(); setIsModalOpen(false); }
          });
        }}
        existingSkuIds={editingProduct ? existingSkuIds.filter(id => id !== editingProduct.sku_id) : existingSkuIds}
        editingProduct={editingProduct}
        variantId={editingProduct?.variant_id ?? null}
        form={form}
        setForm={setForm}
        formVariants={formVariants}
        setFormVariants={setFormVariants}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        suppliers={suppliers}
      />

      <AddVariantDialog
        spu={addVariantProduct}
        variants={addVariantFormVariants}
        onVariantsChange={setAddVariantFormVariants}
        existingSkuIds={existingSkuIds}
        onClose={() => {
          if (isSubmitting) return;
          const close = () => { setAddVariantProduct(null); setAddVariantFormVariants([newVariantRow()]); };
          const hasInput = addVariantFormVariants.some(row => [row.sku_id, row.cost_price, row.size, row.color, row.barcode, row.weight_kg, row.length, row.width, row.height].some(value => Boolean(value?.trim())));
          if (!hasInput) close();
          else void confirm({ title: "关闭新增 SKU", message: "已填写的 SKU 尚未保存，关闭后将丢失。", confirmText: "放弃填写", cancelText: "继续填写" }).then(ok => { if (ok) close(); });
        }}
        onSubmit={handleAddVariants}
        isSubmitting={isSubmitting}
      />

      <ProductDetailDialog product={detailProduct} onClose={() => setDetailProduct(null)} />
      {confirmDialog}
    </div>
  );
}
