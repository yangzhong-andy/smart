"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import Link from "next/link";
import { upsertPurchaseContract, type PurchaseContract } from "@/lib/purchase-contracts-store";
import {
  getPurchaseOrderById,
  linkPurchaseContract,
  type PurchaseOrder
} from "@/lib/purchase-orders-store";
import { createDeliveryOrder, type DeliveryOrder } from "@/lib/delivery-orders-store";
import { createPendingInboundFromDeliveryOrder } from "@/lib/pending-inbound-store";
import { getExpenseRequests, createExpenseRequest, type ExpenseRequest } from "@/lib/expense-income-request-store";
import { Package, Plus, Download, Wallet, ChevronRight, CheckCircle2, ArrowRight, XCircle, FileImage, Factory, FileText } from "lucide-react";
import { PurchaseOrderStats } from "./components/PurchaseOrderStats";
import { PurchaseOrderFilters } from "./components/PurchaseOrderFilters";
import { PurchaseOrdersTable } from "./components/PurchaseOrdersTable";
import { PurchaseOrderDetailDialog } from "./components/PurchaseOrderDetailDialog";
import { PurchaseOrderCreateDialog } from "./components/PurchaseOrderCreateDialog";
import { currency, formatDate } from "./components/types";
import type { Supplier as SupplierType } from "./components/types";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ImageUploader from "@/components/ImageUploader";
import DateInput from "@/components/DateInput";
import InventoryDistribution from "@/components/InventoryDistribution";
import { getSpuListFromAPI, getVariantsBySpuIdFromAPI, getProductsFromAPI, upsertProduct, type Product as ProductType, type SpuListItem } from "@/lib/products-store";
import { addInventoryMovement } from "@/lib/inventory-movements-store";
import { getAccountsFromAPI, saveAccounts, type BankAccount } from "@/lib/finance-store";
import { getCashFlowFromAPI, createCashFlow } from "@/lib/cash-flow-store";

type Supplier = SupplierType;

// 兼容新旧产品数据结构（API 返回的每条为 SKU 变体，含 product_id 用于按原型分组）
type Product = {
  id?: string;
  sku?: string;
  name?: string;
  imageUrl?: string;
  cost?: number;
  primarySupplierId?: string;
  sku_id?: string;
  main_image?: string;
  cost_price?: number;
  factory_id?: string;
  factory_name?: string;
  currency?: string;
  product_id?: string;
  color?: string;
};

type SpuOption = { productId: string; name: string; variants: Product[] };

const PRODUCTS_KEY = "products";

// 新建合同时的物料行（与 components/types 的 FormItemRow 一致）
type FormItemRow = {
  tempId: string;
  productId: string;
  sku: string;
  skuName: string;
  spec: string;
  quantity: string;
  unitPrice: string;
};

