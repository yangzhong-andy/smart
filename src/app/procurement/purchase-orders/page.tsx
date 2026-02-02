"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import Link from "next/link";
import {
  getPurchaseContractsFromAPI,
  upsertPurchaseContract,
  type PurchaseContract
} from "@/lib/purchase-contracts-store";
import {
  getPurchaseOrderById,
  linkPurchaseContract,
  type PurchaseOrder
} from "@/lib/purchase-orders-store";
import {
  getDeliveryOrdersFromAPI,
  createDeliveryOrder,
  type DeliveryOrder
} from "@/lib/delivery-orders-store";
import { createPendingInboundFromDeliveryOrder } from "@/lib/pending-inbound-store";
import { getExpenseRequests, createExpenseRequest, type ExpenseRequest } from "@/lib/expense-income-request-store";
import { Package, Plus, Eye, Truck, Wallet, ChevronRight, CheckCircle2, ArrowRight, XCircle, FileImage, Search, X, Download, TrendingUp, DollarSign, Coins, Factory } from "lucide-react";
import ImageUploader from "@/components/ImageUploader";
import InventoryDistribution from "@/components/InventoryDistribution";
import { getProductsFromAPI, upsertProduct, type Product as ProductType } from "@/lib/products-store";
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

// 兼容新旧产品数据结构
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
};

const PRODUCTS_KEY = "products";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatDate = (d: string) => new Date(d).toISOString().slice(0, 10);

