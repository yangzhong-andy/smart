"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Package, Plus, Eye, Truck, Wallet, ChevronRight, CheckCircle2, ArrowRight, XCircle, FileImage, Search, X, Download, TrendingUp, DollarSign, Coins, Factory, FileText, Palette } from "lucide-react";
import { useRouter } from "next/navigation";
import ImageUploader from "@/components/ImageUploader";
import DateInput from "@/components/DateInput";
import InventoryDistribution from "@/components/InventoryDistribution";
import { getSpuListFromAPI, getVariantsBySpuIdFromAPI, getProductsFromAPI, upsertProduct, type Product as ProductType, type SpuListItem } from "@/lib/products-store";
import { addInventoryMovement } from "@/lib/inventory-movements-store";
import { getAccountsFromAPI, saveAccounts, type BankAccount } from "@/lib/finance-store";
import { getCashFlowFromAPI, createCashFlow } from "@/lib/cash-flow-store";

type Supplier = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  depositRate: number;
  tailPeriodDays: number;
  settleBase: "发货" | "入库";
};

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

// 新建合同时的物料行
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

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatDate = (d: string) => new Date(d).toISOString().slice(0, 10);

// 生产进度：从下单日到交货日按天数递进（需传入 today 以使用用户本地时间，避免线上 SSR 用服务器 UTC 导致进度不准）
function getProductionProgress(
  createdAt: string,
  deliveryDate?: string,
  today: Date = new Date()
): { percent: number; label: string } | null {
  if (!deliveryDate) return null;
  const start = new Date(createdAt);
  const end = new Date(deliveryDate);
  const t = new Date(today.getTime());
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  const totalMs = end.getTime() - start.getTime();
  const totalDays = Math.max(0, totalMs / (24 * 60 * 60 * 1000));
  if (totalDays <= 0) return { percent: 100, label: "已到期" };
  const elapsedMs = t.getTime() - start.getTime();
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);
  if (elapsedDays <= 0) return { percent: 0, label: "未开始" };
  if (elapsedDays >= totalDays) return { percent: 100, label: "已到期" };
  const percent = Math.round((elapsedDays / totalDays) * 100);
  const remaining = Math.ceil(totalDays - elapsedDays);
  return { percent, label: `剩 ${remaining} 天` };
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [spuList, setSpuList] = useState<SpuListItem[]>([]);
  const [variantCache, setVariantCache] = useState<Record<string, Product[]>>({}); // productId -> 该 SPU 下全部 SKU（一次性 include 拉取后缓存）
  const [loadingSpuId, setLoadingSpuId] = useState<string | null>(null);
  const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));
  const { data: contractsData = [], mutate: mutateContracts } = useSWR<PurchaseContract[]>(
    "/api/purchase-contracts",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const contracts = contractsData;
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; originalBalance: number; balance?: number; currency: string }>>([]);
  const { data: deliveryOrdersData = [], mutate: mutateDeliveryOrders } = useSWR<DeliveryOrder[]>(
    "/api/delivery-orders",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const deliveryOrders = deliveryOrdersData;
  const [suppliersReady, setSuppliersReady] = useState(false);
  const [expenseRequests, setExpenseRequests] = useState<ExpenseRequest[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [sourceOrder, setSourceOrder] = useState<PurchaseOrder | null>(null);
  const [detailModal, setDetailModal] = useState<{ contractId: string | null }>({ contractId: null });
  const [deliveryModal, setDeliveryModal] = useState<{ contractId: string | null; qty: string; trackingNumber: string }>({
    contractId: null,
    qty: "",
    trackingNumber: ""
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
  const [form, setForm] = useState({
    supplierId: "",
    deliveryDate: "",
    contractVoucher: "" as string | string[]
  });
  const [formItems, setFormItems] = useState<FormItemRow[]>([]);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [variantQuantities, setVariantQuantities] = useState<Record<string, string>>({});
  const [selectedSpuContract, setSelectedSpuContract] = useState<SpuOption | null>(null);
  const [variantSearchContract, setVariantSearchContract] = useState(""); // 变体选择器内按颜色/SKU 搜索

  // 搜索和筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  // 生产进度需用用户本地时间计算，避免线上 SSR 用服务器 UTC 导致进度不动
  const [clientNow, setClientNow] = useState<Date | null>(null);

  // 加载支出申请数据
  useEffect(() => {
    if (typeof window === "undefined") return;
    getExpenseRequests().then(setExpenseRequests);
  }, []);

  // 生产进度使用用户本地时间，仅在客户端挂载后设置
  useEffect(() => {
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
    fetch("/api/suppliers")
      .then((res) => (res.ok ? res.json() : []))
      .then((parsed: Supplier[]) => {
        setSuppliers(Array.isArray(parsed) ? parsed : []);
        if (Array.isArray(parsed) && parsed.length && !form.supplierId) {
          setForm((f) => ({ ...f, supplierId: parsed[0].id }));
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

  const spuOptions = useMemo((): SpuOption[] => {
    return spuList.map((s) => ({
      productId: s.productId,
      name: s.name,
      variants: variantCache[s.productId] ?? [],
    }));
  }, [spuList, variantCache]);

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
    setSelectedSpuContract(null);
    setVariantQuantities({});
    setVariantSearchContract("");
    setVariantModalOpen(true);
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
    const body = {
      contractNumber: `PC-${Date.now()}`,
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      depositRate: selectedSupplier.depositRate,
      tailPeriodDays: selectedSupplier.tailPeriodDays,
      deliveryDate: form.deliveryDate || undefined,
      status: "待发货",
      contractVoucher: form.contractVoucher,
      relatedOrderIds: sourceOrder ? [sourceOrder.id] : [],
      relatedOrderNumbers: sourceOrder ? [sourceOrder.orderNumber ?? ""] : [],
      items,
    };
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
        toast.success("采购合同创建成功，已自动关联采购订单", { icon: "✅" });
      } else {
        toast.success("采购合同创建成功", { icon: "✅" });
      }
      setSourceOrder(null);
      setForm((f) => ({ ...f, deliveryDate: "", contractVoucher: "" }));
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
    }
  };

  // 打开详情模态框
  const openDetailModal = (contractId: string) => {
    setDetailModal({ contractId });
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

  // 打开发起拿货模态框
  const openDeliveryModal = (contractId: string) => {
    setDeliveryModal({ contractId, qty: "", trackingNumber: "" });
  };

  // 处理发起拿货
  const handleDelivery = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!deliveryModal.contractId) return;
    const qty = Number(deliveryModal.qty);
    if (Number.isNaN(qty) || qty <= 0) {
      toast.error("本次拿货数量需大于 0", { icon: "⚠️" });
      return;
    }

    const contract = contracts.find((c) => c.id === deliveryModal.contractId);
    if (!contract) {
      toast.error("合同不存在", { icon: "❌" });
      return;
    }

    // 检查剩余数量
    const remainingQty = contract.totalQty - contract.pickedQty;
    if (qty > remainingQty) {
      toast.error(`本次拿货数量 ${qty} 超过剩余数量 ${remainingQty}，无法提交！`);
      return;
    }

    // 创建子单
    const result = await createDeliveryOrder(
      deliveryModal.contractId,
      qty,
      deliveryModal.trackingNumber || undefined,
      new Date().toISOString().slice(0, 10)
    );

    if (!result.success) {
      toast.error(result.error || "创建拿货单失败", { icon: "❌" });
      return;
    }

    // 自动创建待入库单
    if (result.order) {
      const inboundResult = await createPendingInboundFromDeliveryOrder(result.order.id);
      if (!inboundResult.success) {
        console.warn("创建待入库单失败:", inboundResult.error);
      }
    }

    mutateContracts();
    mutateDeliveryOrders();

    // 如果详情页打开，刷新详情数据
    if (detailModal.contractId === deliveryModal.contractId) {
      setDetailRefreshKey((prev) => prev + 1);
    }

    setDeliveryModal({ contractId: null, qty: "", trackingNumber: "" });
    setSuccessModal({ 
      open: true, 
      type: "delivery", 
      data: { contractNumber: contract.contractNumber, qty, orderNumber: result.order?.deliveryNumber }
    });
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
      const existingRequest = expenseRequests.find((r) => {
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
    
    // 状态筛选
    if (filterStatus !== "all") {
      result = result.filter((c) => c.status === filterStatus);
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
            className="flex items-center gap-2 rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px"
          >
            <Plus className="h-4 w-4" />
            新建采购合同
          </button>
        </div>
      </header>

      {/* 统计面板 */}
      <section className="grid gap-6 md:grid-cols-4">
        {/* 总合同数 */}
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
            <div className="text-xs font-medium text-white/80 mb-1">总合同数</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {contractSummary.totalCount}
            </div>
          </div>
        </div>

        {/* 合同总额 */}
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
            <div className="text-xs font-medium text-white/80 mb-1">合同总额</div>
            <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(contractSummary.totalAmount)}
            </div>
          </div>
        </div>

        {/* 已付总额 */}
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
                <Coins className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">已付总额</div>
            <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(contractSummary.totalPaid)}
            </div>
          </div>
        </div>

        {/* 拿货进度 */}
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
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">拿货进度</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {contractSummary.avgProgress.toFixed(1)}%
            </div>
          </div>
        </div>
      </section>

      {/* 搜索和筛选 */}
      <section className="space-y-3">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索合同编号、供应商、SKU..."
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

        {/* 快速筛选 */}
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
                onClick={() => setFilterStatus("待发货")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterStatus === "待发货"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                待发货
              </button>
              <button
                onClick={() => setFilterStatus("部分发货")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterStatus === "部分发货"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                部分发货
              </button>
              <button
                onClick={() => setFilterStatus("已发货")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterStatus === "已发货"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                已发货
              </button>
            </div>
          </div>

          {/* 供应商筛选 */}
          {suppliers.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">供应商：</span>
              <select
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value)}
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
        </div>
      </section>

      {!suppliersReady && (
        <div className="text-sm text-slate-400">正在加载供应商数据...</div>
      )}

      {suppliersReady && suppliers.length === 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          当前还没有供应商，请先前往"供应商库"新增后再创建采购合同。
        </div>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">合同编号</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">供应商</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">SKU / 数量</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">合同总额</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">拿货进度</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">生产进度</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">财务状态</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {filteredContracts.length === 0 && (
                <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                    {contracts.length === 0
                      ? "暂无采购合同，请点击右上角\"新建采购合同\""
                      : "没有符合条件的合同"}
                  </td>
                </tr>
              )}
              {filteredContracts.map((contract) => {
                const progressPercent = contract.totalQty > 0 ? (contract.pickedQty / contract.totalQty) * 100 : 0;
                const remainingQty = contract.totalQty - contract.pickedQty;
                
                // 检查是否已创建定金付款申请
                const depositRequest = expenseRequests.find((r) => {
                  const isContractDeposit = r.summary.includes(`采购合同定金 - ${contract.contractNumber}`);
                  return isContractDeposit && (r.status === "Pending_Approval" || r.status === "Approved" || r.status === "Paid");
                });
                const hasDepositRequest = !!depositRequest;
                const depositRequestStatus = depositRequest?.status;
                
                return (
                  <tr key={contract.id}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-100">{contract.contractNumber}</div>
                      <div className="text-[11px] text-slate-500">{formatDate(contract.createdAt)}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-slate-100">{contract.supplierName}</div>
                      <div className="text-[11px] text-slate-500">
                        定金 {contract.depositRate}% · 尾款账期 {contract.tailPeriodDays} 天
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {contract.items && contract.items.length > 0 ? (
                        <div className="space-y-1 max-w-[220px]">
                          <div className="text-[11px] text-slate-400 font-medium">
                            共 {contract.items.length} 个变体 · 合同总数 {contract.totalQty}
                          </div>
                          <div className="max-h-24 overflow-y-auto space-y-0.5 pr-1">
                            {contract.items.map((item) => (
                              <div
                                key={item.id}
                                className="text-[11px] text-slate-300 flex justify-between gap-2 border-b border-slate-800/60 pb-0.5 last:border-0 last:pb-0"
                              >
                                <span className="truncate" title={[item.sku, item.skuName].filter(Boolean).join(' / ')}>
                                  {item.sku}
                                </span>
                                <span className="text-slate-500 shrink-0">
                                  {currency(item.unitPrice)} × {item.qty}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="text-slate-100">{contract.sku}</div>
                          <div className="text-[11px] text-slate-500">单价 {currency(contract.unitPrice)}</div>
                          <div className="text-[11px] text-slate-500">合同总数 {contract.totalQty}</div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-slate-100">{currency(contract.totalAmount)}</div>
                      <div className="text-[11px] text-amber-200">
                        定金 {currency(contract.depositAmount)}
                        {contract.depositPaid > 0 && (
                          <span className="text-emerald-300">（已付 {currency(contract.depositPaid)}）</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {contract.items && contract.items.length > 0 ? (
                        <div className="space-y-1 max-w-[180px]">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex-1 rounded-full bg-slate-800 h-1.5 overflow-hidden min-w-[60px]">
                              <div
                                className="h-full bg-primary-500 transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-slate-400 whitespace-nowrap">
                              {contract.pickedQty} / {contract.totalQty}
                            </span>
                          </div>
                          <div className="max-h-20 overflow-y-auto space-y-0.5">
                            {contract.items.map((item) => {
                              const itemRemain = item.qty - item.pickedQty;
                              return (
                                <div
                                  key={item.id}
                                  className="text-[11px] text-slate-400 flex justify-between gap-2 border-b border-slate-800/60 pb-0.5 last:border-0 last:pb-0"
                                >
                                  <span className="truncate">{item.sku}</span>
                                  <span className="text-slate-500 shrink-0">
                                    {item.pickedQty} / {item.qty}
                                    {itemRemain > 0 && <span className="text-amber-500/80 ml-0.5">剩{itemRemain}</span>}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {contract.status} {remainingQty > 0 && `· 剩余 ${remainingQty}`}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 rounded-full bg-slate-800 h-2 overflow-hidden">
                              <div
                                className="h-full bg-primary-500 transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-300 whitespace-nowrap">
                              {contract.pickedQty} / {contract.totalQty}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            {contract.status} {remainingQty > 0 && `· 剩余 ${remainingQty}`}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {(() => {
                        if (!contract.deliveryDate) {
                          return (
                            <div className="text-[11px] text-slate-500">未设交货日期</div>
                          );
                        }
                        // 仅在客户端有 clientNow 时计算进度，避免 SSR 用服务器 UTC 导致线上进度不准
                        const prod = clientNow
                          ? getProductionProgress(contract.createdAt, contract.deliveryDate, clientNow)
                          : null;
                        if (!prod) {
                          return (
                            <div className="space-y-0.5 min-w-[90px]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 rounded-full bg-slate-800 h-1.5 overflow-hidden min-w-[50px]">
                                  <div className="h-full bg-slate-700 w-0" />
                                </div>
                                <span className="text-[11px] text-slate-500">—</span>
                              </div>
                              <div className="text-[10px] text-slate-500">
                                · {formatDate(contract.deliveryDate)} 交货
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div className="space-y-0.5 min-w-[90px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 rounded-full bg-slate-800 h-1.5 overflow-hidden min-w-[50px]">
                                <div
                                  className="h-full bg-amber-500/80 transition-all duration-300"
                                  style={{ width: `${prod.percent}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-slate-400 whitespace-nowrap">
                                {prod.percent}%
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {prod.label}
                              <span className="ml-1">· {formatDate(contract.deliveryDate)} 交货</span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-slate-100">{currency(contract.totalPaid || 0)} / {currency(contract.totalAmount)}</div>
                      <div className="text-[11px] text-slate-500">
                        已付总额 / 合同总额
                      </div>
                      {contract.totalOwed > 0 && (
                        <div className="text-[11px] text-amber-200 mt-1">
                          还欠 {currency(contract.totalOwed)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex flex-col gap-1 items-end">
                        <button
                          onClick={() => handleGenerateContract(contract.id)}
                          className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20"
                          title="生成合同并预览/下载 PDF"
                        >
                          <FileText className="h-3 w-3" />
                          生成合同
                        </button>
                        <button
                          onClick={() => openDetailModal(contract.id)}
                          className="flex items-center gap-1 rounded-md border border-slate-600/40 bg-slate-800/40 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700/40"
                        >
                          <Eye className="h-3 w-3" />
                          详情
                        </button>
                        {remainingQty > 0 && (
                          <button
                            onClick={() => openDeliveryModal(contract.id)}
                            className="flex items-center gap-1 rounded-md border border-primary-500/40 bg-primary-500/10 px-2 py-1 text-xs font-medium text-primary-100 hover:bg-primary-500/20"
                          >
                            <Truck className="h-3 w-3" />
                            发起拿货
                          </button>
                        )}
                        {(contract.depositPaid || 0) < contract.depositAmount && (
                          <>
                            {hasDepositRequest ? (
                              <button
                                disabled
                                className="rounded-md border border-slate-600/40 bg-slate-700/40 px-2 py-1 text-xs font-medium text-slate-400 cursor-not-allowed"
                                title={`付款申请状态：${
                                  depositRequestStatus === "Pending_Approval" 
                                    ? "待审批" 
                                    : depositRequestStatus === "Approved"
                                    ? "已审批"
                                    : "已支付"
                                }`}
                              >
                                {depositRequestStatus === "Pending_Approval" 
                                  ? "审批中" 
                                  : depositRequestStatus === "Approved"
                                  ? "已审批"
                                  : "已支付"}
                              </button>
                            ) : (
                              <button
                                onClick={() => handlePayment(contract.id, "deposit")}
                                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
                              >
                                支付定金
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 新建合同模态框 */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  {sourceOrder ? "基于采购订单创建合同" : "新建采购合同"}
                </h2>
                <p className="text-xs text-slate-400">
                  {sourceOrder 
                    ? `订单：${sourceOrder.orderNumber} · 已自动填充产品信息`
                    : "选定供应商后，系统会根据其定金比例自动计算需要预付的定金。"}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsCreateOpen(false);
                  setSourceOrder(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            
            {/* 显示来源订单信息 */}
            {sourceOrder && (
              <div className="mb-4 p-3 rounded-lg border border-primary-500/30 bg-primary-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-primary-400" />
                  <span className="text-sm font-medium text-primary-300">来源订单信息</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div>订单编号：{sourceOrder.orderNumber}</div>
                  <div>下单人：{sourceOrder.createdBy}</div>
                  <div>平台：{sourceOrder.platform}</div>
                  <div>需求数量：{sourceOrder.quantity}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleCreate} className="mt-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-slate-300">供应商</span>
                  <select
                    value={form.supplierId || selectedSupplier?.id || ""}
                    onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    required
                  >
                    <option value="" disabled>请选择</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}（定金 {s.depositRate}%，账期 {s.tailPeriodDays} 天）
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">交货日期</span>
                  <DateInput
                    value={form.deliveryDate}
                    onChange={(v) => setForm((f) => ({ ...f, deliveryDate: v }))}
                    placeholder="选择交货日期"
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  />
                  <p className="text-xs text-slate-500 mt-1">用于跟进生产进度，建议设置</p>
                </label>
              </div>

              {/* 物料明细：按产品原型选变体 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-slate-300 font-medium">物料明细</span>
                  <button
                    type="button"
                    onClick={openVariantModalContract}
                    className="flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
                  >
                    <Palette className="h-3 w-3" />
                    按产品原型选变体
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  先选产品原型（如马扎05），再为各颜色填写数量，可一次生成多行。
                </p>
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  {formItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 bg-slate-900/40 text-slate-400 text-sm">
                      <Palette className="h-8 w-8 text-slate-500" />
                      <p>暂无物料</p>
                      <p className="text-xs">请点击上方「按产品原型选变体」添加</p>
                    </div>
                  ) : (
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-800/80">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-slate-400 w-8">#</th>
                        <th className="px-2 py-1.5 text-left text-slate-400">品名 / 规格</th>
                        <th className="px-2 py-1.5 text-left text-slate-400 w-24">规格备注</th>
                        <th className="px-2 py-1.5 text-right text-slate-400 w-16">数量</th>
                        <th className="px-2 py-1.5 text-right text-slate-400 w-20">单价(元)</th>
                        <th className="px-2 py-1.5 text-right text-slate-400 w-20">小计</th>
                        <th className="px-2 py-1.5 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {formItems.map((row, idx) => {
                        const lineTotal = (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
                        const displayName = [row.skuName || row.sku, row.spec].filter(Boolean).join(" · ") || "—";
                        return (
                          <tr key={row.tempId} className="bg-slate-900/40">
                            <td className="px-2 py-1.5 text-slate-500">{idx + 1}</td>
                            <td className="px-2 py-1.5 text-slate-200">{displayName}</td>
                            <td className="px-2 py-1.5">
                              <input
                                value={row.spec}
                                onChange={(e) => setFormItems((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, spec: e.target.value } : r)))}
                                placeholder="规格备注"
                                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={row.quantity}
                                onChange={(e) => setFormItems((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, quantity: e.target.value } : r)))}
                                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-slate-200"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={row.unitPrice}
                                onChange={(e) => setFormItems((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, unitPrice: e.target.value } : r)))}
                                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-slate-200"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right text-slate-200 font-mono">{currency(lineTotal)}</td>
                            <td className="px-2 py-1.5">
                              <button
                                type="button"
                                onClick={() => setFormItems((prev) => prev.filter((r) => r.tempId !== row.tempId))}
                                className="text-slate-400 hover:text-rose-400"
                                title="删除行"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200">
                <div className="flex flex-wrap items-center gap-4">
                  <div>预计总额：{currency(totalAmount)}</div>
                  <div>定金比例：{selectedSupplier ? selectedSupplier.depositRate : "--"}%</div>
                  <div className="text-amber-200">需付定金：{currency(depositPreview)}</div>
                </div>
              </div>

              {/* 合同凭证上传 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-300">
                    合同凭证 <span className="text-rose-400">*</span>
                  </span>
                </div>
                <ImageUploader
                  value={form.contractVoucher}
                  onChange={(value) => setForm((f) => ({ ...f, contractVoucher: value }))}
                  label=""
                  multiple={true}
                  maxImages={10}
                  placeholder="点击上传或直接 Ctrl + V 粘贴合同凭证图片，支持多张"
                  required
                />
                <p className="text-xs text-slate-500">
                  请上传合同扫描件或照片，支持多张图片，最多10张
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px"
                  disabled={!suppliers.length}
                >
                  保存合同
                </button>
              </div>
            </form>

            {/* 按产品原型选变体弹窗 */}
            {variantModalOpen && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur">
                <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between mb-4 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-slate-100">按产品原型选择变体</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setVariantModalOpen(false);
                        setSelectedSpuContract(null);
                        setVariantQuantities({});
                        setVariantSearchContract("");
                      }}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-4 flex-shrink-0">
                    先选规格/型号，再在下方为各颜色填写数量；未选规格前不显示颜色列表。
                  </p>
                  <div className="flex-shrink-0 mb-4">
                    <label className="block text-sm text-slate-300 mb-2">规格 / 型号</label>
                    <select
                      value={selectedSpuContract?.productId ?? ""}
                      onChange={(e) => {
                        const spu = spuOptions.find((s) => s.productId === e.target.value);
                        if (spu) onSelectSpuInModal(spu);
                      }}
                      disabled={!!loadingSpuId}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-primary-400 disabled:opacity-60"
                    >
                      <option value="">请选择规格/型号（如 mz03）</option>
                      {spuOptions.map((spu) => (
                        <option key={spu.productId} value={spu.productId}>
                          {spu.name}（{loadingSpuId === spu.productId ? "加载中…" : `${spu.variants.length} 个颜色`}）
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedSpuContract && (
                    <>
                      <div className="flex-shrink-0 mb-2 flex items-center gap-2">
                        <Search className="h-4 w-4 text-slate-500" />
                        <input
                          type="text"
                          value={variantSearchContract}
                          onChange={(e) => setVariantSearchContract(e.target.value)}
                          placeholder="按颜色或 SKU 搜索…"
                          className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary-400"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mb-2 flex-shrink-0">数量矩阵：在同规格下为各颜色直接填写采购数量</p>
                    </>
                  )}
                  <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
                    {selectedSpuContract ? (
                      (() => {
                        const kw = variantSearchContract.trim().toLowerCase();
                        const list = kw
                          ? selectedSpuContract.variants.filter(
                              (v) =>
                                (v.color || "").toLowerCase().includes(kw) ||
                                (v.sku_id || "").toLowerCase().includes(kw)
                            )
                          : selectedSpuContract.variants;
                        return list.length > 0 ? (
                          list.map((v) => (
                        <div
                          key={v.sku_id}
                          className="flex items-center gap-4 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 flex-shrink-0"
                        >
                          <span className="text-slate-200 font-medium w-20 truncate">{v.color || v.sku_id}</span>
                          <span className="text-slate-500 text-sm flex-1 truncate">{v.sku_id}</span>
                          <span className="text-slate-400 text-sm whitespace-nowrap">
                            ¥{Number((v as Product).cost_price ?? 0).toFixed(2)}
                          </span>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={variantQuantities[v.sku_id!] ?? ""}
                            onChange={(e) =>
                              setVariantQuantities((prev) => ({ ...prev, [v.sku_id!]: e.target.value }))
                            }
                            className="w-24 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-right text-slate-100 outline-none focus:border-primary-400"
                          />
                          <span className="text-slate-500 text-sm w-6">件</span>
                        </div>
                          ))
                        ) : (
                          <div className="text-center py-6 text-slate-500 text-sm">
                            {variantSearchContract.trim() ? "未匹配到该颜色或 SKU，请修改搜索词" : "该规格下暂无变体"}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-center py-8 text-slate-500 text-sm">请先选择规格/型号</div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-800 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setVariantModalOpen(false);
                        setSelectedSpuContract(null);
                        setVariantQuantities({});
                        setVariantSearchContract("");
                      }}
                      className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={confirmVariantSelectionContract}
                      className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600"
                    >
                      确定并加入明细
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 合同详情模态框 */}
      {detailModal.contractId && contractDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">合同详情</h2>
                <p className="text-xs text-slate-400">{contractDetail.contract.contractNumber}</p>
              </div>
              <button
                onClick={() => setDetailModal({ contractId: null })}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* 关联采购订单 */}
              {contractDetail.contract.relatedOrderNumber && (
                <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-primary-400" />
                    <h3 className="text-sm font-medium text-primary-300">关联采购订单</h3>
                  </div>
                  <div className="text-sm text-slate-300">
                    <Link 
                      href={`/operations/purchase-orders`}
                      className="text-primary-400 hover:text-primary-300 font-medium"
                    >
                      {contractDetail.contract.relatedOrderNumber}
                    </Link>
                    <span className="text-slate-500 ml-2">（点击查看订单详情）</span>
                  </div>
                </div>
              )}

              {/* 合同基本信息 */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <h3 className="text-sm font-medium text-slate-100 mb-3">合同信息</h3>
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <span className="text-slate-400">供应商：</span>
                    <span className="text-slate-100 ml-2">{contractDetail.contract.supplierName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">合同总数：</span>
                    <span className="text-slate-100 ml-2">{contractDetail.contract.totalQty}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">已取货数：</span>
                    <span className="text-slate-100 ml-2">{contractDetail.contract.pickedQty}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">工厂完工数：</span>
                    <span className="text-slate-100 ml-2">{contractDetail.contract.finishedQty || 0}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">合同总额：</span>
                    <span className="text-slate-100 ml-2">{currency(contractDetail.contract.totalAmount)}</span>
                  </div>
                </div>
                {/* SKU / 变体明细 */}
                <div>
                  <span className="text-slate-400 text-sm">SKU / 变体明细：</span>
                  {contractDetail.contract.items && contractDetail.contract.items.length > 0 ? (
                    <div className="mt-2 rounded border border-slate-700 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-800/80">
                          <tr>
                            <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-400">SKU / 品名</th>
                            <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-400">单价</th>
                            <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-400">数量</th>
                            <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-400">已取货</th>
                            <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-400">小计</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {contractDetail.contract.items.map((item) => (
                            <tr key={item.id} className="bg-slate-900/40">
                              <td className="px-3 py-1.5 text-slate-200">
                                <span className="font-medium">{item.sku}</span>
                                {item.skuName && <span className="text-slate-500 ml-1">/ {item.skuName}</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right text-slate-300">{currency(item.unitPrice)}</td>
                              <td className="px-3 py-1.5 text-right text-slate-300">{item.qty}</td>
                              <td className="px-3 py-1.5 text-right text-slate-400">{item.pickedQty}</td>
                              <td className="px-3 py-1.5 text-right text-slate-200">{currency(item.totalAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <span className="text-slate-100 ml-2">{contractDetail.contract.sku}</span>
                  )}
                </div>
              </div>

              {/* 财务信息 */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <h3 className="text-sm font-medium text-slate-100 mb-3 flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  财务状态
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-400">合同总额：</span>
                    <span className="text-slate-100 ml-2">{currency(contractDetail.contract.totalAmount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">已付总额：</span>
                    <span className="text-emerald-300 ml-2">{currency(contractDetail.contract.totalPaid || 0)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">已付定金：</span>
                    <span className="text-slate-100 ml-2">{currency(contractDetail.contract.depositPaid || 0)} / {currency(contractDetail.contract.depositAmount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">还欠金额：</span>
                    <span className="text-amber-200 ml-2">{currency(contractDetail.contract.totalOwed || contractDetail.contract.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* 合同凭证 */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <h3 className="text-sm font-medium text-slate-100 mb-3 flex items-center gap-2">
                  <FileImage className="h-4 w-4" />
                  合同凭证
                </h3>
                {contractDetail.contract.contractVoucher ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {(() => {
                      const vouchers = Array.isArray(contractDetail.contract.contractVoucher)
                        ? contractDetail.contract.contractVoucher
                        : [contractDetail.contract.contractVoucher];
                      return vouchers.map((voucher, index) => {
                        // 处理图片源：如果是纯 base64 字符串，添加 data URL 前缀
                        let imageSrc = voucher;
                        if (typeof voucher === "string") {
                          if (!voucher.startsWith("data:") && !voucher.startsWith("http") && !voucher.startsWith("/")) {
                            // 纯 base64 字符串，添加前缀
                            imageSrc = `data:image/jpeg;base64,${voucher}`;
                          } else {
                            imageSrc = voucher;
                          }
                        }
                        return (
                          <div key={index} className="relative group">
                            <img
                              src={imageSrc}
                              alt={`合同凭证 ${index + 1}`}
                              className="w-full h-32 object-cover rounded-lg border border-slate-700 cursor-pointer hover:border-primary-400 transition-all"
                              onError={(e) => {
                                // 如果图片加载失败，尝试其他格式
                                const target = e.target as HTMLImageElement;
                                if (typeof voucher === "string" && !voucher.startsWith("data:") && !voucher.startsWith("http")) {
                                  target.src = `data:image/png;base64,${voucher}`;
                                }
                              }}
                              onClick={() => {
                                // 打开大图查看
                                const modal = document.createElement("div");
                                modal.className = "fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm";
                                const closeBtn = document.createElement("button");
                                closeBtn.className = "absolute top-4 right-4 text-white text-2xl hover:text-slate-300 z-10 bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90";
                                closeBtn.innerHTML = "✕";
                                closeBtn.onclick = () => modal.remove();
                                modal.onclick = (e) => {
                                  if (e.target === modal) modal.remove();
                                };
                                const img = document.createElement("img");
                                img.src = imageSrc;
                                img.className = "max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl";
                                img.onclick = (e) => e.stopPropagation();
                                modal.appendChild(closeBtn);
                                modal.appendChild(img);
                                document.body.appendChild(modal);
                              }}
                            />
                            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                              {index + 1}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    暂无合同凭证
                  </div>
                )}
              </div>

              {/* 库存分布 */}
              {contractDetail.contract.skuId && (() => {
                const product = products.find((p) => p.sku_id === contractDetail.contract.skuId || (p.id || p.sku) === contractDetail.contract.skuId);
                if (product) {
                  return (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                      <h3 className="text-sm font-medium text-slate-100 mb-3 flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        库存分布
                      </h3>
                      <InventoryDistribution
                        atFactory={(product as any).at_factory || 0}
                        atDomestic={(product as any).at_domestic || 0}
                        inTransit={(product as any).in_transit || 0}
                        unitPrice={contractDetail.contract.unitPrice}
                        size="md"
                        showValue={true}
                      />
                    </div>
                  );
                }
                return null;
              })()}

              {/* 工厂操作 - 始终显示 */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <h3 className="text-sm font-medium text-slate-100 mb-3 flex items-center gap-2">
                  <Factory className="h-4 w-4" />
                  工厂操作
                </h3>
                <div className="flex gap-2 flex-wrap items-center">
                  {(() => {
                    const finishedQty = contractDetail.contract.finishedQty || 0;
                    const totalQty = contractDetail.contract.totalQty || 0;
                    const remainingQty = totalQty - finishedQty;
                    
                    // 调试信息（开发时可见）
                    console.log("工厂操作调试:", { finishedQty, totalQty, remainingQty });
                    
                    if (totalQty === 0) {
                      return (
                        <div className="text-xs text-slate-400">
                          合同数量为 0，无法进行工厂完工操作
                        </div>
                      );
                    }
                    
                    if (remainingQty > 0) {
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFactoryFinished(contractDetail.contract.id);
                          }}
                          className="flex items-center gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-100 hover:bg-blue-500/20 transition-colors"
                        >
                          <Factory className="h-4 w-4" />
                          工厂完工（{remainingQty} 件）
                        </button>
                      );
                    } else {
                      return (
                        <div className="flex items-center gap-2 text-sm text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" />
                          工厂已全部完工（{finishedQty} / {totalQty} 件）
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>

              {/* 拿货单列表 */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <h3 className="text-sm font-medium text-slate-100 mb-3 flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  拿货单列表
                </h3>
                {contractDetail.deliveryOrders.length === 0 ? (
                  <div className="text-center py-4 text-slate-500 text-sm">暂无拿货单</div>
                ) : (
                  <div className="space-y-2">
                    {contractDetail.deliveryOrders.map((order) => {
                      const isPaid = order.tailPaid >= order.tailAmount;
                      return (
                        <div key={order.id} className="rounded border border-slate-800 bg-slate-900/40 p-3 text-sm">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-slate-100">{order.deliveryNumber}</span>
                                <span className="text-xs text-slate-500">数量：{order.qty}</span>
                                {order.domesticTrackingNumber && (
                                  <span className="text-xs text-slate-500">物流单号：{order.domesticTrackingNumber}</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400">
                                尾款：{currency(order.tailAmount)}
                                {isPaid ? (
                                  <span className="text-emerald-300 ml-2">（已付）</span>
                                ) : (
                                  <span className="text-amber-200 ml-2">（待付，到期日：{order.tailDueDate ? formatDate(order.tailDueDate) : "-"}）</span>
                                )}
                              </div>
                            </div>
                            {!isPaid && (
                              <button
                                onClick={() => handlePayment(contractDetail.contract.id, "tail", order.id)}
                                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
                              >
                                支付尾款
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                onClick={() => setDeliveryModal({ contractId: null, qty: "", trackingNumber: "" })}
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
                return (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
                    <div>合同：{contract.contractNumber}</div>
                    <div>剩余数量：{remainingQty}</div>
                  </div>
                );
              })()}
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

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeliveryModal({ contractId: null, qty: "", trackingNumber: "" })}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px"
                >
                  创建拿货单
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
                  ? expenseRequests.find((r) => {
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
