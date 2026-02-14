"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Factory, Package, TrendingUp, Calendar, AlertCircle, CheckCircle2, Clock, Play, AlertTriangle, Edit2, Save, X } from "lucide-react";
import { PageHeader, StatCard, SearchBar, EmptyState } from "@/components/ui";
import { upsertPurchaseContract, type PurchaseContract } from "@/lib/purchase-contracts-store";
import { getProductBySkuIdFromAPI, upsertProduct } from "@/lib/products-store";
import { addInventoryMovement } from "@/lib/inventory-movements-store";
import { toast } from "sonner";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

const formatCurrency = (amount: number, currency: string = "CNY") => {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 2
  }).format(amount);
};

type ProductionStatus = "未开始" | "生产中" | "部分完成" | "已完成" | "已取消";

export default function ProductionProgressPage() {
  const { data: contractsDataRaw, mutate: mutateContracts } = useSWR<any>(
    "/api/purchase-contracts?page=1&pageSize=500",
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 10000 }
  );
  const { data: deliveryOrdersDataRaw, mutate: mutateDeliveryOrders } = useSWR<any>(
    "/api/delivery-orders?page=1&pageSize=500",
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 10000 }
  );
  const contracts = Array.isArray(contractsDataRaw) ? contractsDataRaw : (contractsDataRaw?.data ?? []);
  const deliveryOrders = Array.isArray(deliveryOrdersDataRaw) ? deliveryOrdersDataRaw : (deliveryOrdersDataRaw?.data ?? []);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [editingFinishedQty, setEditingFinishedQty] = useState<string>("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemQty, setEditingItemQty] = useState<string>("");
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [completingContractId, setCompletingContractId] = useState<string | null>(null);

  // 处理更新完工数量
  const handleUpdateFinishedQty = async (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) {
      toast.error("合同不存在");
      return;
    }

    const newFinishedQty = parseInt(editingFinishedQty);
    if (isNaN(newFinishedQty) || newFinishedQty < 0) {
      toast.error("请输入有效的完工数量");
      return;
    }

    if (newFinishedQty > contract.totalQty) {
      toast.error(`完工数量不能超过合同总数（${contract.totalQty}）`);
      return;
    }

    // 计算新增的完工数量
    const oldFinishedQty = contract.finishedQty || 0;
    const additionalQty = newFinishedQty - oldFinishedQty;

    // 更新合同
    contract.finishedQty = newFinishedQty;
    contract.updatedAt = new Date().toISOString();
    try {
      await upsertPurchaseContract(contract);
    } catch (e) {
      console.error("更新合同失败", e);
      toast.error("更新失败，请重试");
      return;
    }

    // 更新产品库存（如果有关联产品）
    if (contract.skuId && additionalQty > 0) {
      const product = await getProductBySkuIdFromAPI(contract.skuId);
      if (product) {
        const currentAtFactory = (product as any).at_factory || 0;
        const newAtFactory = currentAtFactory + additionalQty;
        const updatedProduct = { ...product, at_factory: newAtFactory, updatedAt: new Date().toISOString() };
        await upsertProduct(updatedProduct);

        // 记录库存变动
        addInventoryMovement({
          skuId: contract.skuId,
          skuName: product.name,
          movementType: "工厂完工",
          location: "factory",
          qty: additionalQty,
          qtyBefore: currentAtFactory,
          qtyAfter: newAtFactory,
          unitCost: contract.unitPrice,
          totalCost: additionalQty * (contract.unitPrice || 0),
          currency: (contract as any).currency || "CNY",
          relatedOrderId: contract.id,
          relatedOrderNumber: contract.contractNumber,
          relatedOrderType: "采购合同",
          operationDate: new Date().toISOString(),
          notes: `生产进度更新：完工数量 ${newFinishedQty} / ${contract.totalQty}`,
        });
      }
    }

    setEditingContractId(null);
    setEditingFinishedQty("");
    toast.success(`已更新完工数量：${newFinishedQty} / ${contract.totalQty}`);
    await mutateContracts();
  };

  // 开始编辑
  const handleStartEdit = (contract: PurchaseContract) => {
    setEditingContractId(contract.id);
    setEditingFinishedQty(String(contract.finishedQty || 0));
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingContractId(null);
    setEditingFinishedQty("");
    setEditingItemId(null);
    setEditingItemQty("");
  };

  // 按变体修改完工数：开始编辑
  const handleStartEditItem = (contractId: string, itemId: string, currentQty: number) => {
    setEditingContractId(contractId);
    setEditingItemId(itemId);
    setEditingItemQty(String(currentQty));
  };

  // 按变体修改完工数：保存
  const handleSaveItemFinishedQty = async (contractId: string, itemId: string) => {
    const qty = parseInt(editingItemQty, 10);
    if (isNaN(qty) || qty < 0) {
      toast.error("请输入有效的完工数量");
      return;
    }
    const contract = contracts.find((c) => c.id === contractId);
    if (!contract?.items) return;
    const item = contract.items.find((i: { id: string }) => i.id === itemId);
    if (!item) return;
    const maxQty = item.qty ?? 0;
    if (qty > maxQty) {
      toast.error(`该变体完工数不能超过 ${maxQty}`);
      return;
    }
    setSavingItemId(itemId);
    try {
      const res = await fetch(`/api/purchase-contracts/${contractId}/update-finished`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ itemId, finishedQty: qty }] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "更新失败");
      }
      setEditingContractId(null);
      setEditingItemId(null);
      setEditingItemQty("");
      toast.success("已更新该变体完工数");
      await mutateContracts();
    } catch (e: any) {
      toast.error(e?.message || "更新失败，请重试");
    } finally {
      setSavingItemId(null);
    }
  };

  // 提交生产完成（一键将完工数设为合同总数）
  const handleCompleteProduction = async (contractId: string) => {
    const contract = contracts.find((c) => c.id === contractId);
    if (!contract) return;
    if ((contract.finishedQty || 0) >= contract.totalQty) {
      toast.info("该合同已全部完工");
      return;
    }
    if (!confirm(`确定将「${contract.contractNumber}」标记为生产完成吗？完工数量将设为合同总数 ${contract.totalQty}。`)) return;
    setCompletingContractId(contractId);
    try {
      const res = await fetch(`/api/purchase-contracts/${contractId}/complete-production`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "提交失败");
      }
      toast.success("已提交生产完成");
      await mutateContracts();
    } catch (e: any) {
      toast.error(e?.message || "提交失败，请重试");
    } finally {
      setCompletingContractId(null);
    }
  };

  // 计算生产进度和交货时间跟进
  const contractsWithProgress = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return contracts.map((contract) => {
      const finishedQty = contract.finishedQty || 0;
      const totalQty = contract.totalQty;
      const progress = totalQty > 0 ? (finishedQty / totalQty) * 100 : 0;
      
      // 确定生产状态
      let status: ProductionStatus = "未开始";
      if (contract.status === "已取消") {
        status = "已取消";
      } else if (finishedQty >= totalQty) {
        status = "已完成";
      } else if (finishedQty > 0) {
        status = finishedQty >= totalQty * 0.5 ? "部分完成" : "生产中";
      } else if (contract.depositPaid > 0) {
        status = "生产中";
      }

      // 计算已发货数量
      const contractDeliveryOrders = deliveryOrders.filter((o) => o.contractId === contract.id);
      const shippedQty = contractDeliveryOrders.reduce((sum, o) => {
        if (o.status === "已发货" || o.status === "运输中" || o.status === "已入库") {
          return sum + o.qty;
        }
        return sum;
      }, 0);

      // 计算交货时间相关
      let daysRemaining: number | null = null;
      let isOverdue = false;
      let deliveryStatus: "正常" | "即将到期" | "已逾期" | "无交货日期" = "无交货日期";
      let followUpSuggestion = "";

      if (contract.deliveryDate) {
        const deliveryDate = new Date(contract.deliveryDate);
        deliveryDate.setHours(0, 0, 0, 0);
        const diffTime = deliveryDate.getTime() - today.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysRemaining < 0) {
          isOverdue = true;
          deliveryStatus = "已逾期";
          followUpSuggestion = `已逾期 ${Math.abs(daysRemaining)} 天，请立即跟进工厂生产情况`;
        } else if (daysRemaining <= 7) {
          deliveryStatus = "即将到期";
          followUpSuggestion = `距离交货日期还有 ${daysRemaining} 天，建议尽快跟进生产进度`;
        } else {
          deliveryStatus = "正常";
          followUpSuggestion = `距离交货日期还有 ${daysRemaining} 天，进度正常`;
        }

        // 根据进度和剩余时间给出更详细的建议
        if (progress < 50 && daysRemaining <= 14) {
          followUpSuggestion = `进度 ${progress.toFixed(1)}%，距离交货还有 ${daysRemaining} 天，建议加强跟进`;
        } else if (progress >= 80 && daysRemaining > 7) {
          followUpSuggestion = `进度 ${progress.toFixed(1)}%，预计可提前完成`;
        }
      } else {
        followUpSuggestion = "未设置交货日期，建议尽快设置以便跟进";
      }

      return {
        ...contract,
        finishedQty,
        progress,
        status,
        shippedQty,
        remainingQty: totalQty - finishedQty,
        daysRemaining,
        isOverdue,
        deliveryStatus,
        followUpSuggestion
      };
    });
  }, [contracts, deliveryOrders]);

  // 筛选合同
  const filteredContracts = useMemo(() => {
    let result = [...contractsWithProgress];

    // 搜索筛选
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(
        (c) =>
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

    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [contractsWithProgress, searchKeyword, filterStatus, filterSupplier]);

  // 统计信息
  const stats = useMemo(() => {
    const total = contractsWithProgress.length;
    const inProgress = contractsWithProgress.filter((c) => c.status === "生产中" || c.status === "部分完成").length;
    const completed = contractsWithProgress.filter((c) => c.status === "已完成").length;
    const totalFinishedQty = contractsWithProgress.reduce((sum, c) => sum + (c.finishedQty || 0), 0);
    const totalQty = contractsWithProgress.reduce((sum, c) => sum + c.totalQty, 0);
    const overallProgress = totalQty > 0 ? (totalFinishedQty / totalQty) * 100 : 0;
    const overdue = contractsWithProgress.filter((c) => c.isOverdue).length;
    const urgent = contractsWithProgress.filter((c) => c.deliveryStatus === "即将到期").length;

    return {
      total,
      inProgress,
      completed,
      totalFinishedQty,
      totalQty,
      overallProgress,
      overdue,
      urgent
    };
  }, [contractsWithProgress]);

  // 获取所有供应商（用于筛选）
  const suppliers = useMemo(() => {
    const supplierMap = new Map<string, string>();
    contracts.forEach((c) => {
      if (!supplierMap.has(c.supplierId)) {
        supplierMap.set(c.supplierId, c.supplierName);
      }
    });
    return Array.from(supplierMap.entries()).map(([id, name]) => ({ id, name }));
  }, [contracts]);

  // 状态颜色
  const statusColors: Record<ProductionStatus, string> = {
    未开始: "bg-slate-500/20 text-slate-300 border-slate-500/40",
    生产中: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    部分完成: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    已完成: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    已取消: "bg-rose-500/20 text-rose-300 border-rose-500/40"
  };

  // 状态图标
  const statusIcons: Record<ProductionStatus, typeof Clock> = {
    未开始: Clock,
    生产中: Play,
    部分完成: TrendingUp,
    已完成: CheckCircle2,
    已取消: AlertCircle
  };

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <PageHeader
        title="生产进度"
        description="跟踪所有采购合同的生产进度，实时了解工厂生产状态"
        actions={
          <Link href="/procurement/purchase-orders">
            <button className="px-4 py-2 rounded-lg border border-primary-500/40 bg-primary-500/10 text-primary-100 hover:bg-primary-500/20 hover:border-primary-500/60 font-medium transition-all duration-200 flex items-center gap-2 shadow-lg shadow-primary-500/10">
              <Factory className="h-4 w-4" />
              采购合同管理
            </button>
          </Link>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-5 backdrop-blur-sm hover:border-blue-500/50 transition-all duration-300 shadow-lg shadow-blue-500/5">
          <div className="flex items-center justify-between mb-3">
            <Package className="h-5 w-5 text-blue-400" />
            <div className="text-xs text-slate-400">合同总数</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.total}</div>
        </div>

        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-5 backdrop-blur-sm hover:border-amber-500/50 transition-all duration-300 shadow-lg shadow-amber-500/5">
          <div className="flex items-center justify-between mb-3">
            <Play className="h-5 w-5 text-amber-400" />
            <div className="text-xs text-slate-400">生产中</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.inProgress}</div>
        </div>

        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-5 backdrop-blur-sm hover:border-emerald-500/50 transition-all duration-300 shadow-lg shadow-emerald-500/5">
          <div className="flex items-center justify-between mb-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <div className="text-xs text-slate-400">已完成</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.completed}</div>
        </div>

        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-5 backdrop-blur-sm hover:border-purple-500/50 transition-all duration-300 shadow-lg shadow-purple-500/5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="h-5 w-5 text-purple-400" />
            <div className="text-xs text-slate-400">完工数量</div>
          </div>
          <div className="text-xl font-bold text-slate-100">{stats.totalFinishedQty.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-1">/ {stats.totalQty.toLocaleString()}</div>
        </div>

        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-primary-500/10 to-primary-600/5 p-5 backdrop-blur-sm hover:border-primary-500/50 transition-all duration-300 shadow-lg shadow-primary-500/5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="h-5 w-5 text-primary-400" />
            <div className="text-xs text-slate-400">整体进度</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.overallProgress.toFixed(1)}%</div>
        </div>

        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-rose-500/10 to-rose-600/5 p-5 backdrop-blur-sm hover:border-rose-500/50 transition-all duration-300 shadow-lg shadow-rose-500/5">
          <div className="flex items-center justify-between mb-3">
            <AlertCircle className="h-5 w-5 text-rose-400" />
            <div className="text-xs text-slate-400">已逾期</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.overdue}</div>
        </div>

        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-5 backdrop-blur-sm hover:border-amber-500/50 transition-all duration-300 shadow-lg shadow-amber-500/5">
          <div className="flex items-center justify-between mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <div className="text-xs text-slate-400">即将到期</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.urgent}</div>
          <div className="text-xs text-slate-400 mt-1">7天内到期</div>
        </div>
      </div>

      {/* 筛选区域 */}
      <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">搜索</label>
            <div className="relative">
              <input
                type="text"
                placeholder="合同编号、供应商、SKU..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full pl-10 rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
              />
              <Package className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">生产状态</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
            >
              <option value="all">全部状态</option>
              <option value="未开始">未开始</option>
              <option value="生产中">生产中</option>
              <option value="部分完成">部分完成</option>
              <option value="已完成">已完成</option>
              <option value="已取消">已取消</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">供应商</label>
            <select
              value={filterSupplier}
              onChange={(e) => setFilterSupplier(e.target.value)}
              className="w-full rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
            >
              <option value="all">全部供应商</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 生产进度列表 */}
      <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 overflow-hidden backdrop-blur-sm shadow-xl">
        <div className="p-5 border-b border-slate-800/50 bg-slate-900/40">
          <h2 className="text-lg font-semibold text-slate-100">生产进度列表</h2>
        </div>

        {filteredContracts.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              icon={Factory}
              title="暂无生产进度"
              description={contracts.length === 0 ? "还没有创建采购合同" : "没有找到匹配的合同"}
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {filteredContracts.map((contract) => {
              const StatusIcon = statusIcons[contract.status];
              return (
                <div
                  key={contract.id}
                  className={`p-5 hover:bg-slate-800/40 transition-all duration-200 group ${
                    contract.isOverdue 
                      ? "border-l-4 border-rose-500 bg-rose-500/5" 
                      : contract.deliveryStatus === "即将到期"
                      ? "border-l-4 border-amber-500 bg-amber-500/5"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* 左侧：基本信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded-lg ${statusColors[contract.status]}`}>
                          <StatusIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-100 group-hover:text-primary-300 transition-colors">
                              {contract.contractNumber}
                            </h3>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${statusColors[contract.status]}`}>
                              {contract.status}
                            </span>
                          </div>
                          <p className="text-sm text-slate-400 mt-1">
                            {contract.supplierName} · {contract.sku}
                          </p>
                        </div>
                      </div>

                      {/* 进度条 */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                          <span>生产进度</span>
                          <div className="flex items-center gap-2">
                            {editingContractId === contract.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={contract.totalQty}
                                  value={editingFinishedQty}
                                  onChange={(e) => setEditingFinishedQty(e.target.value)}
                                  className="w-20 px-2 py-1 rounded border border-slate-700 bg-slate-800 text-slate-100 text-xs focus:border-primary-500 focus:outline-none"
                                  autoFocus
                                />
                                <span className="text-slate-500">/ {contract.totalQty}</span>
                                <button
                                  onClick={() => handleUpdateFinishedQty(contract.id)}
                                  className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-colors"
                                  title="保存"
                                >
                                  <Save className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-300 transition-colors"
                                  title="取消"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="font-semibold text-slate-300">
                                  {contract.finishedQty} / {contract.totalQty} ({contract.progress.toFixed(1)}%)
                                </span>
                                {(contract.finishedQty || 0) < contract.totalQty && contract.status !== "已取消" && (
                                  <button
                                    onClick={() => handleCompleteProduction(contract.id)}
                                    disabled={completingContractId === contract.id}
                                    className="px-2 py-1 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="提交生产完成"
                                  >
                                    {completingContractId === contract.id ? "提交中…" : "生产完成"}
                                  </button>
                                )}
                                {(!contract.items || contract.items.length === 0) && (
                                  <button
                                    onClick={() => handleStartEdit(contract as PurchaseContract)}
                                    className="px-2 py-1 rounded text-xs font-medium bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 border border-primary-500/40 transition-colors flex items-center gap-1"
                                    title="更新完工数量"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                    修改完工数
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="w-full h-2 bg-slate-800/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-500"
                            style={{ width: `${Math.min(contract.progress, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* 变体生产数量（多 SKU 时按变体展示） */}
                      {contract.items && contract.items.length > 0 ? (
                        <div className="mb-3 rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
                          <div className="px-3 py-2 border-b border-slate-700/50 text-xs font-medium text-slate-400">
                            变体生产数量
                          </div>
                          <div className="divide-y divide-slate-700/50">
                            {contract.items.map((item: { id: string; sku: string; skuName?: string; spuName?: string; qty: number; finishedQty: number }) => {
                              const itemFinished = item.finishedQty ?? 0;
                              const itemTotal = item.qty ?? 0;
                              const itemProgress = itemTotal > 0 ? (itemFinished / itemTotal) * 100 : 0;
                              const label = [item.spuName, item.skuName || item.sku].filter(Boolean).join(" · ") || item.sku;
                              const isEditing = editingContractId === contract.id && editingItemId === item.id;
                              const isSaving = savingItemId === item.id;
                              return (
                                <div
                                  key={item.id}
                                  className="px-3 py-2 flex items-center justify-between gap-3 text-sm"
                                >
                                  <span className="text-slate-300 truncate min-w-0" title={label}>
                                    {label}
                                  </span>
                                  {isEditing ? (
                                    <div className="flex items-center gap-2 shrink-0">
                                      <input
                                        type="number"
                                        min={0}
                                        max={itemTotal}
                                        value={editingItemQty}
                                        onChange={(e) => setEditingItemQty(e.target.value)}
                                        className="w-16 px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-100 text-xs focus:border-primary-500 focus:outline-none"
                                        autoFocus
                                      />
                                      <span className="text-slate-500 text-xs">/ {itemTotal}</span>
                                      <button
                                        onClick={() => handleSaveItemFinishedQty(contract.id, item.id)}
                                        disabled={isSaving}
                                        className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-50"
                                        title="保存"
                                      >
                                        <Save className="h-3 w-3" />
                                      </button>
                                      <button
                                        onClick={handleCancelEdit}
                                        className="p-1 rounded hover:bg-slate-600 text-slate-400"
                                        title="取消"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 shrink-0 flex items-center gap-2">
                                      <span>
                                        <span className={itemFinished >= itemTotal ? "text-emerald-400" : "text-amber-400/90"}>
                                          {itemFinished}
                                        </span>
                                        <span className="text-slate-500"> / </span>
                                        <span className="text-slate-300">{itemTotal}</span>
                                        <span className="text-slate-500 text-xs ml-1">
                                          ({itemProgress.toFixed(0)}%)
                                        </span>
                                      </span>
                                      {contract.status !== "已取消" && (
                                        <button
                                          onClick={() => handleStartEditItem(contract.id, item.id, itemFinished)}
                                          className="p-1 rounded hover:bg-primary-500/20 text-primary-400"
                                          title="修改该变体完工数"
                                        >
                                          <Edit2 className="h-3 w-3" />
                                        </button>
                                      )}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {/* 详细信息 */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                        <div>
                          <span className="text-slate-400">合同数量：</span>
                          <span className="text-slate-200 font-medium ml-1">{contract.totalQty.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">完工数量：</span>
                          <span className="text-emerald-300 font-medium ml-1">{contract.finishedQty.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">已发货：</span>
                          <span className="text-blue-300 font-medium ml-1">{contract.shippedQty.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">剩余数量：</span>
                          <span className="text-amber-300 font-medium ml-1">{contract.remainingQty.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* 提前完工时显示生产天数（从下单当天起算） */}
                      {contract.status === "已完成" && contract.createdAt && (() => {
                        const orderDate = new Date(contract.createdAt);
                        orderDate.setHours(0, 0, 0, 0);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const productionDays = Math.max(0, Math.round((today.getTime() - orderDate.getTime()) / (24 * 60 * 60 * 1000)));
                        return (
                          <div className="mt-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                            <div className="text-sm text-emerald-200">
                              <span className="font-medium">生产天数：</span>
                              <span className="font-semibold">{productionDays}</span> 天
                              <span className="text-emerald-300/80 ml-1">（自下单日 {formatDate(contract.createdAt)} 起）</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* 交货时间跟进 */}
                      {contract.deliveryDate && (
                        <div className={`mt-3 p-3 rounded-lg border ${
                          contract.isOverdue 
                            ? "bg-rose-500/10 border-rose-500/30" 
                            : contract.deliveryStatus === "即将到期"
                            ? "bg-amber-500/10 border-amber-500/30"
                            : "bg-slate-800/30 border-slate-700/50"
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Calendar className={`h-4 w-4 ${
                                contract.isOverdue ? "text-rose-400" : contract.deliveryStatus === "即将到期" ? "text-amber-400" : "text-slate-400"
                              }`} />
                              <span className="text-sm font-medium text-slate-300">交货日期：</span>
                              <span className="text-sm text-slate-200">{formatDate(contract.deliveryDate)}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              contract.isOverdue
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                : contract.deliveryStatus === "即将到期"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            }`}>
                              {contract.isOverdue 
                                ? `已逾期 ${contract.daysRemaining ? Math.abs(contract.daysRemaining) : 0} 天`
                                : contract.daysRemaining !== null
                                ? `剩余 ${contract.daysRemaining} 天`
                                : "无日期"}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {contract.followUpSuggestion}
                          </div>
                        </div>
                      )}

                      {!contract.deliveryDate && (
                        <div className="mt-3 p-3 rounded-lg border border-slate-700/50 bg-slate-800/20">
                          <div className="flex items-center gap-2 text-sm text-slate-400">
                            <AlertCircle className="h-4 w-4" />
                            <span>未设置交货日期，建议在合同详情中设置以便跟进生产进度</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 右侧：操作按钮 */}
                    <div className="flex items-center gap-2">
                      <Link href={`/procurement/purchase-orders?contractId=${contract.id}`}>
                        <button className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:border-slate-600 hover:text-white transition-all duration-200 text-sm font-medium">
                          查看详情
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
