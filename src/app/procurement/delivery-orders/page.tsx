"use client";

import { useEffect, useMemo, useState } from "react";
import { getDeliveryOrders, type DeliveryOrder } from "@/lib/delivery-orders-store";
import { getPurchaseContracts, type PurchaseContract } from "@/lib/purchase-contracts-store";
import { formatCurrency } from "@/lib/currency-utils";
import { Truck, Search, X, Download, Eye, Package } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateString;
  }
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "待发货": { bg: "bg-slate-500/20", text: "text-slate-300" },
  "已发货": { bg: "bg-blue-500/20", text: "text-blue-300" },
  "运输中": { bg: "bg-amber-500/20", text: "text-amber-300" },
  "已入库": { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  "已取消": { bg: "bg-rose-500/20", text: "text-rose-300" }
};

export default function DeliveryOrdersPage() {
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [contracts, setContracts] = useState<PurchaseContract[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadedOrders = getDeliveryOrders();
    setDeliveryOrders(loadedOrders);
    const loadedContracts = getPurchaseContracts();
    setContracts(loadedContracts);
  }, []);

  // 筛选和排序拿货单
  const filteredOrders = useMemo(() => {
    let result = [...deliveryOrders];

    // 状态筛选
    if (filterStatus !== "all") {
      result = result.filter((o) => o.status === filterStatus);
    }

    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((o) => {
        const contract = contracts.find((c) => c.id === o.contractId);
        return (
          o.deliveryNumber.toLowerCase().includes(keyword) ||
          o.contractNumber.toLowerCase().includes(keyword) ||
          contract?.supplierName?.toLowerCase().includes(keyword) ||
          contract?.sku?.toLowerCase().includes(keyword) ||
          o.domesticTrackingNumber?.toLowerCase().includes(keyword)
        );
      });
    }

    // 按创建时间倒序
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return result;
  }, [deliveryOrders, contracts, searchKeyword, filterStatus]);

  // 统计信息
  const stats = useMemo(() => {
    const totalCount = deliveryOrders.length;
    const pendingCount = deliveryOrders.filter((o) => o.status === "待发货").length;
    const inTransitCount = deliveryOrders.filter((o) => o.status === "运输中").length;
    const completedCount = deliveryOrders.filter((o) => o.status === "已入库").length;
    const totalQty = deliveryOrders.reduce((sum, o) => sum + o.qty, 0);
    const totalTailAmount = deliveryOrders.reduce((sum, o) => sum + o.tailAmount, 0);
    const totalTailPaid = deliveryOrders.reduce((sum, o) => sum + (o.tailPaid || 0), 0);

    return {
      totalCount,
      pendingCount,
      inTransitCount,
      completedCount,
      totalQty,
      totalTailAmount,
      totalTailPaid
    };
  }, [deliveryOrders]);

  // 导出数据
  const handleExportData = () => {
    if (filteredOrders.length === 0) {
      toast.error("没有可导出的数据", { icon: "⚠️", duration: 2000 });
      return;
    }

    const headers = [
      "拿货单号",
      "合同编号",
      "供应商",
      "SKU",
      "数量",
      "状态",
      "尾款金额",
      "已付尾款",
      "尾款到期日",
      "国内物流单号",
      "发货日期",
      "创建时间"
    ];

    const rows = filteredOrders.map((order) => {
      const contract = contracts.find((c) => c.id === order.contractId);
      return [
        order.deliveryNumber,
        order.contractNumber,
        contract?.supplierName || "-",
        contract?.sku || "-",
        String(order.qty),
        order.status,
        String(formatCurrency(order.tailAmount || 0, "CNY", "expense") || "").replace("¥", "").replace(",", ""),
        String(formatCurrency(order.tailPaid || 0, "CNY", "expense") || "").replace("¥", "").replace(",", ""),
        order.tailDueDate || "-",
        order.domesticTrackingNumber || "-",
        order.shippedDate || "-",
        formatDate(order.createdAt)
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
    link.setAttribute("download", `拿货单列表_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("拿货单数据导出成功", { icon: "✅" });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">拿货单管理</h1>
          <p className="mt-1 text-sm text-slate-400">查询和管理所有拿货单，支持按状态、关键词筛选。</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportData}
            className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 shadow hover:bg-slate-700 active:translate-y-px transition-colors"
          >
            <Download className="h-4 w-4" />
            导出数据
          </button>
          <Link
            href="/procurement/purchase-orders"
            className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px"
          >
            创建拿货单
          </Link>
        </div>
      </header>

      {/* 统计面板 */}
      <section className="grid gap-4 md:grid-cols-4">
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
                <Truck className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">总拿货单数</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.totalCount}
            </div>
          </div>
        </div>

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
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">总拿货数量</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.totalQty.toLocaleString("zh-CN")}
            </div>
          </div>
        </div>

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
                <Truck className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">待发货/运输中</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.pendingCount + stats.inTransitCount}
            </div>
          </div>
        </div>

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
                <Truck className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">已入库</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.completedCount}
            </div>
          </div>
        </div>
      </section>

      {/* 搜索和筛选 */}
      <section className="space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索拿货单号、合同编号、供应商、SKU或物流单号..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
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
        </div>

        {/* 状态筛选 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-400">状态筛选：</span>
          <button
            onClick={() => setFilterStatus("all")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              filterStatus === "all"
                ? "bg-primary-500/20 text-primary-300 border border-primary-500/40"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            全部 ({stats.totalCount})
          </button>
          {Object.keys(STATUS_COLORS).map((status) => {
            const count = deliveryOrders.filter((o) => o.status === status).length;
            const colors = STATUS_COLORS[status];
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  filterStatus === status
                    ? `${colors.bg} ${colors.text} border border-current/40`
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {status} ({count})
              </button>
            );
          })}
        </div>
      </section>

      {/* 拿货单列表 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">拿货单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">合同编号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">供应商</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">SKU</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">数量</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">状态</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">尾款金额</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">已付尾款</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">尾款到期日</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">物流单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">创建时间</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={12}>
                    {deliveryOrders.length === 0
                      ? "暂无拿货单，请前往采购合同页面创建拿货单"
                      : "没有符合条件的拿货单"}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const contract = contracts.find((c) => c.id === order.contractId);
                  const colors = STATUS_COLORS[order.status] || STATUS_COLORS["待发货"];
                  const isTailPaid = order.tailPaid >= order.tailAmount;

                  return (
                    <tr key={order.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-100">{order.deliveryNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/procurement/purchase-orders`}
                          className="text-primary-400 hover:text-primary-300 hover:underline"
                          onClick={(e) => {
                            e.preventDefault();
                            // 可以在这里打开合同详情
                            window.location.href = `/procurement/purchase-orders`;
                          }}
                        >
                          {order.contractNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{contract?.supplierName || "-"}</td>
                      <td className="px-4 py-3 text-slate-300">{contract?.sku || "-"}</td>
                      <td className="px-4 py-3 text-right text-slate-100">{order.qty.toLocaleString("zh-CN")}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {formatCurrency(order.tailAmount, "CNY", "expense")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isTailPaid ? (
                          <span className="text-emerald-300">{formatCurrency(order.tailPaid, "CNY", "expense")}</span>
                        ) : (
                          <span className="text-amber-300">{formatCurrency(order.tailPaid || 0, "CNY", "expense")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {order.tailDueDate ? formatDate(order.tailDueDate) : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {order.domesticTrackingNumber || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(order.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/procurement/purchase-orders`}
                          className="inline-flex items-center gap-1 rounded-md border border-primary-500/40 bg-primary-500/10 px-2 py-1 text-xs font-medium text-primary-100 hover:bg-primary-500/20 transition-colors"
                        >
                          <Eye className="h-3 w-3" />
                          查看合同
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
