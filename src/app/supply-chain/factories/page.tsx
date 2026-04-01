"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import type { BankAccount } from "@/lib/finance-store";
import { getOrderTracking, getBatchReceipts, getDocuments, type OrderTracking, type BatchReceipt, type Document } from "@/lib/supply-chain-store";
import type { Store } from "@/lib/store-store";
import { getCashFlowFromAPI, type CashFlow } from "@/lib/cash-flow-store";
import { getLegacyPurchaseOrdersFromAPI, type LegacyPurchaseOrder } from "@/lib/purchase-contracts-store";
import { useSystemConfirm } from "@/hooks/use-system-confirm";

type PurchaseOrder = LegacyPurchaseOrder;

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatDate = (d: string) => new Date(d).toISOString().slice(0, 10);

const arrayFetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : (j?.data ?? []);
};
const SWR_OPT = { revalidateOnFocus: false, dedupingInterval: 600000, keepPreviousData: true };

const cashFlowFetcher = () => getCashFlowFromAPI();

export default function FactoriesPage() {
  const { confirm, confirmDialog } = useSystemConfirm();
  const { data: accounts = [] } = useSWR<BankAccount[]>("/api/accounts?page=1&pageSize=500", arrayFetcher, SWR_OPT);
  const { data: stores = [] } = useSWR<Store[]>("/api/stores?page=1&pageSize=500", arrayFetcher, SWR_OPT);
  const { data: cashFlow = [] } = useSWR<CashFlow[]>("factories-cash-flow", cashFlowFetcher, SWR_OPT);
  const { data: purchaseOrders = [], mutate: mutatePurchaseOrders } = useSWR<PurchaseOrder[]>("factories-legacy-po", getLegacyPurchaseOrdersFromAPI, SWR_OPT);

  const [orderTracking, setOrderTracking] = useState<OrderTracking[]>([]);
  const [batchReceipts, setBatchReceipts] = useState<BatchReceipt[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"dashboard" | "tracking" | "restock" | "documents">("dashboard");

  useEffect(() => {
    setOrderTracking(getOrderTracking());
    setBatchReceipts(getBatchReceipts());
    setDocuments(getDocuments());
  }, []);

  // 获取所有供应商列表
  const suppliers = useMemo(() => {
    const supplierSet = new Set<string>();
    purchaseOrders.forEach((po) => {
      supplierSet.add(po.supplierId);
    });
    return Array.from(supplierSet).map((id) => {
      const firstPo = purchaseOrders.find((po) => po.supplierId === id);
      return {
        id,
        name: firstPo?.supplierName || "未知供应商"
      };
    });
  }, [purchaseOrders]);

  // 按供应商分组统计
  const factoryStats = useMemo(() => {
    const stats: Record<
      string,
      {
        supplierId: string;
        supplierName: string;
        totalPrepaid: number; // 总预付（已付定金）
        prepaidBalance: number; // 预付账款余额（已付定金 - 已收货对应的定金部分）
        stockValue: number; // 存量货值（已付款未提货的部分）
        pendingQuantity: number; // 待拿货数量
        pendingValue: number; // 待拿货总货值
        overdueOrders: number; // 逾期未交货订单数
        orders: PurchaseOrder[];
      }
    > = {};

    purchaseOrders.forEach((po) => {
      if (!stats[po.supplierId]) {
        stats[po.supplierId] = {
          supplierId: po.supplierId,
          supplierName: po.supplierName,
          totalPrepaid: 0,
          prepaidBalance: 0,
          stockValue: 0,
          pendingQuantity: 0,
          pendingValue: 0,
          overdueOrders: 0,
          orders: []
        };
      }

      const stat = stats[po.supplierId];
      stat.orders.push(po);

      // 总预付（已付定金）
      stat.totalPrepaid += po.depositPaid || 0;

      // 待拿货数量 = 订单数量 - 已到货数量
      const pendingQty = Math.max(0, po.quantity - (po.receivedQty || 0));
      stat.pendingQuantity += pendingQty;

      // 待拿货货值：有明细时按各 SKU（待拿货数量 × 单价）汇总；否则按总额比例或 数量×单价
      const pendingValue = (() => {
        const items = (po as { items?: Array<{ qty: number; pickedQty: number; unitPrice: number }> }).items;
        if (items && items.length > 0) {
          return items.reduce(
            (sum, item) => sum + Math.max(0, item.qty - (item.pickedQty ?? 0)) * item.unitPrice,
            0
          );
        }
        if (po.quantity > 0 && (po.totalAmount ?? 0) > 0) {
          return (po.totalAmount! * pendingQty) / po.quantity;
        }
        return pendingQty * po.unitPrice;
      })();
      stat.pendingValue += pendingValue;

      // 存量货值 = 已付款但未提货的货值
      // 计算已付款金额（定金 + 已付尾款）
      const paidDeposit = po.depositPaid || 0;
      const paidTails = po.receipts.reduce((sum, receipt) => {
        const isPaid = cashFlow.some(
          (flow) => flow.type === "expense" && flow.relatedId === receipt.id && Math.abs(flow.amount - receipt.tailAmount) < 0.01
        );
        return isPaid ? sum + receipt.tailAmount : sum;
      }, 0);
      const totalPaid = paidDeposit + paidTails;
      
      // 已收货对应的付款比例
      const receivedRatio = po.quantity > 0 ? (po.receivedQty || 0) / po.quantity : 0;
      const receivedPaidValue = totalPaid * receivedRatio;
      
      // 存量货值 = 已付款 - 已收货对应的付款
      stat.stockValue += Math.max(0, totalPaid - receivedPaidValue);

      // 预付账款余额 = 已付定金 - 已收货对应的定金部分
      const receivedDepositValue = (po.depositAmount || 0) * receivedRatio;
      stat.prepaidBalance += Math.max(0, paidDeposit - receivedDepositValue);

      // 检查是否逾期未交货（订单已创建但未完全收货，且超过预期交货时间）
      const orderAge = (new Date().getTime() - new Date(po.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (po.status !== "收货完成，待结清" && po.status !== "已清款" && pendingQty > 0 && orderAge > 30) {
        stat.overdueOrders += 1;
      }
    });

    return Object.values(stats);
  }, [purchaseOrders, cashFlow]);

  // 筛选后的工厂统计
  const filteredFactoryStats = useMemo(() => {
    if (selectedSupplierId === "all") return factoryStats;
    return factoryStats.filter((stat) => stat.supplierId === selectedSupplierId);
  }, [factoryStats, selectedSupplierId]);

  // 汇总数据
  const summary = useMemo(() => {
    return filteredFactoryStats.reduce(
      (acc, stat) => ({
        totalPrepaid: acc.totalPrepaid + stat.totalPrepaid,
        totalPrepaidBalance: acc.totalPrepaidBalance + stat.prepaidBalance,
        totalStockValue: acc.totalStockValue + stat.stockValue,
        totalPendingQuantity: acc.totalPendingQuantity + stat.pendingQuantity,
        totalPendingValue: acc.totalPendingValue + stat.pendingValue,
        totalOverdueOrders: acc.totalOverdueOrders + stat.overdueOrders
      }),
      {
        totalPrepaid: 0,
        totalPrepaidBalance: 0,
        totalStockValue: 0,
        totalPendingQuantity: 0,
        totalPendingValue: 0,
        totalOverdueOrders: 0
      }
    );
  }, [filteredFactoryStats]);

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
        const items = (po as { items?: Array<{ qty: number; pickedQty: number; unitPrice: number }> }).items;
        const pv =
          items && items.length > 0
            ? items.reduce((s, item) => s + Math.max(0, item.qty - (item.pickedQty ?? 0)) * item.unitPrice, 0)
            : po.quantity > 0 && (po.totalAmount ?? 0) > 0
              ? (po.totalAmount! * pendingQty) / po.quantity
              : pendingQty * po.unitPrice;
        alerts.push({
          poId: po.id,
          poNumber: po.poNumber,
          supplierName: po.supplierName,
          pendingQuantity: pendingQty,
          pendingValue: pv
        });
      }
    });

    return alerts;
  }, [purchaseOrders, cashFlow]);

  // 资产待回收提醒汇总
  const totalAssetRecoveryValue = useMemo(() => {
    return assetRecoveryAlerts.reduce((sum, alert) => sum + alert.pendingValue, 0);
  }, [assetRecoveryAlerts]);

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">工厂端管理</h1>
          <p className="mt-1 text-sm text-slate-400">深度追踪供应链资产，监控工厂预付、待拿货及逾期订单情况。</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/finance"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            财务看板
          </Link>
          <Link
            href="/procurement/purchase-orders"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            采购订单
          </Link>
        </div>
      </header>

      {/* 资产待回收提醒 */}
      {assetRecoveryAlerts.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <h2 className="text-sm font-semibold text-amber-200">资产待回收提醒</h2>
          </div>
          <p className="text-xs text-amber-300/80 mb-3">
            发现 {assetRecoveryAlerts.length} 笔订单已清款但仍有待拿货数量，待回收资产总额：{currency(totalAssetRecoveryValue)}
          </p>
          <div className="space-y-2">
            {assetRecoveryAlerts.map((alert) => (
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
          </div>
        </section>
      )}

      {/* 标签页导航 */}
      <section className="flex gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "dashboard"
              ? "border-b-2 border-primary-500 text-primary-300"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          工厂资产看板
        </button>
        <button
          onClick={() => setActiveTab("tracking")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "tracking"
              ? "border-b-2 border-primary-500 text-primary-300"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          动态订单追踪
        </button>
        <button
          onClick={() => setActiveTab("restock")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "restock"
              ? "border-b-2 border-primary-500 text-primary-300"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          智能补货建议
        </button>
        <button
          onClick={() => setActiveTab("documents")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "documents"
              ? "border-b-2 border-primary-500 text-primary-300"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          文档关联中心
        </button>
      </section>

      {/* 工厂资产看板 */}
      {activeTab === "dashboard" && (
        <>
          {/* 核心看板 */}
          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">工厂总预付</div>
              <div className="mt-2 text-2xl font-semibold text-blue-300">{currency(summary.totalPrepaid)}</div>
              <div className="mt-2 text-[11px] text-slate-500">所有工厂已付定金总额</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">预付账款余额</div>
              <div className="mt-2 text-2xl font-semibold text-purple-300">{currency(summary.totalPrepaidBalance)}</div>
              <div className="mt-2 text-[11px] text-slate-500">已付定金 - 已收货对应定金</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">存量货值</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-300">{currency(summary.totalStockValue)}</div>
              <div className="mt-2 text-[11px] text-slate-500">已付款未提货的货值</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">待拿货总货值</div>
              <div className="mt-2 text-2xl font-semibold text-amber-300">{currency(summary.totalPendingValue)}</div>
              <div className="mt-2 text-[11px] text-slate-500">
                待拿货数量：{summary.totalPendingQuantity} 件
              </div>
            </div>
          </section>
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">逾期未交货订单数</div>
              <div className="mt-2 text-2xl font-semibold text-rose-300">{summary.totalOverdueOrders}</div>
              <div className="mt-2 text-[11px] text-slate-500">超过30天未完全交货</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">资产待回收</div>
              <div className="mt-2 text-2xl font-semibold text-amber-300">{assetRecoveryAlerts.length}</div>
              <div className="mt-2 text-[11px] text-slate-500">已清款但未完全收货</div>
            </div>
          </section>
        </>
      )}

      {/* 工厂筛选 */}
      <section className="flex gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">筛选工厂：</span>
          <select
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部工厂</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* 工厂明细表格 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-4 text-sm font-medium text-slate-100">工厂明细</h2>
        {filteredFactoryStats.length === 0 ? (
          <div className="text-sm text-slate-500">暂无工厂数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">工厂名称</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">总预付</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">预付账款余额</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">存量货值</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">待拿货数量</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">待拿货货值</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-400">逾期订单数</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-400">订单总数</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-400">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredFactoryStats.map((stat) => (
                  <tr key={stat.supplierId} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-3 py-3 font-medium text-slate-200">{stat.supplierName}</td>
                    <td className="px-3 py-3 text-right font-semibold text-blue-300">
                      {currency(stat.totalPrepaid)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-purple-300">
                      {currency(stat.prepaidBalance)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-300">
                      {currency(stat.stockValue)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-300">{stat.pendingQuantity} 件</td>
                    <td className="px-3 py-3 text-right font-semibold text-amber-300">
                      {currency(stat.pendingValue)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {stat.overdueOrders > 0 ? (
                        <span className="text-rose-400 font-medium">{stat.overdueOrders}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-400">{stat.orders.length}</td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => {
                          setSelectedSupplierId(stat.supplierId);
                          setActiveTab("tracking");
                        }}
                        className="rounded-md bg-primary-500/10 border border-primary-500/40 px-2 py-1 text-xs text-primary-300 hover:bg-primary-500/20"
                      >
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 详细订单列表（按工厂分组） */}
      {selectedSupplierId !== "all" && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-4 text-sm font-medium text-slate-100">订单明细</h2>
          {filteredFactoryStats.length > 0 && (
            <div className="space-y-4">
              {filteredFactoryStats[0].orders.map((po) => {
                const pendingQty = Math.max(0, po.quantity - (po.receivedQty || 0));
                const poItems = (po as { items?: Array<{ qty: number; pickedQty: number; unitPrice: number }> }).items;
                const pendingValue =
                  poItems && poItems.length > 0
                    ? poItems.reduce((s, item) => s + Math.max(0, item.qty - (item.pickedQty ?? 0)) * item.unitPrice, 0)
                    : po.quantity > 0 && (po.totalAmount ?? 0) > 0
                      ? (po.totalAmount! * pendingQty) / po.quantity
                      : pendingQty * po.unitPrice;
                const unpaidDeposit = po.depositAmount - (po.depositPaid || 0);
                const allTailsPaid = po.receipts.every((receipt) => {
                  return cashFlow.some(
                    (flow) => flow.type === "expense" && flow.relatedId === receipt.id && Math.abs(flow.amount - receipt.tailAmount) < 0.01
                  );
                });
                const isFullyPaid = unpaidDeposit <= 0 && allTailsPaid;

                return (
                  <div key={po.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-sm font-medium text-slate-100">{po.poNumber}</div>
                        <div className="text-xs text-slate-400 mt-1">{po.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-100">{currency(po.totalAmount)}</div>
                        <div className="text-xs text-slate-400 mt-1">订单总额</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-slate-400">订单数量</div>
                        <div className="text-slate-200 mt-1">{po.quantity} 件</div>
                      </div>
                      <div>
                        <div className="text-slate-400">已到货</div>
                        <div className="text-emerald-300 mt-1">{po.receivedQty || 0} 件</div>
                      </div>
                      <div>
                        <div className="text-slate-400">待拿货</div>
                        <div className="text-amber-300 mt-1 font-medium">
                          {pendingQty} 件 ({currency(pendingValue)})
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">状态</div>
                        <div className={`mt-1 ${
                          isFullyPaid && pendingQty > 0
                            ? "text-amber-400"
                            : po.status === "已清款"
                              ? "text-emerald-400"
                              : "text-slate-300"
                        }`}>
                          {isFullyPaid && pendingQty > 0 ? "已清款·待收货" : po.status}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 动态订单追踪 */}
      {activeTab === "tracking" && (
        <div className="space-y-4">
          <section className="flex gap-3 items-center flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">筛选工厂：</span>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400"
              >
                <option value="all">全部工厂</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="mb-4 text-sm font-medium text-slate-100">订单全链条追踪</h2>
            {purchaseOrders
              .filter((po) => selectedSupplierId === "all" || po.supplierId === selectedSupplierId)
              .map((po) => {
                const tracking = orderTracking.filter((t) => t.poId === po.id);
                const latestStatus = (po as any).orderStatus || "采购中";
                const pendingQty = Math.max(0, po.quantity - (po.receivedQty || 0));
                const batchReceiptsForPO = batchReceipts.filter((br) => br.poId === po.id);

                return (
                  <div key={po.id} className="mb-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-sm font-medium text-slate-100">{po.poNumber}</div>
                        <div className="text-xs text-slate-400 mt-1">{po.supplierName} · {po.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">订单数量</div>
                        <div className="text-sm font-semibold text-slate-200">{po.quantity} 件</div>
                      </div>
                    </div>

                    {/* 状态时间轴 */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full ${
                          latestStatus === "已完成" ? "bg-emerald-500" :
                          latestStatus === "已到货" ? "bg-blue-500" :
                          latestStatus === "部分到货" ? "bg-amber-500" :
                          latestStatus === "已发货" ? "bg-purple-500" :
                          latestStatus === "生产中" ? "bg-orange-500" :
                          "bg-slate-500"
                        }`}></div>
                        <span className="text-slate-300 font-medium">当前状态：{latestStatus}</span>
                      </div>
                      {tracking.length > 0 && (
                        <div className="mt-2 ml-4 space-y-1">
                          {tracking.map((t) => (
                            <div key={t.id} className="text-xs text-slate-400">
                              {formatDate(t.statusDate)} - {t.status} {t.notes && `(${t.notes})`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 分批拿货记录 */}
                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-slate-400">分批拿货记录：</div>
                        {pendingQty > 0 && (
                          <button
                            onClick={() => {
                              const qtyStr = prompt(`本次拿货数量（剩余：${pendingQty} 件）：`);
                              const qty = Number(qtyStr);
                              if (Number.isNaN(qty) || qty <= 0 || qty > pendingQty) {
                                alert("请输入有效的数量");
                                return;
                              }
                              
                              // 选择货权归属店铺
                              const storeOptions = stores.map((s) => `${s.name} (${s.country})`).join("\n");
                              const storeChoice = prompt(`选择货权归属店铺（输入店铺名称）：\n${storeOptions}`);
                              const selectedStore = stores.find((s) => storeChoice && s.name.includes(storeChoice));
                              
                              if (!selectedStore) {
                                alert("未找到匹配的店铺");
                                return;
                              }

                              // 创建分批拿货记录
                              const { getBatchReceipts, saveBatchReceipts } = require("@/lib/supply-chain-store");
                              const receiptId = po.receipts[po.receipts.length - 1]?.id || crypto.randomUUID();
                              const newBatchReceipt = {
                                id: crypto.randomUUID(),
                                poId: po.id,
                                receiptId,
                                qty,
                                receivedQty: qty,
                                ownership: [{
                                  storeId: selectedStore.id,
                                  storeName: selectedStore.name,
                                  percentage: 100
                                }],
                                receivedDate: new Date().toISOString().slice(0, 10),
                                createdAt: new Date().toISOString()
                              };
                              
                              const allBatchReceipts = getBatchReceipts();
                              allBatchReceipts.push(newBatchReceipt);
                              saveBatchReceipts(allBatchReceipts);
                              setBatchReceipts(allBatchReceipts);
                              
                              // 更新采购订单的已收货数量（仅本地状态，分批拿货来自 supply-chain-store）
                              const updatedPOs = purchaseOrders.map((p) =>
                                p.id === po.id ? { ...p, receivedQty: (p.receivedQty || 0) + qty } : p
                              );
                              mutatePurchaseOrders(updatedPOs, false);
                              
                              alert("分批拿货记录已创建");
                            }}
                            className="text-xs text-primary-400 hover:text-primary-300"
                          >
                            + 记录分批拿货
                          </button>
                        )}
                      </div>
                      {batchReceiptsForPO.length > 0 ? (
                        <div className="space-y-2">
                          {batchReceiptsForPO.map((br) => (
                            <div key={br.id} className="text-xs bg-slate-800/40 rounded p-2">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-300">本次拿货：{br.qty} 件</span>
                                <span className="text-slate-400">{formatDate(br.receivedDate)}</span>
                              </div>
                              {br.ownership.length > 0 && (
                                <div className="mt-1 text-slate-500">
                                  货权归属：{br.ownership.map((o) => `${o.storeName} ${o.percentage}%`).join(", ")}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">暂无分批拿货记录</div>
                      )}
                    </div>

                    {/* 剩余数量 */}
                    {pendingQty > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-800">
                        <div className="text-xs text-amber-400">
                          剩余待拿货：{pendingQty} 件（货值：{currency(
                            (() => {
                              const it = (po as { items?: Array<{ qty: number; pickedQty: number; unitPrice: number }> }).items;
                              if (it && it.length > 0) {
                                return it.reduce((s, item) => s + Math.max(0, item.qty - (item.pickedQty ?? 0)) * item.unitPrice, 0);
                              }
                              return po.quantity > 0 && (po.totalAmount ?? 0) > 0
                                ? (po.totalAmount! * pendingQty) / po.quantity
                                : pendingQty * po.unitPrice;
                            })()
                          )}）
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </section>
        </div>
      )}

      {/* 智能补货建议 */}
      {activeTab === "restock" && (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="mb-4 text-sm font-medium text-slate-100">智能补货建议</h2>
            <p className="text-xs text-slate-400 mb-4">
              根据各站点销售速度和在途货量，自动计算补货需求
            </p>
            <div className="space-y-3">
              {stores.map((store) => {
                // 简化计算：假设日均销量为10件，当前库存为100件，在途50件
                // 实际应该从销售数据中获取
                const dailySales = 10; // 日均销量（示例数据）
                const currentStock = 100; // 当前库存（示例数据）
                const inTransitQty = purchaseOrders
                  .filter((po) => (po as any).orderStatus === "已发货" || (po as any).orderStatus === "部分到货")
                  .reduce((sum, po) => {
                    const pendingQty = Math.max(0, po.quantity - (po.receivedQty || 0));
                    return sum + pendingQty;
                  }, 0);
                const daysUntilStockout = dailySales > 0 ? Math.floor((currentStock + inTransitQty) / dailySales) : 999;
                const recommendedRestock = daysUntilStockout < 30 ? Math.max(0, dailySales * 60 - currentStock - inTransitQty) : 0;

                return (
                  <div key={store.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-sm font-medium text-slate-100">{store.name}</div>
                        <div className="text-xs text-slate-400 mt-1">{store.platform} · {store.country}</div>
                      </div>
                      {daysUntilStockout < 30 && (
                        <span className="text-xs font-medium text-rose-400 bg-rose-500/10 px-2 py-1 rounded">
                          需补货
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-slate-400">日均销量</div>
                        <div className="text-slate-200 mt-1">{dailySales} 件/天</div>
                      </div>
                      <div>
                        <div className="text-slate-400">当前库存</div>
                        <div className="text-emerald-300 mt-1">{currentStock} 件</div>
                      </div>
                      <div>
                        <div className="text-slate-400">在途数量</div>
                        <div className="text-blue-300 mt-1">{inTransitQty} 件</div>
                      </div>
                      <div>
                        <div className="text-slate-400">预计断货天数</div>
                        <div className={`mt-1 font-medium ${
                          daysUntilStockout < 7 ? "text-rose-400" :
                          daysUntilStockout < 30 ? "text-amber-400" :
                          "text-slate-300"
                        }`}>
                          {daysUntilStockout} 天
                        </div>
                      </div>
                    </div>
                    {recommendedRestock > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-800">
                        <div className="text-xs text-amber-400 font-medium">
                          建议补货：{recommendedRestock} 件（保证60天不断货）
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* 文档关联中心 */}
      {activeTab === "documents" && (
        <div className="space-y-4">
          <section className="flex gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">筛选类型：</span>
              <select
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400"
                onChange={(e) => {
                  // 可以添加筛选逻辑
                }}
              >
                <option value="all">全部文档</option>
                <option value="factory">工厂文档</option>
                <option value="order">订单文档</option>
              </select>
            </div>
            <button
              onClick={() => {
                // 可以添加上传文档功能
                alert("文档上传功能开发中");
              }}
              className="rounded-md bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              上传文档
            </button>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="mb-4 text-sm font-medium text-slate-100">文档列表</h2>
            {documents.length === 0 ? (
              <div className="text-sm text-slate-500">暂无文档</div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => {
                  const entityName = doc.entityType === "factory"
                    ? suppliers.find((s) => s.id === doc.entityId)?.name || "未知工厂"
                    : purchaseOrders.find((po) => po.id === doc.entityId)?.poNumber || "未知订单";

                  return (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">
                          {doc.type === "contract" ? "📄" : doc.type === "invoice" ? "🧾" : doc.type === "packing_list" ? "📦" : "📎"}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-100">{doc.name}</div>
                          <div className="text-xs text-slate-400 mt-1">
                            {doc.entityType === "factory" ? "工厂" : "订单"}：{entityName} · {formatDate(doc.uploadDate)}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (await confirm({ title: "删除确认", message: "确定要删除这个文档吗？", type: "danger" })) {
                            const { deleteDocument, getDocuments } = require("@/lib/supply-chain-store");
                            await deleteDocument(doc.id);
                            setDocuments(getDocuments());
                          }
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300"
                      >
                        删除
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
