"use client";

import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { Wallet, TrendingUp, TrendingDown, Package, DollarSign, AlertCircle } from "lucide-react";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import type { BankAccount } from "@/lib/finance-store";
import { calculatePrimaryAccountBalance } from "@/lib/finance-store";
import type { Store } from "@/lib/store-store";
import { getPaymentRequests } from "@/lib/payment-request-store";
import { getPendingEntryCount } from "@/lib/pending-entry-store";
import { getProductsFromAPI } from "@/lib/products-store";
import { getFinanceRates, type FinanceRates } from "@/lib/exchange";
import { getCashFlowFromAPI, createCashFlow, type CashFlow } from "@/lib/cash-flow-store";
import { getLegacyPurchaseOrdersFromAPI, type LegacyPurchaseOrder, updateContractPayment } from "@/lib/purchase-contracts-store";
import { getDeliveryOrdersFromAPI, upsertDeliveryOrder } from "@/lib/delivery-orders-store";
import { saveAccounts } from "@/lib/finance-store";

type LegacyCashFlow = {
  id: string;
  date: string;
  type: "income" | "expense";
  amount: number;
  relatedId?: string;
  accountId?: string;
  currency?: string;
};


type Receipt = { id: string; qty: number; tailAmount: number; dueDate: string; createdAt: string };
type PurchaseOrder = LegacyPurchaseOrder;

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatDate = (d: string) => new Date(d).toISOString().slice(0, 10);

const dashboardFetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  return Array.isArray(j) ? j : (j?.data ?? []);
};

const SWR_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  dedupingInterval: 600000,
  keepPreviousData: true,
};

