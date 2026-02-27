"use client";

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
  const [filterStatus, setFilterStatus] = useState<BillStatus | "all">("all");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [selectedBill, setSelectedBill] = useState<MonthlyBill | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [generatingFromDelivery, setGeneratingFromDelivery] = useState(false);

  // 使用 SWR 获取数据
  const fetcher = async () => {
    if (typeof window === "undefined") return [];
    return await getMonthlyBills();
  };
  const { data: billsData, mutate: mutateBills } = useSWR("monthly-bills-all", fetcher, { 
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
        mutate("monthly-bills");
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
    const totalAmount = bills.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
    const pendingBills = bills.filter((b) => b.status === "Pending_Approval" || b.status === "Draft").length;
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
      totalAmount,
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
            return orderMonth === targetMonth && !order.tailPaid && (order.tailAmount > 0 || !order.tailAmount);
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
            status: "Draft",
            createdBy: "系统自动生成",
            createdAt: new Date().toISOString(),
            notes: `自动生成：${targetMonth}月供应商月账单`
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
          fetch("/api/ad-agencies"),
          fetch("/api/ad-consumptions"),
        ]);
        const agencies = agenciesRes.ok ? await agenciesRes.json() : [];
        const consumptions = consumptionsRes.ok ? await consumptionsRes.json() : [];

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

      // 保存所有新生成的账单
      if (newBills.length > 0) {
        const allBills = [...existingBills, ...newBills];
        await saveMonthlyBills(allBills);
        mutate("monthly-bills-all");
        
        toast.success(
          `自动生成完成！供应商账单：${supplierCount} 个，广告账单：${adCount} 个，共 ${newBills.length} 个`,
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
          </>
        }
      />

      {/* 统计卡片 - 优化样式 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-5 backdrop-blur-sm hover:border-blue-500/50 transition-all duration-300 shadow-lg shadow-blue-500/5">
          <div className="flex items-center justify-between mb-3">
            <FileText className="h-5 w-5 text-blue-400" />
            <div className="text-xs text-slate-400">账单总数</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.totalBills}</div>
        </div>
        
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-5 backdrop-blur-sm hover:border-purple-500/50 transition-all duration-300 shadow-lg shadow-purple-500/5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="h-5 w-5 text-purple-400" />
            <div className="text-xs text-slate-400">账单总额</div>
          </div>
          <div className="text-xl font-bold text-slate-100">{formatCurrency(stats.totalAmount, "CNY", "expense")}</div>
        </div>
        
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-5 backdrop-blur-sm hover:border-amber-500/50 transition-all duration-300 shadow-lg shadow-amber-500/5">
          <div className="flex items-center justify-between mb-3">
            <FileText className="h-5 w-5 text-amber-400" />
            <div className="text-xs text-slate-400">待审批</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.pendingBills}</div>
        </div>
        
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-5 backdrop-blur-sm hover:border-emerald-500/50 transition-all duration-300 shadow-lg shadow-emerald-500/5">
          <div className="flex items-center justify-between mb-3">
            <FileText className="h-5 w-5 text-emerald-400" />
            <div className="text-xs text-slate-400">已核准</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.approvedBills}</div>
        </div>
        
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-5 backdrop-blur-sm hover:border-blue-500/50 transition-all duration-300 shadow-lg shadow-blue-500/5">
          <div className="flex items-center justify-between mb-3">
            <FileText className="h-5 w-5 text-blue-400" />
            <div className="text-xs text-slate-400">已支付</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.paidBills}</div>
        </div>
      </div>

      {/* 筛选和搜索 - 优化样式 */}
      <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <label className="block text-sm font-medium text-slate-300 mb-2">账单类型</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as BillType | "all")}
              className="w-full rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
            >
              <option value="all">全部类型</option>
              <option value="工厂订单">工厂订单</option>
              <option value="广告">广告</option>
              <option value="物流">物流</option>
              <option value="店铺回款">店铺回款</option>
              <option value="广告返点">广告返点</option>
              <option value="其他">其他</option>
            </select>
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
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">币种</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">状态</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">付款单号</th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-200">创建时间</th>
                  <th className="px-4 py-4 text-center text-sm font-semibold text-slate-200">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-800/40 transition-all duration-200 group">
                    <td className="px-4 py-3 text-slate-200">{bill.month}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/40">
                        {bill.billType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {bill.supplierName || bill.agencyName || "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200 font-medium">
                      {formatCurrency(bill.totalAmount, bill.currency, "expense")}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{bill.currency}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${statusColors[bill.status]}`}
                      >
                        {statusLabels[bill.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-sm font-mono">
                      {bill.paymentVoucherNumber || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">{formatDate(bill.createdAt)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewDetail(bill)}
                          className="px-3 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-primary-100 hover:bg-primary-500/20 text-sm transition"
                        >
                          <Eye className="h-4 w-4 inline mr-1" />
                          查看
                        </button>
                        <Link href={`/finance/reconciliation?billId=${bill.id}`}>
                          <button className="px-3 py-1 rounded border border-slate-500/40 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20 text-sm transition">
                            审批
                          </button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  <div className="text-xs text-slate-400 mb-1">账单金额</div>
                  <div className="text-slate-100">
                    {formatCurrency(selectedBill.totalAmount, selectedBill.currency, "expense")}
                  </div>
                </div>
                {selectedBill.billType === "广告" && (
                  <>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">返点金额</div>
                      <div className="text-emerald-400">
                        {formatCurrency(selectedBill.rebateAmount, selectedBill.currency, "expense")}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">净金额（应付）</div>
                      <div className="text-primary-400">
                        {formatCurrency(selectedBill.netAmount, selectedBill.currency, "expense")}
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <div className="text-xs text-slate-400 mb-1">状态</div>
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${statusColors[selectedBill.status]}`}
                  >
                    {statusLabels[selectedBill.status]}
                  </span>
                </div>
              </div>

              {selectedBill.notes && (
                <div>
                  <div className="text-xs text-slate-400 mb-1">备注</div>
                  <div className="text-slate-300 whitespace-pre-wrap">{selectedBill.notes}</div>
                </div>
              )}

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