const newFormItemRow = (): FormItemRow => ({
  tempId: crypto.randomUUID(),
  productId: "",
  sku: "",
  skuName: "",
  spec: "",
  quantity: "",
  unitPrice: "",
});

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { data: session } = useSession();
  // 仅最高管理员 SUPER_ADMIN 可见删除按钮、可删采购合同
  const isSuperAdmin = Boolean(session?.user && (session.user as { role?: string }).role === "SUPER_ADMIN");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [spuList, setSpuList] = useState<SpuListItem[]>([]);
  const [supplierLinkedProductIds, setSupplierLinkedProductIds] = useState<string[] | null>(null); // 当前选中供应商关联的 productId 列表，null 表示未筛选
  const [variantCache, setVariantCache] = useState<Record<string, Product[]>>({}); // productId -> 该 SPU 下全部 SKU（一次性 include 拉取后缓存）
  const [loadingSpuId, setLoadingSpuId] = useState<string | null>(null);
  const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));
  const { data: contractsData, mutate: mutateContracts } = useSWR<PurchaseContract[] | { data: PurchaseContract[]; pagination: unknown }>(
    "/api/purchase-contracts?page=1&pageSize=500",
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 10000 }
  );
  const contracts = Array.isArray(contractsData) ? contractsData : (contractsData?.data ?? []);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; originalBalance: number; balance?: number; currency: string }>>([]);
  const { data: deliveryOrdersData, mutate: mutateDeliveryOrders } = useSWR<DeliveryOrder[] | { data: DeliveryOrder[]; pagination: unknown }>(
    "/api/delivery-orders?page=1&pageSize=500",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const deliveryOrders = Array.isArray(deliveryOrdersData) ? deliveryOrdersData : (deliveryOrdersData?.data ?? []);
  const [suppliersReady, setSuppliersReady] = useState(false);
  const [expenseRequests, setExpenseRequests] = useState<ExpenseRequest[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [sourceOrder, setSourceOrder] = useState<PurchaseOrder | null>(null);
  const [detailModal, setDetailModal] = useState<{ contractId: string | null }>({ contractId: null });
  const [deliveryModal, setDeliveryModal] = useState<{
    contractId: string | null;
    qty: string;
    trackingNumber: string;
    itemQtys: Record<string, string>;
  }>({
    contractId: null,
    qty: "",
    trackingNumber: "",
    itemQtys: {}
  });
  const [paymentModal, setPaymentModal] = useState<{ contractId: string | null; type: "deposit" | "tail" | null; deliveryOrderId?: string; accountId: string }>({
    contractId: null,
    type: null,
    accountId: ""
  });
  const [successModal, setSuccessModal] = useState<{ open: boolean; type: "deposit" | "delivery" | null; data?: any }>({
    open: false,
    type: null
  });
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [form, setForm] = useState({
    supplierId: "",
    deliveryDate: "",
    contractVoucher: "" as string | string[],
    contractNumber: "" // 留空则保存时自动生成
  });
  // 合同编号格式（如 SDFY-2026-），自动生成时用「格式+时间戳」；存 localStorage 记住
  const [contractNumberFormat, setContractNumberFormat] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("tk_erp_contract_number_format");
    if (saved != null) setContractNumberFormat(saved);
  }, []);
  const setContractNumberFormatAndSave = (value: string) => {
    setContractNumberFormat(value);
    if (typeof window !== "undefined") localStorage.setItem("tk_erp_contract_number_format", value);
  };
  const generateContractNumber = () =>
    (contractNumberFormat.trim() || "PC-") + Date.now();
  const [formItems, setFormItems] = useState<FormItemRow[]>([]);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [variantModalSupplierId, setVariantModalSupplierId] = useState<string | null>(null); // 弹窗打开时锁定的供应商 ID，避免中途被清空又显示全部
  const [variantModalProductIds, setVariantModalProductIds] = useState<string[] | null>(null); // 该供应商关联的 productId 列表，null 表示加载中
  const [variantQuantities, setVariantQuantities] = useState<Record<string, string>>({});
  const [selectedSpuContract, setSelectedSpuContract] = useState<SpuOption | null>(null);
  const [variantSearchContract, setVariantSearchContract] = useState(""); // 变体选择器内按颜色/SKU 搜索
  const [isCreateSaving, setIsCreateSaving] = useState(false); // 新建合同保存中，避免重复提交且给用户反馈

  // 搜索和筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  // 生产进度需用用户本地时间计算，避免线上 SSR 用服务器 UTC 导致进度不动
  const [clientNow, setClientNow] = useState<Date | null>(null);

  // 加载支出申请数据（接口可能返回 { data, pagination }，getExpenseRequests 已统一返回数组）
  useEffect(() => {
    if (typeof window === "undefined") return;
    getExpenseRequests().then((data: ExpenseRequest[] | { data?: ExpenseRequest[] }) =>
      setExpenseRequests(Array.isArray(data) ? data : (data?.data ?? []))
    );
  }, []);

  const expenseRequestsList = Array.isArray(expenseRequests) ? expenseRequests : [];

  // 生产进度使用用户本地时间，useLayoutEffect 在首屏绘制前设置，避免线上缓存/SSR 导致进度不准
  useLayoutEffect(() => {
    setClientNow(new Date());
  }, []);

  // 检查是否有来自采购订单的参数
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // 检查URL参数
    const urlParams = new URLSearchParams(window.location.search);
    const fromOrderId = urlParams.get("fromOrder");
    if (fromOrderId) {
      const order = getPurchaseOrderById(fromOrderId);
      if (order) {
        setSourceOrder(order);
        // 自动打开创建合同模态框
        setIsCreateOpen(true);
        // 清除URL参数（可选）
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    
    // 检查sessionStorage（兼容旧方式）
    const pendingOrderStr = sessionStorage.getItem("pendingPurchaseOrder");
    if (pendingOrderStr && !fromOrderId) {
      try {
        const order = JSON.parse(pendingOrderStr);
        setSourceOrder(order);
        setIsCreateOpen(true);
        sessionStorage.removeItem("pendingPurchaseOrder");
      } catch (e) {
        console.error("Failed to parse pending order", e);
      }
    }
  }, []);

  // 已加载的变体扁平列表（用于 formItems 解析、合同创建时 sku 等），仅来自缓存，零额外请求
  const productsForResolve = useMemo(() => {
    const list = Object.values(variantCache).flat();
    return list.map((p: any) => ({
      ...p,
      id: p.sku_id,
      sku: p.sku_id,
      name: p.name,
      cost: p.cost_price,
      primarySupplierId: p.factory_id,
      imageUrl: p.main_image
    }));
  }, [variantCache]);

  // 根据订单信息自动填充表单（供应商 + 物料行）；若缓存无该 SKU 则拉一次全量并写入缓存
  useEffect(() => {
    if (!sourceOrder || !suppliers.length) return;
    const product = productsForResolve.find((p) => p.sku_id === sourceOrder.skuId);
    if (product) {
      const productId = product.sku_id || "";
      const productSku = product.sku_id || sourceOrder.sku || "";
      const productName = product.name || sourceOrder.productName || "";
      const productCost = product.cost_price || 0;
      let supplierId = "";
      if (product.factory_id) {
        const supplier = suppliers.find((s) => s.id === product.factory_id);
        if (supplier) supplierId = supplier.id;
      }
      if (!supplierId && suppliers.length > 0) supplierId = suppliers[0].id;
      setForm((f) => ({ ...f, supplierId }));
      setFormItems([
        {
          tempId: crypto.randomUUID(),
          productId,
          sku: productSku || sourceOrder.sku || "",
          skuName: productName || sourceOrder.productName || "",
          spec: "",
          quantity: String(sourceOrder.quantity),
          unitPrice: productCost > 0 ? String(productCost) : "",
        },
      ]);
      return;
    }
    getProductsFromAPI().then((parsed) => {
      const bySpu = new Map<string, Product[]>();
      for (const p of parsed as Product[]) {
        const id = (p as any).product_id || p.sku_id || p.name || "";
        if (!id) continue;
        if (!bySpu.has(id)) bySpu.set(id, []);
        bySpu.get(id)!.push(p);
      }
      setVariantCache((prev) => ({ ...prev, ...Object.fromEntries(bySpu) }));
    });
  }, [sourceOrder, productsForResolve, suppliers]);

  // Load suppliers from API
  useEffect(() => {
    if (typeof window === "undefined") return;
    fetch("/api/suppliers?page=1&pageSize=500")
      .then((res) => (res.ok ? res.json() : {}))
      .then((parsed: any) => {
        const list = Array.isArray(parsed) ? parsed : (parsed?.data ?? []);
        setSuppliers(list);
        if (list.length && !form.supplierId) {
          setForm((f) => ({ ...f, supplierId: list[0].id }));
        }
        setSuppliersReady(true);
      })
      .catch((e) => {
        console.error("Failed to load suppliers", e);
        setSuppliersReady(true);
      });
  }, []);

  // 一次性只拉 SPU 列表（节省数据库访问）；变体在用户选中该 SPU 时再按需拉取并缓存
  useEffect(() => {
    if (typeof window === "undefined") return;
    getSpuListFromAPI().then(setSpuList).catch((e) => console.error("Failed to load SPU list", e));
  }, []);

  const products = productsForResolve;

  // Load accounts
  useEffect(() => {
    if (typeof window === "undefined") return;
    getAccountsFromAPI()
      .then((parsed) => {
        setAccounts(
          parsed.map((a: any) => ({
            ...a,
            originalBalance: a.originalBalance !== undefined ? a.originalBalance : a.balance || 0
          }))
        );
        if (parsed.length && !paymentModal.accountId) {
          setPaymentModal((m) => ({ ...m, accountId: parsed[0].id }));
        }
      })
      .catch((e) => console.error("Failed to load accounts", e));
  }, []);

  const selectedSupplier = useMemo(() => {
    const supplierId = form.supplierId || suppliers[0]?.id;
    return suppliers.find((s) => s.id === supplierId) || suppliers[0];
  }, [form.supplierId, suppliers]);

  // 按当前选中的供应商（含下拉默认显示的那一个）拉取关联产品 ID，只显示该供应商关联商品；无供应商时显示全部
  useEffect(() => {
    const sid = selectedSupplier?.id ?? null;
    if (!sid) {
      setSupplierLinkedProductIds(null);
      return;
    }
    fetch(`/api/product-suppliers?supplierId=${encodeURIComponent(sid)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { productId: string }[]) => {
        setSupplierLinkedProductIds(list.map((x) => x.productId));
      })
      .catch(() => setSupplierLinkedProductIds([]));
  }, [selectedSupplier?.id]);

  const spuOptions = useMemo((): SpuOption[] => {
    const list = supplierLinkedProductIds === null
      ? spuList
      : spuList.filter((s) => supplierLinkedProductIds.includes(s.productId));
    return list.map((s) => ({
      productId: s.productId,
      name: s.name,
      variants: variantCache[s.productId] ?? [],
    }));
  }, [spuList, variantCache, supplierLinkedProductIds]);

  // 弹窗内使用的规格列表：打开时按当前供应商拉取并锁定，避免「先对后错」的闪动
  const variantModalSpuOptions = useMemo((): SpuOption[] => {
    if (!variantModalOpen) return [];
    if (variantModalSupplierId == null) {
      return spuList.map((s) => ({ productId: s.productId, name: s.name, variants: variantCache[s.productId] ?? [] }));
    }
    if (variantModalProductIds === null) return []; // 加载中，先不展示任何项
    const list = spuList.filter((s) => variantModalProductIds.includes(s.productId));
    return list.map((s) => ({
      productId: s.productId,
      name: s.name,
      variants: variantCache[s.productId] ?? [],
    }));
  }, [variantModalOpen, variantModalSupplierId, variantModalProductIds, spuList, variantCache]);

  const totalAmount = useMemo(() => {
    return formItems.reduce((sum, row) => {
      const qty = Number(row.quantity) || 0;
      const price = Number(row.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
  }, [formItems]);

  const depositPreview = useMemo(() => {
    if (!selectedSupplier) return 0;
    return (totalAmount * selectedSupplier.depositRate) / 100;
  }, [selectedSupplier, totalAmount]);

  const openVariantModalContract = () => {
    const sid = selectedSupplier?.id ?? null;
    setVariantModalSupplierId(sid);
    setVariantModalProductIds(null); // 加载中
    setSelectedSpuContract(null);
    setVariantQuantities({});
    setVariantSearchContract("");
    setVariantModalOpen(true);
    if (sid) {
      fetch(`/api/product-suppliers?supplierId=${encodeURIComponent(sid)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((list: { productId: string }[]) => {
          setVariantModalProductIds(list.map((x) => x.productId));
        })
        .catch(() => setVariantModalProductIds([]));
    } else {
      setVariantModalProductIds([]);
    }
  };

  const onSelectSpuInModal = async (spu: SpuOption) => {
    const cached = variantCache[spu.productId];
    if (cached?.length) {
      setSelectedSpuContract({ productId: spu.productId, name: spu.name, variants: cached });
      const next: Record<string, string> = {};
      cached.forEach((v) => {
        next[v.sku_id!] = variantQuantities[v.sku_id!] ?? "";
      });
      setVariantQuantities(next);
      return;
    }
    setLoadingSpuId(spu.productId);
    try {
      const variants = await getVariantsBySpuIdFromAPI(spu.productId);
      setVariantCache((prev) => ({ ...prev, [spu.productId]: variants }));
      setSelectedSpuContract({ productId: spu.productId, name: spu.name, variants });
      const next: Record<string, string> = {};
      variants.forEach((v) => {
        next[v.sku_id!] = variantQuantities[v.sku_id!] ?? "";
      });
      setVariantQuantities(next);
    } catch (e) {
      toast.error("加载该规格变体失败");
    } finally {
      setLoadingSpuId(null);
    }
  };

  const confirmVariantSelectionContract = () => {
    if (!selectedSpuContract) {
      toast.error("请先选择产品原型");
      return;
    }
    const rows: FormItemRow[] = [];
    selectedSpuContract.variants.forEach((v) => {
      const q = Number(variantQuantities[v.sku_id!]);
      if (Number.isNaN(q) || q <= 0) return;
      const skuName = selectedSpuContract.name;
      const spec = v.color || v.sku_id || "";
      rows.push({
        tempId: crypto.randomUUID(),
        productId: v.sku_id || "",
        sku: v.sku_id || "",
        skuName,
        spec,
        quantity: String(q),
        unitPrice: String((v as Product).cost_price ?? 0),
      });
    });
    if (rows.length === 0) {
      toast.error("请至少为一个颜色填写数量");
      return;
    }
    setFormItems((prev) => (prev.length === 0 ? rows : [...prev, ...rows]));
    setVariantModalOpen(false);
    setVariantModalSupplierId(null);
    setVariantModalProductIds(null);
    setSelectedSpuContract(null);
    setVariantQuantities({});
    toast.success(`已添加 ${rows.length} 个变体，共 ${rows.reduce((s, r) => s + Number(r.quantity), 0)} 件`);
  };

  // 创建新合同（母单）- 支持多行物料
  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedSupplier) {
      toast.error("请先在供应商库新增供应商后再创建采购合同", { icon: "⚠️" });
      return;
    }
    const validRows = formItems.filter(
      (row) =>
        (row.sku?.trim() || row.skuName?.trim() || products.find((p) => (p.id || p.sku_id) === row.productId)) &&
        Number(row.quantity) > 0 &&
        Number(row.unitPrice) >= 0
    );
    if (validRows.length === 0) {
      toast.error("请至少添加一条有效物料（SKU/品名、数量、单价）", { icon: "⚠️" });
      return;
    }
    if (!form.contractVoucher || (Array.isArray(form.contractVoucher) && form.contractVoucher.length === 0) || (typeof form.contractVoucher === "string" && form.contractVoucher.trim() === "")) {
      toast.error("请上传合同凭证", { icon: "⚠️" });
      return;
    }
    const items = validRows.map((row) => {
      const product = products.find((p) => (p.id || p.sku_id) === row.productId);
      const sku = row.sku?.trim() || product?.sku || product?.sku_id || "";
      const skuName = row.skuName?.trim() || product?.name || "";
      const qty = Number(row.quantity) || 0;
      const unitPrice = Number(row.unitPrice) ?? (product?.cost_price ?? 0);
      return {
        sku: sku || "未填",
        skuId: product?.sku_id || product?.id || undefined,
        skuName: skuName || undefined,
        spec: row.spec?.trim() || undefined,
        quantity: qty,
        unitPrice,
      };
    });
    const finalContractNumber = (form.contractNumber && String(form.contractNumber).trim())
      ? String(form.contractNumber).trim()
      : generateContractNumber();
    const body = {
      contractNumber: finalContractNumber,
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      depositRate: selectedSupplier.depositRate,
      tailPeriodDays: selectedSupplier.tailPeriodDays,
      deliveryDate: form.deliveryDate || undefined,
      status: "待审批",
      contractVoucher: form.contractVoucher,
      relatedOrderIds: sourceOrder ? [sourceOrder.id] : [],
      relatedOrderNumbers: sourceOrder ? [sourceOrder.orderNumber ?? ""] : [],
      items,
    };
    setIsCreateSaving(true);
    try {
      const res = await fetch("/api/purchase-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.details ? `${err.error || "创建失败"}: ${err.details}` : (err?.error || "创建失败");
        throw new Error(msg);
      }
      const newContract = await res.json();
      mutateContracts();
      if (sourceOrder) {
        await linkPurchaseContract(sourceOrder.id, newContract.id, newContract.contractNumber);
        toast.success("采购合同已提交，待主管审批；已自动关联采购订单", { icon: "✅" });
      } else {
        toast.success("采购合同已提交，待主管审批", { icon: "✅" });
      }
      setSourceOrder(null);
      setForm((f) => ({ ...f, deliveryDate: "", contractVoucher: "", contractNumber: "" }));
      setFormItems([]);
      setIsCreateOpen(false);
      try {
        const genRes = await fetch("/api/contracts/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseContractId: newContract.id }),
        });
        if (genRes.ok) {
          const { id } = await genRes.json();
          router.push(`/procurement/contracts/${id}`);
        }
      } catch (_) {}
    } catch (err: any) {
      console.error("创建合同失败", err);
      toast.error(err?.message || "创建失败，请重试");
    } finally {
      setIsCreateSaving(false);
    }
  };

  // 打开详情模态框
  const openDetailModal = (contractId: string) => {
    setDetailModal({ contractId });
  };

  /** 删除采购合同（仅最高管理员可见并可用） */
  const handleDeleteContract = async (contractId: string) => {
    if (!isSuperAdmin) return;
    if (!confirm("确定要删除该采购合同吗？\n删除后关联的拿货单等数据可能受影响，此操作不可恢复。")) return;
    try {
      const res = await fetch(`/api/purchase-contracts/${contractId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "删除失败");
      }
      await mutateContracts();
      toast.success("采购合同已删除");
    } catch (e: any) {
      toast.error(e?.message || "删除采购合同失败");
    }
  };

  // 生成合同文档并跳转预览/下载
  const handleGenerateContract = async (contractId: string) => {
    try {
      const res = await fetch("/api/contracts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseContractId: contractId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "生成失败");
      }
      const { id } = await res.json();
      router.push(`/procurement/contracts/${id}`);
    } catch (e: any) {
      toast.error(e?.message || "生成合同失败");
    }
  };

  // 打开发起拿货模态框（按变体初始化本次数量）
  const openDeliveryModal = (contractId: string) => {
    const contract = contracts.find((c) => c.id === contractId);
    const itemQtys: Record<string, string> = {};
    if (contract?.items?.length) {
      contract.items.forEach((item) => {
        itemQtys[item.id] = "";
      });
    }
    setDeliveryModal({ contractId, qty: "", trackingNumber: "", itemQtys });
  };

  // 处理发起拿货（支持按变体填写数量）
  const handleDelivery = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!deliveryModal.contractId) return;

    const contract = contracts.find((c) => c.id === deliveryModal.contractId);
    if (!contract) {
      toast.error("合同不存在", { icon: "❌" });
      return;
    }

    let totalQty = 0;
    let payload: number | { itemId: string; qty: number }[];

    if (contract.items && contract.items.length > 0) {
      const items: { itemId: string; qty: number }[] = [];
      for (const item of contract.items) {
        const v = Number(deliveryModal.itemQtys[item.id]);
        if (Number.isNaN(v) || v <= 0) continue;
        const remain = item.qty - item.pickedQty;
        if (v > remain) {
          toast.error(`变体 ${item.sku} 本次数量 ${v} 超过剩余 ${remain}`);
          return;
        }
        items.push({ itemId: item.id, qty: v });
        totalQty += v;
      }
      if (items.length === 0 || totalQty <= 0) {
        toast.error("请至少填写一条变体的本次拿货数量且大于 0", { icon: "⚠️" });
        return;
      }
      payload = items;
    } else {
      const qty = Number(deliveryModal.qty);
      if (Number.isNaN(qty) || qty <= 0) {
        toast.error("本次拿货数量需大于 0", { icon: "⚠️" });
        return;
      }
      const remainingQty = contract.totalQty - contract.pickedQty;
      if (qty > remainingQty) {
        toast.error(`本次拿货数量 ${qty} 超过剩余数量 ${remainingQty}，无法提交！`);
        return;
      }
      totalQty = qty;
      payload = qty;
    }

    setDeliverySubmitting(true);
    try {
      const result = await createDeliveryOrder(
        deliveryModal.contractId,
        payload,
        deliveryModal.trackingNumber || undefined,
        new Date().toISOString().slice(0, 10)
      );

      if (!result.success) {
        toast.error(result.error || "创建拿货单失败", { icon: "❌" });
        return;
      }

      const deliveryContractId = deliveryModal.contractId;
      const orderNumber = result.order?.deliveryNumber ?? "";
      // 拿货单创建成功：立即关闭拿货弹窗并弹出成功提示
      setDeliveryModal({ contractId: null, qty: "", trackingNumber: "", itemQtys: {} });
      setSuccessModal({
        open: true,
        type: "delivery",
        data: { contractNumber: contract.contractNumber, qty: totalQty, orderNumber }
      });
      toast.success("拿货单创建成功，已推送到待入库", { icon: "✅", duration: 4000 });

      if (result.order) {
        try {
          const inboundResult = await createPendingInboundFromDeliveryOrder(result.order.id);
          if (!inboundResult.success) {
            console.warn("创建待入库单失败:", inboundResult.error);
          }
        } catch (e) {
          console.warn("创建待入库单异常:", e);
        }
        try {
          const billRes = await fetch("/api/monthly-bills/ensure-from-delivery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deliveryOrderId: result.order.id }),
          });
          if (billRes.ok) {
            const data = await billRes.json();
            if (data.created || data.updated) {
              toast.success(
                data.created
                  ? `已根据账期生成 ${data.supplierName} ${data.month} 月账单`
                  : `已更新 ${data.supplierName} ${data.month} 月账单`,
                { icon: "📋" }
              );
            }
          }
        } catch (e) {
          console.warn("自动生成月账单失败:", e);
        }
      }

      mutateContracts();
      mutateDeliveryOrders();
      if (detailModal.contractId === deliveryContractId) {
        setDetailRefreshKey((prev) => prev + 1);
      }
    } catch (err) {
      console.error("创建拿货单异常:", err);
      toast.error(err instanceof Error ? err.message : "创建拿货单失败，请重试", { icon: "❌", duration: 5000 });
    } finally {
      setDeliverySubmitting(false);
    }
  };

  // 处理支付
  const handlePayment = async (contractId: string, type: "deposit" | "tail", deliveryOrderId?: string) => {
    const contract = contracts.find((c) => c.id === contractId);
    if (!contract) return;

    if (type === "deposit") {
      // 定金支付：创建付款申请并推送到审批中心
      if (contract.depositPaid >= contract.depositAmount) {
        toast.error("定金已全部支付", { icon: "⚠️" });
        return;
      }

      // 检查是否已经存在该合同的付款申请（待审批或已审批状态）
      const existingRequest = expenseRequestsList.find((r) => {
        // 通过 summary 匹配合同编号
        const isContractDeposit = r.summary.includes(`采购合同定金 - ${contract.contractNumber}`);
        if (!isContractDeposit) return false;
        
        // 如果状态是待审批或已审批，说明已经推送过
        if (r.status === "Pending_Approval" || r.status === "Approved" || r.status === "Paid") {
          return true;
        }
        
        // 如果被退回（Draft + rejectionReason），允许重新创建
        return false;
      });

      if (existingRequest) {
        const statusText = existingRequest.status === "Pending_Approval" 
          ? "待审批" 
          : existingRequest.status === "Approved"
          ? "已审批"
          : "已支付";
        toast.error(`该合同的定金付款申请已存在，当前状态：${statusText}。请勿重复创建。`, { 
          icon: "⚠️",
          duration: 4000
        });
        return;
      }

      const depositAmount = contract.depositAmount - (contract.depositPaid || 0);
      
      // 创建支出申请（原付款申请）
      const newExpenseRequest: ExpenseRequest = {
        id: `temp_${Date.now()}`, // 临时ID，后端会生成新的
        summary: `采购合同定金 - ${contract.contractNumber}`,
        date: new Date().toISOString().slice(0, 10),
        category: "采购",
        amount: depositAmount,
        currency: "CNY", // 默认CNY，可以根据合同调整
        status: "Pending_Approval", // 待审批状态
        createdBy: "系统", // 实际应该从用户系统获取
        createdAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        remark: `采购合同：${contract.contractNumber}\n供应商：${contract.supplierName}\nSKU：${contract.sku}\n采购数量：${contract.totalQty}\n单价：${currency(contract.unitPrice)}\n合同总额：${currency(contract.totalAmount)}\n已取货数：${contract.pickedQty} / ${contract.totalQty}`,
        departmentId: undefined, // 可以从用户系统获取
        departmentName: "全球供应链部" // 可以从用户系统获取
      };

      // 创建支出申请
      const created = await createExpenseRequest(newExpenseRequest);
      // 刷新支出申请列表
      const updatedRequests = await getExpenseRequests();
      setExpenseRequests(updatedRequests);

      // 更新合同的关联信息（可以存储付款申请ID）
      contract.updatedAt = new Date().toISOString();
      upsertPurchaseContract(contract);
      mutateContracts();

      // 显示成功提示
      setPaymentModal({ contractId: null, type: null, accountId: "" });
      setSuccessModal({ 
        open: true, 
        type: "deposit", 
        data: { 
          contractNumber: contract.contractNumber,
          supplierName: contract.supplierName,
          amount: depositAmount,
          requestId: created.id
        }
      });
      return;
    }

    // 尾款支付：直接支付（不需要审批）
    if (type === "tail" && deliveryOrderId) {
      const contractOrders = deliveryOrders.filter((o) => o.contractId === contractId);
      const order = deliveryOrders.find((o) => o.id === deliveryOrderId);
      if (!order) return;
      // 检查是否已支付
      getCashFlowFromAPI()
        .then((flow) => {
          const isPaid = flow.some(
            (f) => f.relatedId === deliveryOrderId && Math.abs(Math.abs(f.amount) - order.tailAmount) < 0.01
          );
          if (isPaid) {
            toast.error("该笔尾款已支付", { icon: "⚠️" });
            return;
          }
          setPaymentModal({ contractId, type, deliveryOrderId, accountId: accounts[0]?.id || "" });
        })
        .catch((e) => console.error("Failed to check payment", e));
    }
  };

  // 确认支付
  const confirmPayment = async () => {
    if (!paymentModal.contractId || !paymentModal.type || !paymentModal.accountId) return;
    const contract = contracts.find((c) => c.id === paymentModal.contractId);
    const account = accounts.find((a) => a.id === paymentModal.accountId);
    if (!contract || !account) {
      toast.error("数据错误", { icon: "❌" });
      return;
    }

    let amount = 0;
    let relatedId: string | undefined;
    let category = "";

    if (paymentModal.type === "deposit") {
      amount = contract.depositAmount - (contract.depositPaid || 0);
      category = "采购货款";
      relatedId = `${contract.id}-deposit`;
    } else if (paymentModal.type === "tail" && paymentModal.deliveryOrderId) {
      const contractOrders = deliveryOrders.filter((o: DeliveryOrder) => o.contractId === contract.id);
      const order = contractOrders.find((o: DeliveryOrder) => o.id === paymentModal.deliveryOrderId);
      if (!order) {
        toast.error("拿货单不存在", { icon: "❌" });
        return;
      }
      amount = order.tailAmount;
      category = "采购货款";
      relatedId = paymentModal.deliveryOrderId;
    }

    if (amount <= 0) {
      toast.error("支付金额需大于 0", { icon: "⚠️" });
      return;
    }

    const accountBalance = account.originalBalance !== undefined ? account.originalBalance : account.balance || 0;
    if (accountBalance < amount) {
      toast.error("账户余额不足", { icon: "⚠️" });
      return;
    }

    // 更新账户余额
    const updatedAccounts = accounts.map((acc) => {
      if (acc.id === paymentModal.accountId) {
        const currentBalance = acc.originalBalance !== undefined ? acc.originalBalance : acc.balance || 0;
        const newBalance = currentBalance - amount;
        if (acc.originalBalance !== undefined) {
          return { ...acc, originalBalance: Math.max(0, newBalance) };
        } else {
          return { ...acc, balance: Math.max(0, newBalance) };
        }
      }
      return acc;
    });
    setAccounts(updatedAccounts);
    await saveAccounts(updatedAccounts as BankAccount[]);

    // 生成收支明细（API）
    const paymentType = paymentModal.type === "deposit" ? "支付定金" : "支付尾款";
    await createCashFlow({
      date: new Date().toISOString().slice(0, 10),
      summary: `${paymentType} - ${contract.supplierName}`,
      type: "expense",
      category: "采购",
      amount: -amount,
      accountId: paymentModal.accountId,
      accountName: account.name,
      currency: account.currency,
      remark: `${paymentType} - ${contract.contractNumber}`,
      businessNumber: contract.contractNumber,
      relatedId
    });

    // 更新合同财务信息
    if (paymentModal.type === "deposit") {
      contract.depositPaid = (contract.depositPaid || 0) + amount;
    } else if (paymentModal.type === "tail" && paymentModal.deliveryOrderId) {
      const contractOrders = deliveryOrders.filter((o) => o.contractId === contract.id);
      const order = contractOrders.find((o) => o.id === paymentModal.deliveryOrderId);
      if (order) {
        const updatedOrder = { ...order, tailPaid: (order.tailPaid || 0) + amount, updatedAt: new Date().toISOString() };
        const { upsertDeliveryOrder } = await import("@/lib/delivery-orders-store");
        const { updateContractPayment } = await import("@/lib/purchase-contracts-store");
        await upsertDeliveryOrder(updatedOrder);
        await updateContractPayment(contract.id, amount, "tail");
        mutateDeliveryOrders();
      }
    }
    contract.totalPaid = (contract.totalPaid || 0) + amount;
    contract.totalOwed = contract.totalAmount - contract.totalPaid;
    if (contract.totalPaid >= contract.totalAmount) {
      contract.status = "已结清";
    }
    await upsertPurchaseContract(contract);
    mutateContracts();

    setPaymentModal({ contractId: null, type: null, accountId: "" });
    toast.success("支付成功！已自动生成收支明细并更新账户余额。", { 
      icon: "✅", 
      duration: 3000 
    });
  };

  // 获取合同详情（包含子单列表）
  // 使用 state 来触发刷新，确保创建拿货单后详情页能更新
  const contractDetail = useMemo(() => {
    if (!detailModal.contractId) return null;
    // 每次 detailRefreshKey 变化时重新获取数据
    // 始终从 store 中获取最新数据（确保包含合同凭证等所有字段）
    const contract = contracts.find((c) => c.id === detailModal.contractId);
    if (!contract) return null;
    const orders = deliveryOrders.filter((o) => o.contractId === contract.id);
    return { contract, deliveryOrders: orders };
  }, [detailModal.contractId, detailRefreshKey, contracts, deliveryOrders]);

  // 筛选和排序后的合同列表
  const filteredContracts = useMemo(() => {
    let result = [...contracts];
    
    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((c) =>
        c.contractNumber.toLowerCase().includes(keyword) ||
        c.supplierName.toLowerCase().includes(keyword) ||
        c.sku.toLowerCase().includes(keyword)
      );
    }
    
    // 状态筛选（“已发货”与后端“发货完成”等价）
    if (filterStatus !== "all") {
      result = result.filter(
        (c) => c.status === filterStatus || (filterStatus === "已发货" && c.status === "发货完成")
      );
    }
    
    // 供应商筛选
    if (filterSupplier !== "all") {
      result = result.filter((c) => c.supplierId === filterSupplier);
    }
    
    return result;
  }, [contracts, searchKeyword, filterStatus, filterSupplier]);

  // 合同统计摘要
  const contractSummary = useMemo(() => {
    const totalCount = filteredContracts.length;
    const totalAmount = filteredContracts.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalPaid = filteredContracts.reduce((sum, c) => sum + (c.totalPaid || 0), 0);
    const totalOwed = filteredContracts.reduce((sum, c) => sum + (c.totalOwed || 0), 0);
    const totalDepositPaid = filteredContracts.reduce((sum, c) => sum + (c.depositPaid || 0), 0);
    const totalQty = filteredContracts.reduce((sum, c) => sum + c.totalQty, 0);
    const totalPickedQty = filteredContracts.reduce((sum, c) => sum + c.pickedQty, 0);
    const avgProgress = totalQty > 0 ? (totalPickedQty / totalQty) * 100 : 0;
    
    return {
      totalCount,
      totalAmount,
      totalPaid,
      totalOwed,
      totalDepositPaid,
      totalQty,
      totalPickedQty,
      avgProgress
    };
  }, [filteredContracts]);

  // 处理工厂完工
  const handleFactoryFinished = async (contractId: string) => {
    const contract = contracts.find((c) => c.id === contractId);
    if (!contract) {
      toast.error("合同不存在", { icon: "❌" });
      return;
    }
    
    // 计算可完工数量（合同总数 - 已完工数）
    const finishedQty = contract.finishedQty || 0;
    const availableQty = contract.totalQty - finishedQty;
    
    if (availableQty <= 0) {
      toast.error("该合同已全部完工", { icon: "⚠️" });
      return;
    }
    
    // 更新合同的完工数量
    contract.finishedQty = contract.totalQty;
    upsertPurchaseContract(contract);
    mutateContracts();
    
    // 更新产品的 at_factory 库存
    if (contract.skuId) {
      const product = products.find((p) => p.sku_id === contract.skuId || (p.id || p.sku) === contract.skuId);
      if (product) {
        const currentAtFactory = (product as any).at_factory || 0;
        const newAtFactory = currentAtFactory + availableQty;
        const updatedProduct = { ...product, at_factory: newAtFactory, updatedAt: new Date().toISOString() } as any;
        try {
          await upsertProduct(updatedProduct);
        } catch (e) {
          console.error("更新产品库存失败", e);
          toast.error("更新库存失败，请重试");
          return;
        }

        // 记录库存变动
        addInventoryMovement({
          skuId: contract.skuId,
          skuName: product.name,
          movementType: "工厂完工",
          location: "factory",
          qty: availableQty,
          qtyBefore: currentAtFactory,
          qtyAfter: newAtFactory,
          unitCost: contract.unitPrice,
          totalCost: availableQty * (contract.unitPrice || 0),
          currency: (contract as any).currency || "CNY",
          relatedOrderId: contract.id,
          relatedOrderNumber: contract.contractNumber,
          relatedOrderType: "采购合同",
          operationDate: new Date().toISOString(),
          notes: `工厂完工：全部完工（${contract.totalQty} 件）`,
        });

        toast.success(`工厂完工成功！已更新 ${availableQty} 件到工厂现货库存`);
      } else {
        toast.success(`工厂完工成功！合同已更新`, { icon: "✅" });
      }
    } else {
      toast.success(`工厂完工成功！合同已更新`, { icon: "✅" });
    }
    
    // 刷新详情
    if (detailModal.contractId === contractId) {
      setDetailRefreshKey((prev) => prev + 1);
    }
  };

  // 导出合同数据
  const handleExportData = () => {
    if (filteredContracts.length === 0) {
      toast.error("没有可导出的数据");
      return;
    }

    const headers = [
      "合同编号",
      "供应商",
      "SKU",
      "单价",
      "合同总数",
      "已拿货数",
      "合同总额",
      "定金比例(%)",
      "定金金额",
      "已付定金",
      "尾款账期(天)",
      "已付总额",
      "待付总额",
      "状态",
      "创建时间"
    ];

    const rows = filteredContracts.map((c) => {
      return [
        c.contractNumber || "",
        c.supplierName || "",
        c.sku || "",
        currency(c.unitPrice),
        String(c.totalQty),
        String(c.pickedQty),
        currency(c.totalAmount),
        String(c.depositRate),
        currency(c.depositAmount),
        currency(c.depositPaid || 0),
        String(c.tailPeriodDays),
        currency(c.totalPaid || 0),
        currency(c.totalOwed || 0),
        c.status || "",
        formatDate(c.createdAt)
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => {
        return row.map((cell) => {
          const cellStr = String(cell).replace(/"/g, '""');
          return `"${cellStr}"`;
        }).join(",");
      })
    ].join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `采购合同_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`已导出 ${filteredContracts.length} 条合同数据`);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">采购合同管理（分批拿货）</h1>
          <p className="mt-1 text-sm text-slate-400">
            支持分批拿货业务模式，每个合同可拆分为多个拿货单，自动衔接入库流程。点击"发起拿货"创建拿货单。
          </p>
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
            onClick={() => setIsCreateOpen(true)}
            type="button"
            className="flex items-center gap-2 rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px"
          >
            <Plus className="h-4 w-4" />
            新建采购合同
          </button>
        </div>
      </header>

      <PurchaseOrderStats summary={contractSummary} />

      <PurchaseOrderFilters
        searchKeyword={searchKeyword}
        onSearchKeywordChange={setSearchKeyword}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        filterSupplier={filterSupplier}
        onFilterSupplierChange={setFilterSupplier}
        suppliers={suppliers}
      />

      {!suppliersReady && (
        <div className="text-sm text-slate-400">正在加载供应商数据...</div>
      )}

      {suppliersReady && suppliers.length === 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          当前还没有供应商，请先前往"供应商库"新增后再创建采购合同。
        </div>
      )}

      <PurchaseOrdersTable
        contracts={contracts}
        filteredContracts={filteredContracts}
        expenseRequestsList={expenseRequestsList}
        clientNow={clientNow}
        isSuperAdmin={!!isSuperAdmin}
        onOpenDetail={openDetailModal}
        onOpenDelivery={openDeliveryModal}
        onPayment={handlePayment}
        onGenerateContract={handleGenerateContract}
        onDeleteContract={handleDeleteContract}
      />

      {/* 新建合同模态框 */}
      <PurchaseOrderCreateDialog
        open={isCreateOpen}
        onClose={() => { setIsCreateOpen(false); setSourceOrder(null); }}
        sourceOrder={sourceOrder}
        form={form}
        setForm={setForm}
        formItems={formItems}
        setFormItems={setFormItems}
        contractNumberFormat={contractNumberFormat}
        setContractNumberFormatAndSave={setContractNumberFormatAndSave}
        generateContractNumber={generateContractNumber}
        suppliers={suppliers}
        totalAmount={totalAmount}
        depositPreview={depositPreview}
        selectedSupplier={selectedSupplier}
        onOpenVariantModal={openVariantModalContract}
        variantModalOpen={variantModalOpen}
        onCloseVariantModal={() => {
          setVariantModalOpen(false);
          setVariantModalSupplierId(null);
          setVariantModalProductIds(null);
          setSelectedSpuContract(null);
          setVariantQuantities({});
          setVariantSearchContract("");
        }}
        variantModalSupplierId={variantModalSupplierId}
        variantModalProductIds={variantModalProductIds}
        variantModalSpuOptions={variantModalSpuOptions}
        selectedSpuContract={selectedSpuContract}
        onSelectSpuInModal={onSelectSpuInModal}
        variantSearchContract={variantSearchContract}
        setVariantSearchContract={setVariantSearchContract}
        variantQuantities={variantQuantities}
        setVariantQuantities={setVariantQuantities}
        loadingSpuId={loadingSpuId}
        onConfirmVariantSelection={confirmVariantSelectionContract}
        onSubmit={handleCreate}
        isCreateSaving={isCreateSaving}
      />

      {/* 合同详情模态框 */}
      <PurchaseOrderDetailDialog
        open={!!(detailModal.contractId && contractDetail)}
        contractDetail={contractDetail}
        products={products}
        isSuperAdmin={!!isSuperAdmin}
        onClose={() => setDetailModal({ contractId: null })}
        onDelete={handleDeleteContract}
        onFactoryFinished={handleFactoryFinished}
        onPaymentTail={(contractId, deliveryOrderId) => handlePayment(contractId, "tail", deliveryOrderId)}
      />

      {/* 发起拿货模态框 */}
      {deliveryModal.contractId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">发起拿货</h2>
                <p className="text-xs text-slate-400">
                  创建拿货单后，系统会自动推送到待入库状态。
                </p>
              </div>
              <button
                onClick={() => setDeliveryModal({ contractId: null, qty: "", trackingNumber: "", itemQtys: {} })}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDelivery} className="mt-4 space-y-3 text-sm">
              {(() => {
                const contract = contracts.find((c) => c.id === deliveryModal.contractId);
                if (!contract) return null;
                const remainingQty = contract.totalQty - contract.pickedQty;
                const hasItems = contract.items && contract.items.length > 0;
                return (
                  <>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
                      <div>合同：{contract.contractNumber}</div>
                      <div>剩余数量：{remainingQty}</div>
                    </div>
                    {hasItems ? (
                      <div className="space-y-2">
                        <span className="text-slate-300">按变体填写本次拿货数量 <span className="text-rose-400">*</span></span>
                        <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                          {contract.items!.map((item) => {
                            const remain = item.qty - item.pickedQty;
                            return (
                              <div key={item.id} className="flex items-center gap-2 text-xs">
                                <span className="min-w-[100px] truncate text-slate-300" title={item.sku}>
                                  {item.sku}
                                </span>
                                <span className="text-slate-500 shrink-0">剩 {remain}</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={remain}
                                  step={1}
                                  value={deliveryModal.itemQtys[item.id] ?? ""}
                                  onChange={(e) =>
                                    setDeliveryModal((d) => ({
                                      ...d,
                                      itemQtys: { ...d.itemQtys, [item.id]: e.target.value }
                                    }))
                                  }
                                  className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right outline-none focus:border-primary-400"
                                  placeholder="0"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <label className="space-y-1">
                        <span className="text-slate-300">本次数量 <span className="text-rose-400">*</span></span>
                        <input
                          type="number"
                          min={1}
                          step="1"
                          value={deliveryModal.qty}
                          onChange={(e) => setDeliveryModal((d) => ({ ...d, qty: e.target.value }))}
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                          required
                        />
                      </label>
                    )}
                    <label className="space-y-1">
                      <span className="text-slate-300">国内快递单号（可选）</span>
                      <input
                        type="text"
                        value={deliveryModal.trackingNumber}
                        onChange={(e) => setDeliveryModal((d) => ({ ...d, trackingNumber: e.target.value }))}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                        placeholder="输入物流单号"
                      />
                    </label>
                  </>
                );
              })()}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeliveryModal({ contractId: null, qty: "", trackingNumber: "", itemQtys: {} })}
                  disabled={deliverySubmitting}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={deliverySubmitting}
                  className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deliverySubmitting ? "处理中..." : "创建拿货单"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 支付模态框 */}
      {paymentModal.contractId && paymentModal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  paymentModal.type === "deposit" 
                    ? "bg-amber-500/20 border border-amber-500/40" 
                    : "bg-primary-500/20 border border-primary-500/40"
                }`}>
                  <Wallet className={`h-5 w-5 ${
                    paymentModal.type === "deposit" ? "text-amber-300" : "text-primary-300"
                  }`} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">
                    {paymentModal.type === "deposit" ? "申请支付定金" : "支付尾款"}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {paymentModal.type === "deposit" 
                      ? "将创建付款申请并推送到审批中心" 
                      : "支付后将自动生成收支明细并更新账户余额"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPaymentModal({ contractId: null, type: null, accountId: "" })}
                className="text-slate-400 hover:text-slate-200 transition-colors p-1 hover:bg-slate-800 rounded"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {(() => {
                const contract = contracts.find((c) => c.id === paymentModal.contractId);
                if (!contract) return null;
                let amount = 0;
                if (paymentModal.type === "deposit") {
                  amount = contract.depositAmount - (contract.depositPaid || 0);
                } else if (paymentModal.type === "tail" && paymentModal.deliveryOrderId) {
                  const contractOrders = deliveryOrders.filter((o) => o.contractId === contract.id);
                  const order = contractOrders.find((o) => o.id === paymentModal.deliveryOrderId);
                  if (order) amount = order.tailAmount;
                }
                const account = accounts.find((a) => a.id === paymentModal.accountId);
                
                // 检查是否已创建定金付款申请
                const existingRequest = paymentModal.type === "deposit" && contract
                  ? expenseRequestsList.find((r) => {
                      const isContractDeposit = r.summary.includes(`采购合同定金 - ${contract.contractNumber}`);
                      return isContractDeposit && (r.status === "Pending_Approval" || r.status === "Approved" || r.status === "Paid");
                    })
                  : null;
                const hasExistingDepositRequest = !!existingRequest;
                const existingDepositRequestStatus = existingRequest?.status || null;
                
                return (
                  <>
                    {/* 合同信息卡片 */}
                    <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-4 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">合同信息</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {contract.contractNumber}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-slate-400 mb-1">供应商</div>
                          <div className="text-sm font-medium text-slate-100">{contract.supplierName}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">SKU</div>
                          <div className="text-sm text-slate-200 truncate">{contract.sku}</div>
                        </div>
                      </div>
                    </div>

                    {/* 金额信息卡片 */}
                    <div className={`rounded-xl border p-5 ${
                      paymentModal.type === "deposit"
                        ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-amber-500/5"
                        : "border-primary-500/40 bg-gradient-to-br from-primary-500/10 to-primary-500/5"
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                          {paymentModal.type === "deposit" ? "定金金额" : "尾款金额"}
                        </span>
                        {paymentModal.type === "deposit" && (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            需审批
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-slate-100">
                          {currency(amount)}
                        </span>
                        {paymentModal.type === "deposit" && (
                          <span className="text-sm text-slate-400">
                            / {currency(contract.depositAmount)} 总额
                          </span>
                        )}
                      </div>
                      {paymentModal.type === "deposit" && contract.depositPaid > 0 && (
                        <div className="mt-2 text-xs text-slate-400">
                          已付：<span className="text-emerald-300 font-medium">{currency(contract.depositPaid)}</span>
                        </div>
                      )}
                    </div>

                    {/* 账户选择（仅尾款需要） */}
                    {paymentModal.type === "tail" && (
                      <div className="space-y-2">
                        <label className="block">
                          <span className="text-sm font-medium text-slate-300 mb-2 block">选择支付账户</span>
                          <select
                            value={paymentModal.accountId}
                            onChange={(e) => setPaymentModal((m) => ({ ...m, accountId: e.target.value }))}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 transition-all"
                            required
                          >
                            <option value="">请选择账户</option>
                            {accounts.map((acc) => {
                              const accountBalance = acc.originalBalance !== undefined ? acc.originalBalance : acc.balance || 0;
                              return (
                                <option key={acc.id} value={acc.id}>
                                  {acc.name} - 余额 {currency(accountBalance, acc.currency)}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        {account && (() => {
                          const accountBalance = account.originalBalance !== undefined ? account.originalBalance : account.balance || 0;
                          const isInsufficient = accountBalance < amount;
                          return (
                            <div className={`rounded-lg border p-3 ${
                              isInsufficient
                                ? "border-rose-500/40 bg-rose-500/10"
                                : "border-slate-800 bg-slate-900/60"
                            }`}>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-400">账户余额</span>
                                <span className={`font-medium ${
                                  isInsufficient ? "text-rose-300" : "text-slate-100"
                                }`}>
                                  {currency(accountBalance, account.currency)}
                                </span>
                              </div>
                              {isInsufficient && (
                                <div className="mt-1 text-xs text-rose-300 flex items-center gap-1">
                                  <span>⚠️</span>
                                  <span>余额不足，无法完成支付</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* 提示信息（仅定金） */}
                    {paymentModal.type === "deposit" && (
                      <>
                        {hasExistingDepositRequest ? (
                          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-0.5">
                                <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
                                  <span className="text-amber-300 text-xs">⚠</span>
                                </div>
                              </div>
                              <div className="flex-1 text-sm text-slate-300">
                                <p className="font-medium text-amber-200 mb-1">付款申请已存在</p>
                                <p className="text-xs text-slate-400">
                                  该合同的定金付款申请已创建，当前状态：
                                  <span className="text-amber-300 ml-1">
                                    {existingDepositRequestStatus === "Pending_Approval" 
                                      ? "待审批" 
                                      : existingDepositRequestStatus === "Approved"
                                      ? "已审批"
                                      : "已支付"}
                                  </span>
                                </p>
                                <p className="text-xs text-slate-500 mt-2">
                                  请前往审批中心查看详情，请勿重复创建。
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-0.5">
                                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                                  <span className="text-blue-300 text-xs">ℹ</span>
                                </div>
                              </div>
                              <div className="flex-1 text-sm text-slate-300 space-y-1">
                                <p className="font-medium text-blue-200">审批流程说明</p>
                                <ul className="list-disc list-inside space-y-1 text-xs text-slate-400 ml-2">
                                  <li>创建付款申请后将推送到审批中心</li>
                                  <li>审批通过后自动生成应付款账单</li>
                                  <li>财务人员可在"待付款"中处理付款</li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setPaymentModal({ contractId: null, type: null, accountId: "" })}
                        className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition-all"
                      >
                        取消
                      </button>
                      {paymentModal.type === "deposit" ? (
                        <button
                          onClick={() => {
                            handlePayment(paymentModal.contractId!, "deposit");
                            // 注意：handlePayment 内部会关闭模态框，这里不需要重复关闭
                          }}
                          disabled={hasExistingDepositRequest}
                          className={`rounded-lg px-6 py-2.5 text-sm font-medium text-white shadow-lg transition-all flex items-center gap-2 ${
                            hasExistingDepositRequest
                              ? "bg-slate-600 cursor-not-allowed opacity-50"
                              : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:translate-y-px"
                          }`}
                        >
                          <Wallet className="h-4 w-4" />
                          {hasExistingDepositRequest ? "申请已存在" : "创建付款申请"}
                        </button>
                      ) : (
                        <button
                          onClick={confirmPayment}
                          disabled={!paymentModal.accountId || (account ? (account.originalBalance !== undefined ? account.originalBalance : account.balance || 0) < amount : true)}
                          className="rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg hover:from-primary-600 hover:to-primary-700 active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-primary-500 disabled:hover:to-primary-600 flex items-center gap-2"
                        >
                          <Wallet className="h-4 w-4" />
                          确认支付
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 成功提示模态框 */}
      {successModal.open && successModal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="text-center">
              {/* 成功图标 */}
              <div className="flex justify-center mb-4">
                <div className={`p-4 rounded-full ${
                  successModal.type === "deposit" 
                    ? "bg-amber-500/20 border-2 border-amber-500/40" 
                    : "bg-emerald-500/20 border-2 border-emerald-500/40"
                }`}>
                  {successModal.type === "deposit" ? (
                    <CheckCircle2 className="h-12 w-12 text-amber-300" />
                  ) : (
                    <CheckCircle2 className="h-12 w-12 text-emerald-300" />
                  )}
                </div>
              </div>

              {/* 标题 */}
              <h2 className="text-2xl font-bold text-slate-100 mb-2">
                {successModal.type === "deposit" ? "付款申请已创建" : "拿货单创建成功"}
              </h2>

              {/* 内容 */}
              <div className="space-y-3 mb-6">
                {successModal.type === "deposit" && successModal.data && (
                  <>
                    <p className="text-slate-300 text-sm">
                      定金付款申请已创建并推送到审批中心
                    </p>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">合同编号</span>
                        <span className="text-slate-100 font-medium">{successModal.data.contractNumber}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">供应商</span>
                        <span className="text-slate-100">{successModal.data.supplierName}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">申请金额</span>
                        <span className="text-amber-300 font-bold text-lg">{currency(successModal.data.amount)}</span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-3">
                      <p className="text-blue-200 text-xs flex items-center gap-2 justify-center">
                        <ArrowRight className="h-4 w-4" />
                        请前往审批中心进行审批
                      </p>
                    </div>
                  </>
                )}

                {successModal.type === "delivery" && successModal.data && (
                  <>
                    <p className="text-slate-300 text-sm">
                      拿货单已创建并自动推送到待入库状态
                    </p>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">合同编号</span>
                        <span className="text-slate-100 font-medium">{successModal.data.contractNumber}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">拿货单号</span>
                        <span className="text-slate-100 font-mono text-xs">{successModal.data.orderNumber}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">本次数量</span>
                        <span className="text-emerald-300 font-bold">{successModal.data.qty}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 按钮 */}
              <button
                onClick={() => setSuccessModal({ open: false, type: null })}
                className={`w-full rounded-lg px-6 py-3 font-medium text-white shadow-lg transition-all ${
                  successModal.type === "deposit"
                    ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
                    : "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                } active:translate-y-px`}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