export default function FinanceDashboardPage() {
  const { data: accountsRaw, mutate: mutateAccounts } = useSWR<BankAccount[]>(
    "/api/accounts?page=1&pageSize=500",
    dashboardFetcher,
    SWR_OPTIONS
  );
  const { data: storesRaw } = useSWR<Store[]>(
    "/api/stores",
    dashboardFetcher,
    SWR_OPTIONS
  );
  const { data: productsRaw } = useSWR<Array<{ sku_id: string; name?: string; at_factory?: number; at_domestic?: number; in_transit?: number; cost_price?: number; currency?: string }>>(
    "/api/products",
    dashboardFetcher,
    SWR_OPTIONS
  );
  const { data: cashFlowRaw, mutate: mutateCashFlow } = useSWR<CashFlow[]>(
    "/api/cash-flow?page=1&pageSize=5000",
    dashboardFetcher,
    SWR_OPTIONS
  );
  const { data: purchaseOrdersRaw, mutate: mutateLegacyPO } = useSWR<PurchaseOrder[]>(
    "finance-dashboard-legacy-po",
    getLegacyPurchaseOrdersFromAPI,
    SWR_OPTIONS
  );

  const accounts = accountsRaw ?? [];
  const stores = storesRaw ?? [];
  const products = productsRaw ?? [];
  const purchaseOrders = purchaseOrdersRaw ?? [];
  const cashFlow = useMemo(() => {
    const list = cashFlowRaw ?? [];
    return list.map((f: any) => {
      const rawType = f.type != null ? String(f.type).toLowerCase() : "";
      const rawStatus = f.status ?? f.flowStatus;
      const statusStr = rawStatus != null ? String(rawStatus).toLowerCase() : "pending";
      return {
        ...f,
        type: rawType === "income" || rawType === "expense" || rawType === "transfer" ? rawType : f.type,
        status: statusStr === "confirmed" ? "confirmed" : "pending",
      };
    });
  }, [cashFlowRaw]);

  const [paymentModal, setPaymentModal] = useState<{
    poId: string | null;
    type: "deposit" | "tail" | null;
    receiptId?: string;
    amount: number;
    supplierName: string;
    poNumber: string;
  }>({
    poId: null,
    type: null,
    amount: 0,
    supplierName: "",
    poNumber: ""
  });
  const [pendingEntryCount, setPendingEntryCount] = useState(0);
  const [exchangeRates, setExchangeRates] = useState<FinanceRates | null>(null);

  useEffect(() => {
    getPendingEntryCount().then(setPendingEntryCount).catch(() => setPendingEntryCount(0));
  }, []);

  // 获取汇率数据
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const rates = await getFinanceRates();
        if (rates) {
          setExchangeRates(rates);
          // 汇率数据已通过 console.log 在 getFinanceRates 中打印
        }
      } catch (error) {
        console.error('获取汇率失败:', error);
      }
    };
    
    fetchRates();
    // 优化：禁用自动刷新，改为手动刷新（大幅减少数据库访问）
    // const interval = setInterval(fetchRates, 3600000);
    
    // return () => clearInterval(interval); // 已禁用自动刷新
    return () => {}; // 无需清理
  }, []);

  // 从流水重算账户余额（与账户管理页一致），避免依赖 DB 未更新的 balance 导致看板为 0
  const accountsWithBalance = useMemo(() => {
    if (!accounts.length) return [];
    let list: BankAccount[] = accounts.map((acc) => {
      const hasChildren = accounts.some((a) => a.parentId === acc.id);
      if (acc.accountCategory === "PRIMARY" && hasChildren) {
        return { ...acc, originalBalance: 0, rmbBalance: 0 };
      }
      const initialCapital = acc.initialCapital || 0;
      let balance = initialCapital;
      cashFlow.forEach((flow) => {
        if (flow.status !== "confirmed" || flow.accountId !== acc.id) return;
        balance += Number(flow.amount);
      });
      const rmb = acc.currency === "RMB" || acc.currency === "CNY"
        ? balance
        : balance * (acc.exchangeRate || 1);
      return { ...acc, originalBalance: balance, rmbBalance: rmb };
    });
    list = list.map((acc) => {
      if (acc.accountCategory !== "PRIMARY") return acc;
      const hasChildren = list.some((a) => a.parentId === acc.id);
      if (!hasChildren) return acc;
      const { originalBalance, rmbBalance } = calculatePrimaryAccountBalance(acc, list);
      return { ...acc, originalBalance, rmbBalance };
    });
    return list;
  }, [accounts, cashFlow]);

  const totalAssets = useMemo(() => {
    return accountsWithBalance.reduce((sum, acc) => {
      if (acc.rmbBalance !== undefined && acc.accountCategory !== "PRIMARY") {
        return sum + (acc.rmbBalance || 0);
      }
      if (acc.accountCategory === "PRIMARY" && accountsWithBalance.some((a) => a.parentId === acc.id)) {
        return sum; // 主账户有子账户时已由子账户汇总，不重复加
      }
      const rmbValue = acc.currency === "RMB" || acc.currency === "CNY"
        ? (acc.originalBalance || 0)
        : (acc.originalBalance || 0) * (acc.exchangeRate || 1);
      return sum + rmbValue;
    }, 0);
  }, [accountsWithBalance]);

  // 计算所有待付款项（定金+尾款）的RMB总额
  const totalPendingPayments = useMemo(() => {
    let total = 0;
    purchaseOrders.forEach((po) => {
      // 待付定金
      const unpaidDeposit = po.depositAmount - (po.depositPaid || 0);
      if (unpaidDeposit > 0) {
        total += unpaidDeposit; // 默认RMB
      }
      // 待付尾款
      po.receipts.forEach((receipt) => {
        const isPaid = cashFlow.some(
          (flow) => flow.type === "expense" && flow.relatedId === receipt.id && Math.abs(flow.amount - receipt.tailAmount) < 0.01
        );
        if (!isPaid) {
          total += receipt.tailAmount; // 默认RMB
        }
      });
    });
    return total;
  }, [purchaseOrders, cashFlow]);

  const netAvailableAssets = totalAssets - totalPendingPayments;

  // 计算库存资产总值
  const inventoryAssetValue = useMemo(() => {
    let totalValue = 0;
    
    products.forEach((product) => {
      const atFactory = product.at_factory || 0;
      const atDomestic = product.at_domestic || 0;
      const inTransit = product.in_transit || 0;
      const totalQty = atFactory + atDomestic + inTransit;
      
      if (totalQty > 0 && product.cost_price) {
        // 根据币种转换为RMB（简化处理，实际应该使用汇率）
        const costPrice = product.cost_price;
        const currency = product.currency || "CNY";
        
        // 简单汇率转换（实际应该从账户或配置中获取）
        let exchangeRate = 1;
        if (currency === "USD") exchangeRate = 7.2;
        else if (currency === "HKD") exchangeRate = 0.92;
        else if (currency === "JPY") exchangeRate = 0.048;
        else if (currency === "EUR") exchangeRate = 7.8;
        else if (currency === "GBP") exchangeRate = 9.1;
        
        totalValue += totalQty * costPrice * exchangeRate;
      }
    });
    
    return totalValue;
  }, [products]);

  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const thisMonthFlow = cashFlow.filter((f) => {
    const d = new Date(f.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });
  const thisMonthIncome = thisMonthFlow.filter((f) => f.type === "income").reduce((sum, f) => sum + f.amount, 0);
  const thisMonthExpense = Math.abs(
    thisMonthFlow.filter((f) => f.type === "expense").reduce((sum, f) => sum + f.amount, 0)
  );

  // 支出分类统计（包括付款申请和财务流水）
  const expenseCategoryStats = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    
    // 统计财务流水中的支出分类
    thisMonthFlow
      .filter((f) => f.type === "expense")
      .forEach((f) => {
        const category = (f as any).category || "其他";
        categoryMap[category] = (categoryMap[category] || 0) + Math.abs(f.amount);
      });
    
    // 统计付款申请中的支出分类（已支付的）
    if (typeof window !== "undefined") {
      (async () => {
        try {
          const paymentRequests = await getPaymentRequests();
          if (!Array.isArray(paymentRequests)) return;
          const thisMonth = new Date().getMonth();
          const thisYear = new Date().getFullYear();
          
          paymentRequests
            .filter((r) => {
              if (r.status !== "Paid" || !r.paidAt) return false;
              const d = new Date(r.paidAt);
              return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
            })
            .forEach((r) => {
              const category = r.category || "其他";
              categoryMap[category] = (categoryMap[category] || 0) + r.amount;
            });
        } catch (e) {
          console.error("Failed to load payment requests", e);
        }
      })();
    }
    
    return Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [thisMonthFlow]);

  // 收集所有待付款的采购订单（状态为"待收货"、"部分收货"或"收货完成，待结清"，且有未付款项）
  const pendingPayments = useMemo(() => {
    const pending: Array<{
      poId: string;
      poNumber: string;
      supplierName: string;
      currency: string;
      depositAmount: number;
      tailAmount: number;
      totalAmount: number;
      earliestDueDate: string | null;
      daysUntilDue: number | null;
      storeName: string;
      status: string;
    }> = [];

    purchaseOrders.forEach((po) => {
      // 只处理状态为"待收货"、"部分收货"或"收货完成，待结清"的订单
      if (po.status === "已清款") return;

      const unpaidDeposit = po.depositAmount - (po.depositPaid || 0);
      let unpaidTail = 0;
      let earliestDueDate: string | null = null;

      po.receipts.forEach((receipt) => {
        const isPaid = cashFlow.some(
          (flow) => flow.type === "expense" && flow.relatedId === receipt.id && Math.abs(flow.amount - receipt.tailAmount) < 0.01
        );
        if (!isPaid) {
          unpaidTail += receipt.tailAmount;
          if (!earliestDueDate || new Date(receipt.dueDate) < new Date(earliestDueDate)) {
            earliestDueDate = receipt.dueDate;
          }
        }
      });

      const totalUnpaid = unpaidDeposit + unpaidTail;
      if (totalUnpaid > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntilDue = earliestDueDate
          ? Math.ceil((new Date(earliestDueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        // 尝试关联店铺（通过供应商名称或其他方式，这里暂时使用默认值）
        const storeName = "待关联";

        pending.push({
          poId: po.id,
          poNumber: po.poNumber,
          supplierName: po.supplierName,
          currency: "RMB", // 默认RMB，后续可以从供应商或订单中获取
          depositAmount: unpaidDeposit,
          tailAmount: unpaidTail,
          totalAmount: totalUnpaid,
          earliestDueDate,
          daysUntilDue,
          storeName,
          status: po.status
        });
      }
    });

    return pending.sort((a, b) => {
      if (a.daysUntilDue === null) return 1;
      if (b.daysUntilDue === null) return -1;
      return a.daysUntilDue - b.daysUntilDue;
    });
  }, [purchaseOrders, cashFlow]);

  // 收集所有未付尾款（用于原有显示）
  const unpaidTails = useMemo(() => {
    const tails: Array<{
      poNumber: string;
      supplierName: string;
      amount: number;
      dueDate: string;
      receiptId: string;
      poId: string;
    }> = [];
    purchaseOrders.forEach((po) => {
      po.receipts.forEach((receipt) => {
        const isPaid = cashFlow.some(
          (flow) => flow.type === "expense" && flow.relatedId === receipt.id && Math.abs(flow.amount - receipt.tailAmount) < 0.01
        );
        if (!isPaid) {
          tails.push({
            poNumber: po.poNumber,
            supplierName: po.supplierName,
            amount: receipt.tailAmount,
            dueDate: receipt.dueDate,
            receiptId: receipt.id,
            poId: po.id
          });
        }
      });
    });
    return tails.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [purchaseOrders, cashFlow]);

  // 未付定金
  const unpaidDeposits = useMemo(() => {
    return purchaseOrders
      .map((po) => ({
        poNumber: po.poNumber,
        supplierName: po.supplierName,
        amount: po.depositAmount - (po.depositPaid || 0),
        poId: po.id
      }))
      .filter((d) => d.amount > 0);
  }, [purchaseOrders]);

  // 检查资产待回收（订单已清款但待拿货数量仍不为0）
  const assetRecoveryAlerts = useMemo(() => {
    const alerts: Array<{
      poId: string;
      poNumber: string;
      supplierName: string;
      pendingQuantity: number;
      pendingValue: number;
    }> = [];

    purchaseOrders.forEach((po) => {
      // 检查是否已清款
      const unpaidDeposit = po.depositAmount - (po.depositPaid || 0);
      const allTailsPaid = po.receipts.every((receipt) => {
        return cashFlow.some(
          (flow) => flow.type === "expense" && flow.relatedId === receipt.id && Math.abs(flow.amount - receipt.tailAmount) < 0.01
        );
      });

      const isFullyPaid = unpaidDeposit <= 0 && allTailsPaid && po.status === "已清款";
      const pendingQty = Math.max(0, po.quantity - (po.receivedQty || 0));

      if (isFullyPaid && pendingQty > 0) {
        alerts.push({
          poId: po.id,
          poNumber: po.poNumber,
          supplierName: po.supplierName,
          pendingQuantity: pendingQty,
          pendingValue: pendingQty * po.unitPrice
        });
      }
    });

    return alerts;
  }, [purchaseOrders, cashFlow]);

  // 资产待回收提醒汇总
  const totalAssetRecoveryValue = useMemo(() => {
    return assetRecoveryAlerts.reduce((sum, alert) => sum + alert.pendingValue, 0);
  }, [assetRecoveryAlerts]);

  // 处理确认付款
  const handleConfirmPayment = (poId: string, type: "deposit" | "tail", receiptId?: string) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;

    let amount = 0;
    if (type === "deposit") {
      amount = po.depositAmount - (po.depositPaid || 0);
    } else if (type === "tail" && receiptId) {
      const receipt = po.receipts.find((r) => r.id === receiptId);
      if (receipt) {
        amount = receipt.tailAmount;
      }
    }

    if (amount <= 0) {
      toast.error("该款项已付清");
      return;
    }

    setPaymentModal({
      poId,
      type,
      receiptId,
      amount,
      supplierName: po.supplierName,
      poNumber: po.poNumber
    });
  };

  // 保存付款并更新采购订单状态
  const handleSavePayment = async (accountId: string, date: string, remark: string) => {
    if (!paymentModal.poId || !paymentModal.type) return;

    const po = purchaseOrders.find((p) => p.id === paymentModal.poId);
    if (!po) return;

    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      toast.error("请选择账户");
      return;
    }

    // 创建支出流水
    const newFlow: CashFlow = {
      id: crypto.randomUUID(),
      date,
      summary: `${paymentModal.type === "deposit" ? "定金" : "尾款"}支付 - ${paymentModal.poNumber}`,
      category: "采购付款",
      type: "expense",
      amount: -Math.abs(paymentModal.amount),
      relatedId: paymentModal.type === "tail" ? paymentModal.receiptId : (paymentModal.poId || ""),
      accountId,
      accountName: account.name || account.accountNumber,
      currency: account.currency,
      createdAt: new Date().toISOString()
    };

    try {
      await createCashFlow(newFlow);

      // 更新合同/发货单（API）
      const poId = paymentModal.poId!;
      if (paymentModal.type === "deposit") {
        await updateContractPayment(poId, paymentModal.amount, "deposit");
      } else if (paymentModal.type === "tail" && paymentModal.receiptId) {
        const dos = await getDeliveryOrdersFromAPI(poId);
        const doToUpdate = dos.find((o) => o.id === paymentModal.receiptId);
        if (doToUpdate) {
          await upsertDeliveryOrder({
            ...doToUpdate,
            tailPaid: (doToUpdate.tailPaid || 0) + paymentModal.amount
          });
        }
        await updateContractPayment(poId, paymentModal.amount, "tail");
      }

      // 更新账户余额（API）
      const updatedAccounts = accounts.map((acc) => {
        if (acc.id === accountId) {
          const newBalance = (acc.originalBalance || 0) + newFlow.amount;
          return {
            ...acc,
            originalBalance: newBalance,
            rmbBalance: acc.currency === "RMB" ? newBalance : newBalance * (acc.exchangeRate || 1)
          };
        }
        return acc;
      });
      await saveAccounts(updatedAccounts);

      setPaymentModal({ poId: null, type: null, amount: 0, supplierName: "", poNumber: "" });
      toast.success("付款成功！");
      mutateCashFlow();
      mutateLegacyPO();
      mutateAccounts();
    } catch (e) {
      console.error("付款记录保存失败", e);
      toast.error("付款记录保存失败，请重试");
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">财务看板</h1>
          <p className="mt-1 text-sm text-slate-400">
            汇总总资产、本月收支与待付款提醒，帮助你掌握 TikTok Shop 生意的现金流节奏。
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/finance/accounts"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            账户管理
          </Link>
          <Link
            href="/finance/cash-flow"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            收支明细
          </Link>
        </div>
      </header>

      {/* 待入账任务提醒 */}
      {pendingEntryCount > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <h2 className="text-sm font-semibold text-amber-200">待入账任务</h2>
              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300">
                {pendingEntryCount} 笔
              </span>
            </div>
            <Link
              href="/finance/reconciliation"
              className="px-3 py-1.5 rounded-md border border-amber-500/40 bg-amber-500/20 text-xs text-amber-100 hover:bg-amber-500/30 transition"
              onClick={() => {
                // 切换到待入账标签
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("reconciliationActiveTab", "PendingEntry");
                }
              }}
            >
              前往处理 →
            </Link>
          </div>
          <p className="text-xs text-amber-300/80 mt-2">
            审批中心已批准 {pendingEntryCount} 笔账单/付款申请，等待财务人员处理入账
          </p>
        </section>
      )}

      {/* 资产待回收提醒 */}
      {assetRecoveryAlerts.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <h2 className="text-sm font-semibold text-amber-200">资产待回收提醒</h2>
            </div>
            <Link
              href="/supply-chain/factories"
              className="text-xs text-amber-300 hover:text-amber-200 underline"
            >
              查看工厂管理 →
            </Link>
          </div>
          <p className="text-xs text-amber-300/80 mb-3">
            发现 {assetRecoveryAlerts.length} 笔订单已清款但仍有待拿货数量，待回收资产总额：{currency(totalAssetRecoveryValue)}
          </p>
          <div className="space-y-2">
            {assetRecoveryAlerts.slice(0, 3).map((alert) => (
              <div key={alert.poId} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-amber-200">{alert.supplierName}</div>
                    <div className="text-xs text-amber-300/70">{alert.poNumber}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-amber-200">
                      待拿货：{alert.pendingQuantity} 件
                    </div>
                    <div className="text-xs text-amber-300/70">
                      货值：{currency(alert.pendingValue)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {assetRecoveryAlerts.length > 3 && (
              <div className="text-xs text-amber-300/70 text-center pt-2">
                还有 {assetRecoveryAlerts.length - 3} 笔待回收订单，前往{" "}
                <Link href="/supply-chain/factories" className="text-amber-200 hover:underline">
                  工厂管理
                </Link>{" "}
                查看详情
              </div>
            )}
          </div>
        </section>
      )}

      {/* 统计面板 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">当前总资产</p>
              <p className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(totalAssets)}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">所有账户余额加总</p>
            </div>
            <Wallet className="h-8 w-8 text-emerald-300 opacity-50" />
          </div>
        </div>

        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">净可用资产</p>
              <p className="text-2xl font-bold text-primary-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(netAvailableAssets)}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">总资产 - 待付款项</p>
            </div>
            <DollarSign className="h-8 w-8 text-primary-300 opacity-50" />
          </div>
        </div>

        {/* 拿货未付款金额（待付定金 + 尾款） */}
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #9a3412 0%, #0f172a 100%)",
            border: "1px solid rgba(248, 250, 252, 0.12)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-300 mb-1">拿货未付款金额</p>
              <p
                className="text-2xl font-bold text-amber-200"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {currency(totalPendingPayments)}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">包含待付定金 + 待付尾款</p>
            </div>
            <AlertCircle className="h-8 w-8 text-amber-300 opacity-60" />
          </div>
        </div>

        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #581c87 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">存货资产总值</p>
              <p className="text-2xl font-bold text-purple-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(inventoryAssetValue)}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">工厂现货+国内待发+海运中</p>
            </div>
            <Package className="h-8 w-8 text-purple-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">本月总收入</p>
              <p className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(thisMonthIncome)}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">来自收支明细记录</p>
            </div>
            <TrendingUp className="h-8 w-8 text-emerald-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #7f1d1d 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">本月总支出</p>
              <p className="text-2xl font-bold text-rose-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(thisMonthExpense)}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">采购货款、广告费等</p>
            </div>
            <TrendingDown className="h-8 w-8 text-rose-300 opacity-50" />
          </div>
        </div>
      </div>

      {/* 工厂待付明细表格 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-4 text-sm font-medium text-slate-100">工厂待付明细</h2>
        {pendingPayments.length === 0 ? (
          <div className="text-sm text-slate-500">暂无待付款项</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">工厂名称</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">币种</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">待付金额</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">关联店铺</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-400">倒计时（天）</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">状态</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-400">操作</th>
                </tr>
              </thead>
              <tbody>
                {pendingPayments.map((payment) => {
                  const isOverdue = payment.daysUntilDue !== null && payment.daysUntilDue < 0;
                  const isUrgent = payment.daysUntilDue !== null && payment.daysUntilDue >= 0 && payment.daysUntilDue <= 3;
                  return (
                    <tr key={payment.poId} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-3 text-slate-200">{payment.supplierName}</td>
                      <td className="px-3 py-3 text-slate-400">{payment.currency}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-100">
                        {currency(payment.totalAmount, payment.currency)}
                      </td>
                      <td className="px-3 py-3 text-slate-400">{payment.storeName}</td>
                      <td className="px-3 py-3 text-center">
                        {payment.daysUntilDue !== null ? (
                          <span
                            className={`text-xs font-medium ${
                              isOverdue
                                ? "text-rose-400"
                                : isUrgent
                                  ? "text-amber-400"
                                  : "text-slate-400"
                            }`}
                          >
                            {isOverdue ? `逾期 ${Math.abs(payment.daysUntilDue)} 天` : `${payment.daysUntilDue} 天`}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-400 text-xs">{payment.status}</td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => {
                              if (payment.depositAmount > 0) {
                                handleConfirmPayment(payment.poId, "deposit");
                              } else if (payment.tailAmount > 0) {
                                // 找到第一个未付的尾款
                                const po = purchaseOrders.find((p) => p.id === payment.poId);
                                const unpaidReceipt = po?.receipts.find((r) => {
                                  return !cashFlow.some(
                                    (flow) => flow.type === "expense" && flow.relatedId === r.id && Math.abs(flow.amount - r.tailAmount) < 0.01
                                  );
                                });
                                if (unpaidReceipt) {
                                  handleConfirmPayment(payment.poId, "tail", unpaidReceipt.id);
                                }
                              }
                            }}
                            className="rounded-md bg-primary-500 px-2 py-1 text-xs font-medium text-white hover:bg-primary-600"
                          >
                            确认付款
                          </button>
                          <Link
                            href={`/supply-chain/factories?supplier=${payment.supplierName}`}
                            className="rounded-md bg-slate-700 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600"
                          >
                            工厂明细
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-100">待付尾款提醒</h2>
          {unpaidTails.length === 0 ? (
            <div className="text-sm text-slate-500">暂无待付尾款</div>
          ) : (
            <div className="space-y-2">
              {unpaidTails.slice(0, 5).map((tail) => {
                const dueDate = new Date(tail.dueDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                const isOverdue = daysUntilDue < 0;
                const isUrgent = daysUntilDue >= 0 && daysUntilDue <= 3;
                return (
                  <div
                    key={tail.receiptId}
                    className={`rounded-lg border p-3 ${
                      isOverdue
                        ? "border-rose-500/40 bg-rose-500/10"
                        : isUrgent
                          ? "border-amber-500/40 bg-amber-500/10"
                          : "border-slate-800 bg-slate-900/40"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-100">{tail.supplierName}</div>
                        <div className="text-xs text-slate-400">{tail.poNumber}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-100">{currency(tail.amount)}</div>
                        <div
                          className={`text-xs ${
                            isOverdue ? "text-rose-300" : isUrgent ? "text-amber-300" : "text-slate-500"
                          }`}
                        >
                          {isOverdue
                            ? `已逾期 ${Math.abs(daysUntilDue)} 天`
                            : isUrgent
                              ? `${daysUntilDue} 天后到期`
                              : `${daysUntilDue} 天后到期`}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">到期日：{formatDate(tail.dueDate)}</div>
                  </div>
                );
              })}
              {unpaidTails.length > 5 && (
                <div className="text-xs text-slate-500 text-center pt-2">
                  还有 {unpaidTails.length - 5} 笔待付尾款，前往{" "}
                  <Link href="/purchase-orders" className="text-primary-300 hover:underline">
                    采购下单
                  </Link>{" "}
                  查看
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-100">待付定金</h2>
          {unpaidDeposits.length === 0 ? (
            <div className="text-sm text-slate-500">暂无待付定金</div>
          ) : (
            <div className="space-y-2">
              {unpaidDeposits.slice(0, 5).map((dep) => (
                <div key={dep.poId} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-100">{dep.supplierName}</div>
                      <div className="text-xs text-slate-400">{dep.poNumber}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-100">{currency(dep.amount)}</div>
                    </div>
                  </div>
                </div>
              ))}
              {unpaidDeposits.length > 5 && (
                <div className="text-xs text-slate-500 text-center pt-2">
                  还有 {unpaidDeposits.length - 5} 笔待付定金
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 付款确认弹窗 */}
      {paymentModal.poId && paymentModal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-100">确认付款</h3>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-slate-400">采购单号</div>
                <div className="text-slate-200">{paymentModal.poNumber}</div>
              </div>
              <div>
                <div className="text-sm text-slate-400">供应商</div>
                <div className="text-slate-200">{paymentModal.supplierName}</div>
              </div>
              <div>
                <div className="text-sm text-slate-400">付款类型</div>
                <div className="text-slate-200">{paymentModal.type === "deposit" ? "定金" : "尾款"}</div>
              </div>
              <div>
                <div className="text-sm text-slate-400">付款金额</div>
                <div className="text-xl font-semibold text-emerald-300">{currency(paymentModal.amount)}</div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">选择账户</label>
                <select
                  id="payment-account-select"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency}) - {currency(acc.rmbBalance || 0)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">付款日期</label>
                <input
                  id="payment-date-input"
                  type="date"
                  lang="zh-CN"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">备注</label>
                <input
                  id="payment-remark-input"
                  type="text"
                  placeholder="付款备注"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  const accountSelect = document.getElementById("payment-account-select") as HTMLSelectElement;
                  const dateInput = document.getElementById("payment-date-input") as HTMLInputElement;
                  const remarkInput = document.getElementById("payment-remark-input") as HTMLInputElement;
                  if (accountSelect && dateInput) {
                    handleSavePayment(accountSelect.value, dateInput.value, remarkInput?.value || "");
                  }
                }}
                className="flex-1 rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                确认付款
              </button>
              <button
                onClick={() => setPaymentModal({ poId: null, type: null, amount: 0, supplierName: "", poNumber: "" })}
                className="flex-1 rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 支出分类统计 */}
      {expenseCategoryStats.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-4 text-sm font-medium text-slate-100">本月支出分类统计</h2>
          <div className="space-y-3">
            {expenseCategoryStats.map((item, index) => {
              const total = expenseCategoryStats.reduce((sum, i) => sum + i.value, 0);
              const percentage = ((item.value / total) * 100).toFixed(1);
              const colors = ["bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-yellow-500", "bg-lime-500", "bg-emerald-500", "bg-cyan-500", "bg-blue-500"];
              return (
                <div key={item.name} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className={`w-3 h-3 rounded ${colors[index % colors.length]}`}></div>
                    <span className="text-sm text-slate-300">{item.name}</span>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colors[index % colors.length]} transition-all`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="text-right min-w-[100px]">
                    <span className="text-sm font-medium text-slate-100">{currency(item.value)}</span>
                    <span className="text-xs text-slate-400 ml-2">{percentage}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section> 
      )}

    </div> 
  ); 
}
