"use client";

import React from "react";
import { useState, useEffect, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { FileText, Plus, Search, Eye, TrendingUp, Zap, Wallet } from "lucide-react";
import { PageHeader, ActionButton, StatCard, EmptyState } from "@/components/ui";
import { getMonthlyBills, saveMonthlyBills, type MonthlyBill, type BillStatus, type BillType } from "@/lib/reconciliation-store";
import { formatCurrency } from "@/lib/currency-utils";
import Link from "next/link";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { getDeliveryOrdersFromAPI } from "@/lib/delivery-orders-store";
import { getPurchaseContractsFromAPI } from "@/lib/purchase-contracts-store";
import { Pagination, usePaginationState, paginate } from "@/components/Pagination";

const formatDate = (dateString: string) => {
  try {
    return new Date(dateString).toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

export default function MonthlyBillsPage() {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterType, setFilterType] = useState<BillType | "all">("all");
  const { page: pgPage, pageSize: pgPageSize, setPage: setPgPage, setPageSize: setPgPageSize } = usePaginationState(20);
  const [filterStatus, setFilterStatus] = useState<BillStatus | "all">("all");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [selectedBill, setSelectedBill] = useState<MonthlyBill | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [billDetails, setBillDetails] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [generatingFromDelivery, setGeneratingFromDelivery] = useState(false);
  const [includePaid, setIncludePaid] = useState(false);

  // 使用 SWR 获取数据
  const fetcher = async () => {
    if (typeof window === "undefined") return [];
    return await getMonthlyBills();
  };
  const { data: billsData, mutate: mutateBills } = useSWR("monthly-bills", fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 优化：增加到10分钟内去重
  });
  const bills: MonthlyBill[] = Array.isArray(billsData) ? billsData : [];

  // 根据拿货单批量生成月账单（供已有拿货单但无月账单时使用）
  const handleGenerateFromDelivery = async () => {
    if (generatingFromDelivery) return;
    setGeneratingFromDelivery(true);
    const t = toast.loading("正在根据拿货单生成月账单…");
    try {
      const res = await fetch("/api/monthly-bills/ensure-from-delivery/batch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "生成失败", { id: t });
        return;
      }
      toast.success(data.message || "月账单已生成", { id: t });
      if (data.created > 0 || data.updated > 0) {
        mutateBills();
      }
    } catch (e) {
      toast.error("请求失败，请稍后重试", { id: t });
    } finally {
      setGeneratingFromDelivery(false);
    }
  };

  // 统计信息
  const stats = useMemo(() => {
    if (!Array.isArray(bills)) {
      return {
        totalBills: 0,
        totalAmount: 0,
        pendingBills: 0,
        approvedBills: 0,
        paidBills: 0,
        monthlyStats: new Map<string, { count: number; amount: number }>()
      };
    }
    const totalBills = bills.length;
    // 按币种分组统计
    const totalByCurrency: Record<string, number> = {};
    const totalPayableByCurrency: Record<string, number> = {};
    const paidByCurrency: Record<string, number> = {};
    const paidPayableByCurrency: Record<string, number> = {};
    bills.forEach((b) => {
      const cur = b.currency || "CNY";
      const isPayable = b.billCategory === "Payable";
      const amt = Number(b.totalAmount || 0);
      totalByCurrency[cur] = (totalByCurrency[cur] || 0) + amt;
      if (isPayable) { totalPayableByCurrency[cur] = (totalPayableByCurrency[cur] || 0) + amt; }
      if (b.status === "Paid") {
        paidByCurrency[cur] = (paidByCurrency[cur] || 0) + amt;
        if (isPayable) { paidPayableByCurrency[cur] = (paidPayableByCurrency[cur] || 0) + amt; }
      }
    });
    const pendingBills = bills.filter((b) => b.billCategory === "Payable" && (b.status === "Pending_Approval" || b.status === "Draft")).length;
    const approvedBills = bills.filter((b) => b.status === "Approved").length;
    const paidBills = bills.filter((b) => b.status === "Paid").length;

    // 按月份统计
    const monthlyStats = new Map<string, { count: number; amount: number }>();
    bills.forEach((bill) => {
      const month = bill.month;
      if (!monthlyStats.has(month)) {
        monthlyStats.set(month, { count: 0, amount: 0 });
      }
      const stat = monthlyStats.get(month)!;
      stat.count++;
      stat.amount += Number(bill.totalAmount || 0);
    });

    return {
      totalBills,
      totalByCurrency,
      paidByCurrency,
      totalPayableByCurrency,
      paidPayableByCurrency,
      pendingBills,
      approvedBills,
      paidBills,
      monthlyStats: Array.from(monthlyStats.entries())
        .map(([month, stat]) => ({ month, ...stat }))
        .sort((a, b) => b.month.localeCompare(a.month))
    };
  }, [bills]);

  // 筛选账单
  const filteredBills = useMemo(() => {
    let result = bills;

    // 按关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(
        (b) =>
          b.supplierName?.toLowerCase().includes(keyword) ||
          b.agencyName?.toLowerCase().includes(keyword) ||
          b.month.includes(keyword)
      );
    }

    // 按类型筛选
    if (filterType !== "all") {
      result = result.filter((b) => b.billType === filterType);
    }

    // 按状态筛选
    if (filterStatus !== "all") {
      result = result.filter((b) => b.status === filterStatus);
    }

    // 按月份筛选
    if (filterMonth) {
      result = result.filter((b) => b.month === filterMonth);
    }

    return result.sort((a, b) => {
      // 按月份和创建时间倒序
      if (a.month !== b.month) {
        return b.month.localeCompare(a.month);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [bills, searchKeyword, filterType, filterStatus, filterMonth]);

  const handleViewDetail = (bill: MonthlyBill) => {
    setSelectedBill(bill);
    setIsDetailModalOpen(true);
    loadBillDetails(bill);
  };

  const loadBillDetails = async (bill: MonthlyBill) => {
    setLoadingDetails(true);
    setBillDetails([]);
    try {
      if (bill.billType === "物流") {
        const res = await fetch("/api/logistics-cost?pageSize=9999");
        const data = await res.json();
        const allCosts = Array.isArray(data?.data) ? data.data : [];
        const costs = allCosts.filter((c: any) => {
          const chName = c.logisticsChannel?.name || c.logisticsChannel?.channelName || "";
          // 匹配同一个渠道（渠道名在备注里）
          if (!chName || !(bill.notes || "").includes(chName)) return false;
          // 匹配月份：优先用出库发货日期
          const shippedDate = c.outboundBatch?.shippedDate;
          const costMonth = shippedDate 
            ? `${new Date(shippedDate).getFullYear()}-${String(new Date(shippedDate).getMonth() + 1).padStart(2, "0")}`
            : c.dueDate ? c.dueDate.slice(0, 7) : c.createdAt?.slice(0, 7) || "";
          return costMonth === bill.month;
        });
        setBillDetails(costs);
      } else if (bill.billType === "工厂订单" && bill.supplierId) {
        const [ordersRes, contractsRes] = await Promise.all([
          fetch("/api/delivery-orders?pageSize=9999"),
          fetch("/api/purchase-contracts?pageSize=500"),
        ]);
        const ordersData = await ordersRes.json();
        const contractsData = await contractsRes.json();
        const allOrders = Array.isArray(ordersData?.data) ? ordersData.data : [];
        const allContracts = Array.isArray(contractsData?.data) ? contractsData.data : [];
        const supplierContractIds = new Set(
          allContracts.filter((c: any) => c.supplierId === bill.supplierId).map((c: any) => c.id)
        );
        // 获取合同SKU单价
        const contractSkuPrices: Record<string, Record<string, number>> = {};
        for (const c of allContracts) {
          if (supplierContractIds.has(c.id)) {
            try {
              const itemsRes = await fetch(`/api/purchase-contracts/${c.id}`);
              const itemsData = await itemsRes.json();
              const items = itemsData?.items || [];
              const priceMap: Record<string, { price: number; sku: string }> = {};
              if (Array.isArray(items)) {
                items.forEach((it: any) => {
                  const itemId = it.id || it.skuId || "";
                  priceMap[itemId] = {
                    price: Number(it.unitPrice || it.price || 0),
                    sku: it.sku || it.productSku || itemId.slice(0, 12),
                  };
                });
              }
              contractSkuPrices[c.id] = priceMap;
            } catch {}
          }
        }
        const orders = allOrders.filter((o: any) => {
          const m = (o.shippedDate || o.createdAt || "").slice(0, 7);
          return m === bill.month && supplierContractIds.has(o.contractId);
        }).map((o: any) => {
          const itemQtys = o.itemQtys || {};
          const priceMap = contractSkuPrices[o.contractId] || {};
          const skuDetails = Object.entries(itemQtys).map(([skuId, qty]: [string, any]) => {
            const priceInfo = priceMap[skuId] || { price: 0, sku: skuId.slice(0, 12) };
            const quantity = Number(qty) || 0;
            const unitPrice = priceInfo.price;
            return { sku: priceInfo.sku, quantity, unitPrice, amount: Math.round(quantity * unitPrice * 100) / 100 };
          });
          return {
            ...o,
            deliveryNumber: o.deliveryNumber,
            qty: o.qty,
            tailAmount: Number(o.tailAmount || 0),
            tailPaid: Number(o.tailPaid || 0),
            unpaid: Number(o.tailAmount || 0) - Number(o.tailPaid || 0),
            status: o.status,
            skuDetails,
            isFullyPaid: Number(o.tailPaid || 0) >= Number(o.tailAmount || 0) && Number(o.tailAmount || 0) > 0,
          };
        });
        setBillDetails(orders);
      } else if (bill.billType === "广告" || bill.billType === "广告返点") {
        const res = await fetch("/api/ad-consumptions?page=1&pageSize=5000");
        const data = await res.json();
        const allConsumptions = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
        const ids = (bill as any).consumptionIds || [];
        let consumptions: any[];
        if (ids.length > 0) {
          consumptions = ids.map((id: string) => allConsumptions.find((c: any) => c.id === id)).filter(Boolean);
        } else {
          consumptions = allConsumptions.filter((c: any) => {
            return c.month === bill.month && c.agencyId === bill.agencyId;
          });
        }
        setBillDetails(consumptions);
      }
    } catch (e) {
      console.error("加载账单明细失败", e);
    }
    setLoadingDetails(false);
  };

  // 自动生成所有月账单（供应商和广告）
  const handleAutoGenerate = async () => {
    if (isAutoGenerating) return;
    
    setIsAutoGenerating(true);
    toast.loading("正在自动生成月账单...", { id: "auto-generate" });

    try {
      // 获取当前月份（上个月，因为通常生成上个月的账单）
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const targetMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

      const existingBills = await getMonthlyBills();
      const newBills: MonthlyBill[] = [];
      let supplierCount = 0;
      let adCount = 0;

      // 1. 生成供应商月账单
      try {
        const [suppliersRes, deliveryOrders, contracts] = await Promise.all([
          fetch("/api/suppliers"),
          getDeliveryOrdersFromAPI(),
          getPurchaseContractsFromAPI()
        ]);
        const suppliers = suppliersRes.ok ? await suppliersRes.json() : [];

        suppliers.forEach((supplier: any) => {
          // 检查是否已存在该供应商该月的账单
          const existing = existingBills.find(
            (b) => b.supplierId === supplier.id && b.month === targetMonth && b.billType === "工厂订单"
          );
          if (existing) return;

          // 筛选该供应商该月的拿货单
          const monthOrders = deliveryOrders.filter((order) => {
            // 通过合同ID查找供应商
            const contract = contracts.find((c) => c.id === order.contractId);
            if (!contract || contract.supplierId !== supplier.id) return false;
            const orderDate = order.shippedDate || order.createdAt;
            const orderMonth = orderDate ? `${new Date(orderDate).getFullYear()}-${String(new Date(orderDate).getMonth() + 1).padStart(2, "0")}` : "";
            return orderMonth === targetMonth && (includePaid || !order.tailPaid) && (order.tailAmount > 0 || !order.tailAmount);
          });

          if (monthOrders.length === 0) return;

          // 按合同分组汇总
          const contractMap = new Map<string, { orders: typeof monthOrders; totalTail: number; totalAmount: number; hasDeposit: boolean }>();
          
          monthOrders.forEach((order) => {
            const contract = contracts.find((c) => c.id === order.contractId);
            if (!contract) return;

            const contractId = contract.id;
            if (!contractMap.has(contractId)) {
              contractMap.set(contractId, {
                orders: [],
                totalTail: 0,
                totalAmount: 0,
                hasDeposit: contract.depositRate > 0
              });
            }

            const group = contractMap.get(contractId)!;
            group.orders.push(order);
            
            if (contract.depositRate > 0) {
              // 有预付款，只计算尾款
              group.totalTail += order.tailAmount || 0;
            } else {
              // 无预付款，计算全部金额（数量 * 单价）
              const orderTotal = order.qty * contract.unitPrice;
              group.totalAmount += orderTotal;
            }
          });

          if (contractMap.size === 0) return;

          // 计算总金额
          let totalAmount = 0;
          contractMap.forEach((group) => {
            totalAmount += group.hasDeposit ? group.totalTail : group.totalAmount;
          });

          if (totalAmount <= 0) return;

          // 创建账单
          const newBill: MonthlyBill = {
            id: `bill-supplier-auto-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            month: targetMonth,
            billCategory: "Payable",
            billType: "工厂订单",
            supplierId: supplier.id,
            supplierName: supplier.name,
            totalAmount: totalAmount,
            currency: "CNY",
            rebateAmount: 0,
            netAmount: totalAmount,
            consumptionIds: [],
            status: includePaid && monthOrders.every((o: any) => o.tailPaid) ? "Paid" : "Draft",
            createdBy: "系统自动生成",
            createdAt: new Date().toISOString(),
            notes: includePaid ? `${targetMonth}月供应商月账单（含已付款）` : `自动生成：${targetMonth}月供应商月账单`
          };

          newBills.push(newBill);
          supplierCount++;
        });
      } catch (error) {
        console.error("生成供应商月账单失败", error);
      }

      // 2. 生成广告月账单
      try {
        const [agenciesRes, consumptionsRes] = await Promise.all([
          fetch("/api/ad-agencies?page=1&pageSize=500&noCache=true"),
          fetch("/api/ad-consumptions?page=1&pageSize=5000&noCache=true"),
        ]);
        const agenciesPayload = agenciesRes.ok ? await agenciesRes.json() : [];
        const consumptionsPayload = consumptionsRes.ok ? await consumptionsRes.json() : [];
        const agencies = Array.isArray(agenciesPayload) ? agenciesPayload : agenciesPayload?.data || [];
        const consumptions = Array.isArray(consumptionsPayload) ? consumptionsPayload : consumptionsPayload?.data || [];

        type AgencyData = { id: string; name: string };
        type ConsumptionData = { id: string; agencyId: string; month: string; amount: number; estimatedRebate: number; currency: string };
        
        (agencies as AgencyData[]).forEach((agency: AgencyData) => {
          // 检查是否已存在该代理商该月的账单
          const existing = existingBills.find(
            (b) => b.agencyId === agency.id && b.month === targetMonth && b.billType === "广告"
          );
          if (existing) return;

          // 筛选该代理商该月的消耗记录
          const monthConsumptions = (consumptions as ConsumptionData[]).filter(
            (c: ConsumptionData) => c.agencyId === agency.id && c.month === targetMonth
          );

          if (monthConsumptions.length === 0) return;

          // 汇总消耗和返点
          const totalConsumption = monthConsumptions.reduce((sum: number, c: ConsumptionData) => sum + (c.amount || 0), 0);
          const totalRebate = monthConsumptions.reduce((sum: number, c: ConsumptionData) => sum + (c.estimatedRebate || 0), 0);
          const netAmount = totalConsumption - totalRebate;
          const currency = monthConsumptions[0]?.currency || "USD";

          if (totalConsumption <= 0) return;

          // 创建账单
          const newBill: MonthlyBill = {
            id: `bill-ad-auto-${Date.now()}-${agency.id}`,
            month: targetMonth,
            billCategory: "Payable",
            billType: "广告",
            agencyId: agency.id,
            agencyName: agency.name,
            totalAmount: totalConsumption,
            currency: currency as "USD" | "CNY" | "HKD",
            rebateAmount: totalRebate,
            netAmount: netAmount,
            consumptionIds: monthConsumptions.map((c: ConsumptionData) => c.id),
            status: "Draft",
            createdBy: "系统自动生成",
            createdAt: new Date().toISOString(),
            notes: `自动生成：${targetMonth}月广告月账单`
          };

          newBills.push(newBill);
          adCount++;
        });
      } catch (error) {
        console.error("生成广告月账单失败", error);
      }

      // 3. 生成物流月账单
      let logisticsCount = 0;
      try {
        const logisticsRes = await fetch("/api/logistics-cost?pageSize=9999");
        const logisticsData = logisticsRes.ok ? await logisticsRes.json() : { data: [] };
        const logisticsCosts = Array.isArray(logisticsData?.data) ? logisticsData.data : [];

        type LogisticsCostData = { id: string; costType: string; amount: number; currency: string; logisticsChannelId?: string; paymentStatus?: string; dueDate?: string; outboundBatch?: { shippedDate?: string }; createdAt: string };
        
        // 按物流渠道+月份分组（优先用出库发货日期）
        const channelMap = new Map<string, { costs: LogisticsCostData[]; channelId: string; month: string }>();
        (logisticsCosts as LogisticsCostData[]).forEach((cost: LogisticsCostData) => {
          const channelId = cost.logisticsChannelId || '_no_channel';
          let month = '';
          if ((cost as any).outboundBatch?.shippedDate) {
            const d = new Date((cost as any).outboundBatch.shippedDate);
            month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          } else if (cost.dueDate) {
            month = `${new Date(cost.dueDate).getFullYear()}-${String(new Date(cost.dueDate).getMonth() + 1).padStart(2, "0")}`;
          } else {
            month = `${new Date(cost.createdAt).getFullYear()}-${String(new Date(cost.createdAt).getMonth() + 1).padStart(2, "0")}`;
          }
          const key = `${channelId}|${month}`;
          if (!channelMap.has(key)) channelMap.set(key, { costs: [], channelId, month });
          channelMap.get(key)!.costs.push(cost);
        });

        if (channelMap.size > 0) {
          // 获取物流渠道名称
          const channelsRes = await fetch("/api/logistics-channels?pageSize=999");
          const channelsData = channelsRes.ok ? await channelsRes.json() : { data: [] };
          const channels = Array.isArray(channelsData?.data) ? channelsData.data : [];

          channelMap.forEach((group) => {
            // 只生成目标月份的账单
            if (group.month !== targetMonth) return;
            const channelId = group.channelId;
            const channel = channels.find((c: any) => c.id === channelId);
            const channelName = channel?.name || "未知渠道";
            const totalAmount = group.costs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
            if (totalAmount <= 0) return;

            // 检查是否已存在
            const existing = existingBills.find(
              (b) => b.billType === "物流" && b.month === targetMonth && b.notes?.includes(channelName)
            );
            if (existing) return;

            const allPaid = group.costs.every(c => c.paymentStatus === "已付" || c.paymentStatus === "已支付");
            const newBill: MonthlyBill = {
              id: `bill-logistics-auto-${Date.now()}-${channelId}`,
              month: targetMonth,
              billCategory: "Payable",
              billType: "物流",
              supplierName: channelName,
              totalAmount: totalAmount,
              currency: (group.costs[0]?.currency || "CNY") as "USD" | "CNY" | "HKD",
              rebateAmount: 0,
              netAmount: totalAmount,
              consumptionIds: [],
              status: allPaid ? "Paid" : "Draft",
              createdBy: "系统自动生成",
              createdAt: new Date().toISOString(),
              notes: `自动生成：${targetMonth}月物流月账单 - ${channelName}（${group.costs.length}笔）`
            };
            newBills.push(newBill);
            logisticsCount++;
          });
        }
      } catch (error) {
        console.error("生成物流月账单失败", error);
      }

      // 保存所有新生成的账单
      if (newBills.length > 0) {
        const allBills = [...existingBills, ...newBills];
        await saveMonthlyBills(allBills);
        mutateBills();
        
        toast.success(
          `自动生成完成！供应商：${supplierCount}，广告：${adCount}，物流：${logisticsCount}，共 ${newBills.length} 个`,
          { id: "auto-generate", duration: 4000 }
        );
      } else {
        toast.success("没有需要生成的账单（可能都已存在）");
      }
    } catch (error) {
      console.error("自动生成失败", error);
      toast.error("自动生成失败，请稍后重试");
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const statusColors: Record<BillStatus, string> = {
    Draft: "bg-slate-500/20 text-slate-300 border-slate-500/40",
    Pending_Finance_Review: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    Pending_Approval: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    Approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    Cashier_Approved: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    Paid: "bg-purple-500/20 text-purple-300 border-purple-500/40"
  };

  const statusLabels: Record<BillStatus, string> = {
    Draft: "草稿",
    Pending_Finance_Review: "待财务审批",
    Pending_Approval: "待主管审批",
    Approved: "已核准",
    Cashier_Approved: "出纳已审核",
    Paid: "已支付"
  };

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <PageHeader
        title="月账单管理"
        description="管理供应商和广告月账单，生成、查看、统计"
        actions={
          <>
            <InteractiveButton 
              icon={<Wallet className="h-4 w-4" />} 
              variant="primary"
              size="md"
              onClick={handleGenerateFromDelivery}
              disabled={generatingFromDelivery}
              className="bg-emerald-600 hover:bg-emerald-500 border-emerald-500"
            >
              {generatingFromDelivery ? "生成中…" : "根据拿货单生成月账单"}
            </InteractiveButton>
            <Link href="/finance/monthly-bills/supplier-bills">
              <InteractiveButton icon={<Plus className="h-4 w-4" />} variant="primary" size="md">
                生成供应商月账单
              </InteractiveButton>
            </Link>
            <Link href="/finance/monthly-bills/ad-bills">
              <InteractiveButton icon={<Plus className="h-4 w-4" />} variant="primary" size="md">
                生成广告月账单
              </InteractiveButton>
            </Link>
            <InteractiveButton 
              icon={<Zap className="h-4 w-4" />} 
              variant="primary"
              size="md"
              onClick={handleAutoGenerate}
              disabled={isAutoGenerating}
            >
              自动生成月账单
            </InteractiveButton>
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
              <input type="checkbox" checked={includePaid} onChange={() => setIncludePaid(!includePaid)} className="rounded border-slate-600 bg-slate-800" />
              含已付款
            </label>
          </>
        }
      />

      {/* 统计卡片 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="text-xs font-medium text-white/70 mb-2">账单总额</div>
            {Object.entries(stats.totalPayableByCurrency || {}).sort().map(([cur, amt]) => (
              <div key={cur} className="text-lg font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {cur === "CNY" || cur === "RMB" ? formatCurrency(amt, "CNY", "expense") : cur === "USD" ? formatCurrency(amt, "USD", "expense") : `${amt.toLocaleString()} ${cur}`}
              </div>
            ))}
            <div className="text-xs text-white/40 mt-1">{stats.totalBills} 笔账单</div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="text-xs font-medium text-white/70 mb-2">已付金额</div>
            {Object.keys(stats.paidByCurrency || {}).length > 0 ? Object.entries(stats.paidByCurrency).sort().map(([cur, amt]) => (
              <div key={cur} className="text-lg font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {cur === "CNY" || cur === "RMB" ? formatCurrency(amt, "CNY", "expense") : cur === "USD" ? formatCurrency(amt, "USD", "expense") : `${amt.toLocaleString()} ${cur}`}
              </div>
            )) : <div className="text-lg font-bold text-slate-500">-</div>}
            <div className="text-xs text-white/40 mt-1">{stats.paidBills} 笔已付</div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #be123c 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="text-xs font-medium text-white/70 mb-2">未付金额</div>
            {(() => {
              const unpaid: Record<string, number> = {};
              Object.entries(stats.totalPayableByCurrency || {}).forEach(([cur, total]) => {
                const paid = stats.paidPayableByCurrency?.[cur] || 0;
                const diff = total - paid;
                if (Math.abs(diff) > 0.01) unpaid[cur] = diff;
              });
              const keys = Object.keys(unpaid);
              return keys.length > 0 ? keys.sort().map((cur) => (
                <div key={cur} className="text-lg font-bold text-rose-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {cur === "CNY" || cur === "RMB" ? formatCurrency(unpaid[cur], "CNY", "expense") : cur === "USD" ? formatCurrency(unpaid[cur], "USD", "expense") : `${unpaid[cur].toLocaleString()} ${cur}`}
                </div>
              )) : <div className="text-lg font-bold text-emerald-400">全部付清</div>;
            })()}
            <div className="text-xs text-white/40 mt-1">{stats.pendingBills + stats.approvedBills} 笔待处理</div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #b45309 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="text-xs font-medium text-white/70 mb-2">待审批</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{stats.pendingBills}</div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="text-xs font-medium text-white/70 mb-2">已核准</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{stats.approvedBills}</div>
          </div>
        </div>
      </section>

      {/* 筛选和搜索 - 优化样式 */}
      <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">搜索</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="供应商/代理商名称、月份..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full pl-10 rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">账单月份</label>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">状态</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as BillStatus | "all")}
              className="w-full rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
            >
              <option value="all">全部状态</option>
              <option value="Draft">草稿</option>
              <option value="Pending_Finance_Review">待财务审批</option>
              <option value="Pending_Approval">待主管审批</option>
              <option value="Approved">已核准</option>
              <option value="Paid">已支付</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchKeyword("");
                setFilterType("all");
                setFilterStatus("all");
                setFilterMonth("");
              }}
              className="w-full px-4 py-2 rounded-lg border border-slate-800/50 bg-slate-900/50 text-slate-300 hover:bg-slate-800/50 hover:border-slate-700 transition-all"
            >
              重置筛选
            </button>
          </div>
        </div>
      </div>

      {/* 应付汇总统计 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {(() => {
          const today = new Date().toISOString().split("T")[0];
          const payables = bills.filter(b => b.billCategory === "Payable" && b.status !== "Paid");
          const overdue = payables.filter(b => b.dueDate && b.dueDate < today);
          const pending = payables.filter(b => b.status === "Approved");
          return (
            <>
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
                <p className="text-xs text-slate-400">应付总额</p>
                <p className="text-xl font-bold text-slate-100 mt-1">
                  {formatCurrency(payables.reduce((s, b) => s + b.totalAmount, 0), "USD", "expense")}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{payables.length} 笔待处理</p>
              </div>
              <div className="rounded-xl border border-rose-700/50 bg-rose-900/20 p-4">
                <p className="text-xs text-rose-400">已逾期</p>
                <p className="text-xl font-bold text-rose-300 mt-1">
                  {formatCurrency(overdue.reduce((s, b) => s + b.totalAmount, 0), "USD", "expense")}
                </p>
                <p className="text-xs text-rose-400/70 mt-0.5">{overdue.length} 笔逾期</p>
              </div>
              <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-4">
                <p className="text-xs text-amber-400">待出纳付款</p>
                <p className="text-xl font-bold text-amber-300 mt-1">
                  {formatCurrency(pending.reduce((s, b) => s + b.totalAmount, 0), "USD", "expense")}
                </p>
                <p className="text-xs text-amber-400/70 mt-0.5">{pending.length} 笔待打款</p>
              </div>
              <div className="rounded-xl border border-emerald-700/50 bg-emerald-900/20 p-4">
                <p className="text-xs text-emerald-400">已付款</p>
                <p className="text-xl font-bold text-emerald-300 mt-1">
                  {formatCurrency(bills.filter(b => b.billCategory === "Payable" && b.status === "Paid").reduce((s, b) => s + b.totalAmount, 0), "USD", "expense")}
                </p>
                <p className="text-xs text-emerald-400/70 mt-0.5">{bills.filter(b => b.billCategory === "Payable" && b.status === "Paid").length} 笔已结清</p>
              </div>
              <div className="rounded-xl border border-blue-700/50 bg-blue-900/20 p-4">
                <p className="text-xs text-blue-400">应收返点</p>
                <p className="text-xl font-bold text-blue-300 mt-1">
                  {formatCurrency(bills.filter(b => b.billCategory === "Receivable").reduce((s, b) => s + b.netAmount, 0), "USD", "income")}
                </p>
                <p className="text-xs text-blue-400/70 mt-0.5">{bills.filter(b => b.billCategory === "Receivable").length} 笔返点</p>
              </div>
            </>
          );
        })()}
      </div>

      {/* 账单分类 Tab */}
      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto mb-4">
        {([
          { value: "all", label: "全部" },
          { value: "工厂订单", label: "供应商月账单" },
          { value: "广告", label: "广告月账单" },
          { value: "物流", label: "物流月账单" },
          { value: "广告返点", label: "广告返点" },
          { value: "店铺回款", label: "店铺回款" },
          { value: "其他", label: "其他" },
        ] as const).map((tab) => {
          const cnt = tab.value === "all" ? bills.length : bills.filter((b) => b.billType === tab.value).length;
          return (
            <button
              key={tab.value}
              onClick={() => setFilterType(tab.value as BillType | "all")}
              className={"px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors " + (filterType === tab.value ? "text-white border-b-2 border-primary-500" : "text-slate-400 hover:text-slate-200")}
            >
              {tab.label}
              <span className={"ml-1 text-xs " + (filterType === tab.value ? "text-primary-400" : "text-slate-600")}>({cnt})</span>
            </button>
          );
        })}
      </div>

      {/* 账单列表 - 优化样式 */}
      <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 overflow-hidden backdrop-blur-sm shadow-xl">
        <div className="p-5 border-b border-slate-800/50 bg-slate-900/40">
          <h2 className="text-lg font-semibold text-slate-100">账单列表</h2>
        </div>

        {filteredBills.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="暂无账单"
            description={bills.length === 0 ? "点击「生成供应商月账单」或「生成广告月账单」创建第一个账单" : "没有找到匹配的账单"}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/40">
                <tr>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">账单月份</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">账单类型</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">关联方</th>
                  <th className="px-4 py-4 text-right text-sm font-semibold text-slate-200">账单金额</th>
                  <th className="px-4 py-4 text-right text-sm font-semibold text-slate-200">
                    {filterType === "广告返点"
                      ? "实收金额"
                      : filterType === "all"
                        ? "实付/实收金额"
                        : "实付金额"}
                  </th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">币种</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">状态</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">付款单号</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">创建时间</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">到期日</th>
                  <th className="px-4 py-4 text-center text-sm font-semibold text-slate-200">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {paginate(filteredBills, pgPage, pgPageSize).map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-800/40 transition-all duration-200 group">
                    <td className="px-4 py-3 text-slate-200">{bill.month}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border
                        ${bill.billType === "广告返点" 
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" 
                          : "bg-blue-500/20 text-blue-300 border-blue-500/40"}`}>
                        {bill.billType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {bill.supplierName || bill.agencyName || "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {bill.billType === "广告返点" && (
                        <div className="text-xs text-slate-500">
                          消耗：<span className="text-slate-400">{formatCurrency(bill.totalAmount, bill.currency, "expense")}</span>
                          <span className="ml-1 text-slate-600">({bill.totalAmount > 0 ? Math.round((bill.netAmount / bill.totalAmount) * 10000) / 100 : 0}%)</span>
                        </div>
                      )}
                      <div className={bill.billType === "广告返点" ? "text-emerald-300" : ""}>
                        {formatCurrency(bill.billType === "广告返点" ? bill.netAmount : bill.totalAmount, bill.currency, bill.billCategory === "Receivable" ? "income" : "expense")}
                        {bill.billType === "广告返点" && <span className="ml-1 text-xs text-slate-500">返点</span>}
                      </div>
                      {bill.billType === "工厂订单" && (
                        <div className="text-[10px] space-y-0.5 mt-0.5">
                          {bill.status === "Paid" ? (
                            <span className="text-emerald-400">已结清</span>
                          ) : (
                            <span className="text-rose-400">待付款</span>
                          )}
                        </div>
                      )}
                      {(bill.offsetAmount || 0) > 0 && (
                        <div className="text-xs text-emerald-400">抵扣 -{formatCurrency(bill.offsetAmount, bill.currency, "income")}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {(() => {
                        if (bill.billType === "工厂订单") {
                          // 工厂订单：显示已付和未付
                          const paid = bill.status === "Paid" ? bill.totalAmount : 0;
                          const unpaid = bill.totalAmount - paid;
                          return (
                            <div className="space-y-0.5">
                              <div className="text-emerald-300">{formatCurrency(paid, bill.currency, "expense")}</div>
                              {unpaid > 0.01 && (
                                <div className="text-rose-400 text-xs">{formatCurrency(unpaid, bill.currency, "expense")}</div>
                              )}
                              {unpaid <= 0.01 && paid > 0 && (
                                <div className="text-[10px] text-emerald-400">已结清</div>
                              )}
                            </div>
                          );
                        }
                        if (bill.billType === "广告返点") {
                          if (bill.status !== "Paid") return <span className="text-slate-500">-</span>;
                          return <span className="text-emerald-300">{formatCurrency(bill.rebateAmount, bill.currency, "income")}</span>;
                        }
                        if (bill.status !== "Paid") return <span className="text-slate-500">-</span>;
                        const actualPaid = bill.totalAmount - (bill.offsetAmount || 0);
                        return <span className="text-emerald-300">{formatCurrency(actualPaid, bill.currency, "expense")}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{bill.currency}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${bill.billCategory === "Receivable" && bill.status === "Paid" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : statusColors[bill.status]}`}
                      >
                        {bill.billCategory === "Receivable" && bill.status === "Paid" ? "已回款" : statusLabels[bill.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-sm font-mono">
                      {bill.paymentVoucherNumber || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">{formatDate(bill.createdAt)}</td>
                    <td className="px-4 py-3">
                      {bill.dueDate ? (
                        (() => {
                          const today = new Date().toISOString().split("T")[0];
                          const isOverdue = bill.dueDate < today && bill.status !== "Paid";
                          return (
                            <span className={`text-sm ${isOverdue ? "text-rose-400 font-semibold" : "text-slate-300"}`}>
                              {bill.dueDate}
                              {isOverdue && <span className="ml-1 text-xs bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded">逾期</span>}
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewDetail(bill)}
                          className="px-3 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-primary-100 hover:bg-primary-500/20 text-sm transition"
                        >
                          <Eye className="h-4 w-4 inline mr-1" />
                          查看
                        </button>
                        {bill.status === "Draft" && (
                          <Link href={`/finance/reconciliation?billId=${bill.id}&action=submit`}>
                            <button className="px-3 py-1 rounded border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 text-sm transition">
                              提交给财务
                            </button>
                          </Link>
                        )}
                        {bill.status === "Pending_Finance_Review" && (
                          <Link href={`/finance/reconciliation?billId=${bill.id}`}>
                            <button className="px-3 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-sm transition">
                              财务审批
                            </button>
                          </Link>
                        )}
                        {bill.status === "Pending_Approval" && (
                          <Link href={`/finance/reconciliation?billId=${bill.id}`}>
                            <button className="px-3 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-sm transition">
                              主管审批
                            </button>
                          </Link>
                        )}
                        {bill.status === "Approved" && (
                          <Link href={`/finance/reconciliation?tab=PendingPayment&billId=${bill.id}`}>
                            <button className="px-3 py-1 rounded border border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 text-sm transition">
                              出纳付款
                            </button>
                          </Link>
                        )}
                        <Link href={`/finance/reconciliation?billId=${bill.id}`}>
                          <button className="px-3 py-1 rounded border border-slate-500/40 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20 text-sm transition">
                            对账中心
                          </button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          <Pagination total={filteredBills.length} page={pgPage} pageSize={pgPageSize} onPageChange={setPgPage} onPageSizeChange={setPgPageSize} />
          </div>
        )}
      </div>

      {/* 详情模态框 */}
      {isDetailModalOpen && selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
            <div className="p-6 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">账单详情</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    {selectedBill.supplierName || selectedBill.agencyName} · {selectedBill.month} · {selectedBill.billType}
                  </p>
                </div>
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="text-slate-400 hover:text-slate-200 transition"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-400 mb-1">账单类型</div>
                  <div className="text-slate-100">{selectedBill.billType}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">关联方</div>
                  <div className="text-slate-100">
                    {selectedBill.supplierName || selectedBill.agencyName || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">
                    {selectedBill.billType === "广告" ? "消耗总额（应付）" : selectedBill.billType === "广告返点" ? "返点应收金额" : "账单金额"}
                  </div>
                  <div className={selectedBill.billType === "广告返点" ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                    {formatCurrency(
                      selectedBill.billType === "广告返点" ? selectedBill.netAmount : selectedBill.totalAmount,
                      selectedBill.currency,
                      selectedBill.billType === "广告返点" ? "income" : "expense"
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">状态</div>
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${selectedBill.billCategory === "Receivable" && selectedBill.status === "Paid" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : statusColors[selectedBill.status]}`}
                  >
                    {selectedBill.billCategory === "Receivable" && selectedBill.status === "Paid" ? "已回款" : statusLabels[selectedBill.status]}
                  </span>
                </div>
              </div>

              {selectedBill.notes && (
                <div>
                  <div className="text-xs text-slate-400 mb-1">备注</div>
                  <div className="text-slate-300 whitespace-pre-wrap">{selectedBill.notes}</div>
                </div>
              )}

              {/* 账单明细 */}
              <div className="pt-4 border-t border-slate-800">
                <div className="text-sm font-semibold text-slate-200 mb-3">
                  📋 账单明细
                  {billDetails.length > 0 && <span className="text-xs text-slate-400 ml-2">({billDetails.length}笔)</span>}
                </div>
                {loadingDetails ? (
                  <div className="text-center py-4 text-slate-500 text-sm">加载中...</div>
                ) : billDetails.length > 0 ? (
                  <div className="rounded-lg border border-slate-700 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800/60">
                        <tr>
                          {selectedBill.billType === "物流" && (
                            <>
                              <th className="px-3 py-2 text-left text-slate-400">费用类型</th>
                              <th className="px-3 py-2 text-right text-slate-400">金额</th>
                              <th className="px-3 py-2 text-left text-slate-400">批次号</th>
                              <th className="px-3 py-2 text-left text-slate-400">付款状态</th>
                            </>
                          )}
                          {selectedBill.billType === "工厂订单" && (
                            <>
                              <th className="px-3 py-2 text-left text-slate-400">拿货单号</th>
                              <th className="px-3 py-2 text-left text-slate-400">SKU</th>
                              <th className="px-3 py-2 text-right text-slate-400">数量</th>
                              <th className="px-3 py-2 text-right text-slate-400">单价</th>
                              <th className="px-3 py-2 text-right text-slate-400">金额</th>
                              <th className="px-3 py-2 text-left text-slate-400">状态</th>
                            </>
                          )}
                          {(selectedBill.billType === "广告" || selectedBill.billType === "广告返点") && (
                            <>
                              <th className="px-3 py-2 text-left text-slate-400">日期</th>
                              <th className="px-3 py-2 text-left text-slate-400">广告账户</th>
                              <th className="px-3 py-2 text-right text-slate-400">消耗金额</th>
                              <th className="px-3 py-2 text-right text-slate-400">预估返点</th>
                              <th className="px-3 py-2 text-center text-slate-400">凭证</th>
                              <th className="px-3 py-2 text-left text-slate-400">备注</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedBill.billType === "工厂订单"
                          ? billDetails.flatMap((item: any, orderIdx: number) => {
                              const skus = (item.skuDetails && item.skuDetails.length > 0)
                                ? item.skuDetails
                                : [{ sku: "-", quantity: item.qty, unitPrice: 0, amount: item.tailAmount || 0 }];
                              return skus.map((sku: any, skuIdx: number) => (
                                <tr key={`${orderIdx}-${skuIdx}`} className="hover:bg-slate-800/30">
                                  {skuIdx === 0 && (
                                    <td className="px-3 py-2 text-slate-300 align-top" rowSpan={skus.length}>
                                      <div className="font-medium">{item.deliveryNumber}</div>
                                      <div className="text-[10px] text-slate-500 mt-1">合计：{item.qty} 件</div>
                                      <div className="text-[10px] text-slate-400 mt-1">
                                        总额：<span className="text-slate-300">{formatCurrency(item.tailAmount || 0, selectedBill.currency || "CNY", "expense")}</span>
                                      </div>
                                      <div className="text-[10px] text-emerald-400">
                                        已付：{formatCurrency(item.tailPaid || 0, selectedBill.currency || "CNY", "expense")}
                                      </div>
                                      <div className="text-[10px] {item.unpaid > 0 ? 'text-rose-400' : 'text-emerald-400'}">
                                        {item.unpaid > 0 ? `未付：${formatCurrency(item.unpaid, selectedBill.currency || "CNY", "expense")}` : "✅ 已结清"}
                                      </div>
                                      <div className="text-[10px] text-slate-500 mt-0.5">{item.status}</div>
                                    </td>
                                  )}
                                  <td className="px-3 py-2 text-slate-300 text-xs">{sku.sku}</td>
                                  <td className="px-3 py-2 text-right text-slate-200">{sku.quantity?.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right text-slate-400">¥{Number(sku.unitPrice).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right text-slate-200 font-medium">¥{Number(sku.amount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                                </tr>
                              ));
                            })
                          : billDetails.map((item: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-800/30">
                              {selectedBill.billType === "物流" && (
                                <>
                                  <td className="px-3 py-2 text-slate-300">{item.costType}</td>
                                  <td className="px-3 py-2 text-right text-slate-200">{item.currency} {Number(item.amount).toLocaleString()}</td>
                                  <td className="px-3 py-2 text-slate-400">{item.outboundBatch?.batchNumber || "-"}</td>
                                  <td className="px-3 py-2">
                                    <span className={item.paymentStatus === "已付" ? "text-emerald-400" : "text-amber-400"}>{item.paymentStatus || "-"}</span>
                                  </td>
                                </>
                              )}
                              {(selectedBill.billType === "广告" || selectedBill.billType === "广告返点") && (
                                <>
                                  <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{item.date || "-"}</td>
                                  <td className="px-3 py-2 text-slate-300">{item.accountName || item.adAccountId?.slice(0,8) || "-"}</td>
                                  <td className="px-3 py-2 text-right text-slate-200">{formatCurrency(item.amount, item.currency || "USD", "expense")}</td>
                                  <td className="px-3 py-2 text-right text-emerald-400">{formatCurrency(item.estimatedRebate || 0, item.currency || "USD", "expense")}</td>
                                  <td className="px-3 py-2 text-center">
                                    {item.voucher && item.voucher.length > 10 ? (
                                      <a href={item.voucher} target="_blank" rel="noreferrer" className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition">查看</a>
                                    ) : (
                                      <span className="text-slate-500 text-xs">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-400 max-w-[150px] truncate" title={item.notes || ""}>{item.notes || "-"}</td>
                                </>
                              )}
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-500 text-sm">暂无明细数据（点击"自动生成"更新账单）</div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800">
                <Link href="/finance/reconciliation">
                  <InteractiveButton variant="primary" size="md">前往对账中心审批</InteractiveButton>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