export default function PurchaseOrdersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [contracts, setContracts] = useState<PurchaseContract[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; originalBalance: number; balance?: number; currency: string }>>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
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
    productId: "",
    sku: "",
    unitPrice: "",
    quantity: "",
    deliveryDate: "",
    contractVoucher: "" as string | string[]
  });
  
  // 搜索和筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  // 加载支出申请数据
  useEffect(() => {
    if (typeof window === "undefined") return;
    getExpenseRequests().then(setExpenseRequests);
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

  // 根据订单信息自动填充表单
  useEffect(() => {
    if (sourceOrder && products.length > 0 && suppliers.length > 0) {
      const product = products.find((p) => p.sku_id === sourceOrder.skuId);
      const productId = product?.sku_id || "";
      const productSku = product?.sku_id || sourceOrder.sku || "";
      const productName = product?.name || sourceOrder.productName || "";
      const productCost = product?.cost_price || 0;
      
      // 尝试找到产品的供应商
      let supplierId = "";
      if (product?.factory_id) {
        const supplier = suppliers.find((s) => s.id === product.factory_id);
        if (supplier) {
          supplierId = supplier.id;
        }
      }
      
      // 如果没找到，使用第一个供应商
      if (!supplierId && suppliers.length > 0) {
        supplierId = suppliers[0].id;
      }
      
      setForm((f) => ({
        ...f,
        productId,
        supplierId,
        sku: `${productSku} / ${productName}`,
        unitPrice: productCost > 0 ? String(productCost) : "",
        quantity: String(sourceOrder.quantity)
      }));
    }
  }, [sourceOrder, products, suppliers]);

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

  // Load products from API
  useEffect(() => {
    if (typeof window === "undefined") return;
    getProductsFromAPI().then((parsed) => {
      const normalizedProducts: Product[] = parsed.map((p: any) => {
        if (p.sku_id) {
          return {
            ...p,
            id: p.sku_id,
            sku: p.sku_id,
            name: p.name,
            cost: p.cost_price,
            primarySupplierId: p.factory_id,
            imageUrl: p.main_image
          };
        }
        return p;
      });
      setProducts(normalizedProducts);
    }).catch((e) => console.error("Failed to load products", e));
  }, []);

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

  // Load contracts and delivery orders
  useEffect(() => {
    (async () => {
      const [contRes, doRes] = await Promise.all([
        getPurchaseContractsFromAPI(),
        getDeliveryOrdersFromAPI()
      ]);
      setContracts(contRes);
      setDeliveryOrders(doRes);
    })();
  }, []);

  const selectedSupplier = useMemo(() => {
    const product = products.find((p) => (p.id || p.sku_id) === form.productId);
    const fromProductSupplier = product?.primarySupplierId || product?.factory_id;
    const supplierId = form.supplierId || fromProductSupplier;
    return suppliers.find((s) => s.id === supplierId) || suppliers[0];
  }, [form.supplierId, products, form.productId, suppliers]);

  const selectedProduct = useMemo(() => {
    return products.find((p) => (p.id || p.sku_id) === form.productId);
  }, [products, form.productId]);

  const totalAmount = useMemo(() => {
    const price = form.unitPrice ? Number(form.unitPrice) : selectedProduct?.cost ?? 0;
    const qty = Number(form.quantity);
    if (Number.isNaN(price) || Number.isNaN(qty)) return 0;
    return price * qty;
  }, [form.unitPrice, form.quantity, selectedProduct]);

  const depositPreview = useMemo(() => {
    if (!selectedSupplier) return 0;
    return (totalAmount * selectedSupplier.depositRate) / 100;
  }, [selectedSupplier, totalAmount]);

  // 创建新合同（母单）
  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedSupplier) {
      toast.error("请先在供应商库新增供应商后再创建采购合同", { icon: "⚠️" });
      return;
    }
    const productCost = selectedProduct?.cost ?? selectedProduct?.cost_price ?? 0;
    const price = form.unitPrice ? Number(form.unitPrice) : productCost;
    const qty = Number(form.quantity);
    const skuName = selectedProduct?.name ?? form.sku.trim();
    const skuCode = selectedProduct?.sku ?? selectedProduct?.sku_id ?? form.sku.trim();
    if (!skuName || !skuCode) {
      toast.error("请输入或选择 SKU", { icon: "⚠️" });
      return;
    }
    if (Number.isNaN(price) || Number.isNaN(qty) || price <= 0 || qty <= 0) {
      toast.error("单价与数量需为大于 0 的数字", { icon: "⚠️" });
      return;
    }
    // 验证合同凭证（必填）
    if (!form.contractVoucher || (Array.isArray(form.contractVoucher) && form.contractVoucher.length === 0) || (typeof form.contractVoucher === "string" && form.contractVoucher.trim() === "")) {
      toast.error("请上传合同凭证", { icon: "⚠️" });
      return;
    }
    const total = price * qty;
    const depositAmount = (total * selectedSupplier.depositRate) / 100;
    const newContract: PurchaseContract = {
      id: crypto.randomUUID(),
      contractNumber: `PC-${Date.now()}`,
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      sku: `${skuCode} / ${skuName}`,
      skuId: selectedProduct?.id || selectedProduct?.sku_id,
      unitPrice: price,
      totalQty: qty,
      pickedQty: 0,
      totalAmount: total,
      depositRate: selectedSupplier.depositRate,
      depositAmount,
      depositPaid: 0,
      tailPeriodDays: selectedSupplier.tailPeriodDays,
      deliveryDate: form.deliveryDate || undefined,
      status: "待发货",
      contractVoucher: form.contractVoucher,
      totalPaid: 0,
      totalOwed: total,
      relatedOrderId: sourceOrder?.id,
      relatedOrderNumber: sourceOrder?.orderNumber,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      await upsertPurchaseContract(newContract);
    } catch (err) {
      console.error("创建合同失败", err);
      toast.error("创建失败，请重试");
      return;
    }
    setContracts((prev) => [...prev, newContract]);
    
    // 如果是从采购订单创建的，自动关联订单
    if (sourceOrder) {
      const linked = await linkPurchaseContract(
        sourceOrder.id,
        newContract.id,
        newContract.contractNumber
      );
      if (linked) {
        toast.success("采购合同创建成功，已自动关联采购订单", { icon: "✅" });
      } else {
        toast.success("采购合同创建成功", { icon: "✅" });
      }
      setSourceOrder(null);
    } else {
      toast.success("采购合同创建成功", { icon: "✅" });
    }
    
    setForm((f) => ({ ...f, sku: "", unitPrice: "", quantity: "", deliveryDate: "", contractVoucher: "" }));
    setIsCreateOpen(false);
  };

  // 打开详情模态框
  const openDetailModal = (contractId: string) => {
    setDetailModal({ contractId });
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

    // 刷新合同列表
    const { getPurchaseContractsFromAPI } = await import("@/lib/purchase-contracts-store");
    const updated = await getPurchaseContractsFromAPI();
    setContracts(updated);

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
      setContracts((prev) => prev.map((c) => (c.id === contract.id ? contract : c)));

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
        const doRes = await getDeliveryOrdersFromAPI();
        setDeliveryOrders(doRes);
      }
    }
    contract.totalPaid = (contract.totalPaid || 0) + amount;
    contract.totalOwed = contract.totalAmount - contract.totalPaid;
    if (contract.totalPaid >= contract.totalAmount) {
      contract.status = "已结清";
    }
    await upsertPurchaseContract(contract);
    setContracts((prev) => prev.map((c) => (c.id === contract.id ? contract : c)));

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
    setContracts((prev) => prev.map((c) => (c.id === contract.id ? contract : c)));
    
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
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">财务状态</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {filteredContracts.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
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
                      <div className="text-slate-100">{contract.sku}</div>
                      <div className="text-[11px] text-slate-500">单价 {currency(contract.unitPrice)}</div>
                      <div className="text-[11px] text-slate-500">合同总数 {contract.totalQty}</div>
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
                  <span className="text-slate-300">SKU（商品库）</span>
                  <select
                    value={form.productId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const prod = products.find((p) => (p.id || p.sku_id) === pid);
                      if (prod) {
                        const productId = prod.id || prod.sku_id || "";
                        const productSku = prod.sku || prod.sku_id || "";
                        const productName = prod.name || "";
                        const productCost = prod.cost ?? prod.cost_price ?? 0;
                        const productSupplierId = prod.primarySupplierId || prod.factory_id || "";
                        setForm((f) => ({
                          ...f,
                          productId: productId,
                          supplierId: productSupplierId || f.supplierId,
                          unitPrice: String(productCost),
                          sku: `${productSku} / ${productName}`
                        }));
                      } else {
                        setForm((f) => ({
                          ...f,
                          productId: "",
                          unitPrice: f.unitPrice,
                          sku: f.sku
                        }));
                      }
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  >
                    <option value="">手动输入 SKU</option>
                    {products.map((p) => {
                      const productId = p.id || p.sku_id || "";
                      const productSku = p.sku || p.sku_id || "";
                      const productName = p.name || "";
                      const productCost = p.cost ?? p.cost_price ?? 0;
                      return (
                        <option key={productId} value={productId}>
                          {productSku} / {productName}（成本 ¥{productCost.toFixed(2)}）
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">SKU 名称（若未选商品）</span>
                  <input
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="未选商品时手动输入"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">供应商</span>
                  <select
                    value={form.supplierId || selectedSupplier?.id || ""}
                    onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    required
                  >
                    <option value="" disabled>
                      请选择
                    </option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}（定金 {s.depositRate}%，账期 {s.tailPeriodDays} 天）
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">单价 (元)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.unitPrice || (selectedProduct ? String(selectedProduct.cost ?? selectedProduct.cost_price ?? 0) : "")}
                    onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    required
                  />
                </label>
                <label className="space-y-1 col-span-2">
                  <span className="text-slate-300">合同总数</span>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    required
                  />
                </label>
                <label className="space-y-1 col-span-2">
                  <span className="text-slate-300">交货日期</span>
                  <input
                    type="date"
                    value={form.deliveryDate}
                    onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="选择交货日期"
                  />
                  <p className="text-xs text-slate-500 mt-1">用于跟进生产进度，建议设置</p>
                </label>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200">
                <div className="flex flex-wrap items-center gap-4">
                  <div>预计总额：{currency(totalAmount)}</div>
                  <div>
                    定金比例：{selectedSupplier ? selectedSupplier.depositRate : "--"}%
                  </div>
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
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-400">供应商：</span>
                    <span className="text-slate-100 ml-2">{contractDetail.contract.supplierName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">SKU：</span>
                    <span className="text-slate-100 ml-2">{contractDetail.contract.sku}</span>
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
                    <span className="text-slate-400">单价：</span>
                    <span className="text-slate-100 ml-2">{currency(contractDetail.contract.unitPrice)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">合同总额：</span>
                    <span className="text-slate-100 ml-2">{currency(contractDetail.contract.totalAmount)}</span>
                  </div>
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
