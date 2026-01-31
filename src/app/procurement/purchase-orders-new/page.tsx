"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { Package, Plus, Search, X, Eye, Clock, CheckCircle2, XCircle, AlertCircle, Download } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import {
  getPurchaseOrders,
  createPurchaseOrder,
  upsertPurchaseOrder,
  deletePurchaseOrder,
  checkInventoryForRiskControl,
  type PurchaseOrder,
  type PurchaseOrderStatus
} from "@/lib/purchase-orders-store";
import { getProducts, type Product } from "@/lib/products-store";
import type { Store } from "@/lib/store-store";

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

const STATUS_COLORS: Record<PurchaseOrderStatus, { bg: string; text: string }> = {
  "待风控": { bg: "bg-slate-500/20", text: "text-slate-300" },
  "风控通过": { bg: "bg-blue-500/20", text: "text-blue-300" },
  "风控拒绝": { bg: "bg-rose-500/20", text: "text-rose-300" },
  "待审批": { bg: "bg-amber-500/20", text: "text-amber-300" },
  "审批通过": { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  "审批拒绝": { bg: "bg-rose-500/20", text: "text-rose-300" },
  "已推送采购": { bg: "bg-purple-500/20", text: "text-purple-300" },
  "已创建合同": { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  "已取消": { bg: "bg-slate-700/50", text: "text-slate-400" }
};

export default function PurchaseOrdersNewPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [initialized, setInitialized] = useState(false);
  
  // 搜索和筛选
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<PurchaseOrderStatus | "all">("all");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  
  // 模态框状态
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  
  const [form, setForm] = useState({
    createdBy: "",
    platform: "TikTok" as "TikTok" | "Amazon" | "其他",
    storeId: "",
    sku: "",
    skuId: "",
    quantity: "",
    expectedDeliveryDate: "",
    urgency: "普通" as "普通" | "紧急" | "加急",
    notes: ""
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
    setOrders(getPurchaseOrders());
    setProducts(getProducts());
    const storesRes = await fetch("/api/stores");
    setStores(storesRes.ok ? await storesRes.json() : []);
    setInitialized(true);
    })();
  }, []);

  // 统计信息
  const stats = useMemo(() => {
    const total = orders.length;
    const pendingRiskControl = orders.filter((o) => o.status === "待风控").length;
    const pendingApproval = orders.filter((o) => o.status === "待审批").length;
    const pushedToProcurement = orders.filter((o) => o.status === "已推送采购").length;
    const createdContract = orders.filter((o) => o.status === "已创建合同").length;
    const rejected = orders.filter((o) => o.status === "风控拒绝" || o.status === "审批拒绝").length;
    const totalQuantity = orders.reduce((sum, o) => sum + o.quantity, 0);

    return {
      total,
      pendingRiskControl,
      pendingApproval,
      pushedToProcurement,
      createdContract,
      rejected,
      totalQuantity
    };
  }, [orders]);

  // 筛选订单
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // 状态筛选
    if (filterStatus !== "all") {
      result = result.filter((o) => o.status === filterStatus);
    }

    // 平台筛选
    if (filterPlatform !== "all") {
      result = result.filter((o) => o.platform === filterPlatform);
    }

    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((o) =>
        o.orderNumber.toLowerCase().includes(keyword) ||
        o.sku.toLowerCase().includes(keyword) ||
        o.productName?.toLowerCase().includes(keyword) ||
        o.createdBy.toLowerCase().includes(keyword) ||
        o.storeName?.toLowerCase().includes(keyword)
      );
    }

    // 按创建时间倒序
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return result;
  }, [orders, filterStatus, filterPlatform, searchKeyword]);

  // 创建订单
  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!form.createdBy.trim()) {
      toast.error("请填写下单人姓名");
      return;
    }
    
    if (!form.sku.trim() && !form.skuId) {
      toast.error("请选择产品");
      return;
    }
    
    const quantity = Number(form.quantity);
    if (Number.isNaN(quantity) || quantity <= 0) {
      toast.error("请输入有效的采购数量");
      return;
    }

    const selectedProduct = products.find((p) => p.sku_id === form.skuId);
    const selectedStore = stores.find((s) => s.id === form.storeId);

    const newOrder = createPurchaseOrder({
      createdBy: form.createdBy.trim(),
      platform: form.platform,
      storeId: form.storeId || undefined,
      storeName: selectedStore?.name,
      sku: form.sku || selectedProduct?.sku_id || "",
      skuId: form.skuId || undefined,
      productName: selectedProduct?.name,
      quantity,
      expectedDeliveryDate: form.expectedDeliveryDate || undefined,
      urgency: form.urgency,
      notes: form.notes.trim() || undefined
    });

    setOrders(getPurchaseOrders());
    toast.success("采购订单已创建，等待风控评估");
    
    // 重置表单
    setForm({
      createdBy: "",
      platform: "TikTok",
      storeId: "",
      sku: "",
      skuId: "",
      quantity: "",
      expectedDeliveryDate: "",
      urgency: "普通",
      notes: ""
    });
    setIsCreateModalOpen(false);
  };

  // 查看详情
  const handleViewDetail = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
  };

  // 取消订单
  const handleCancel = (orderId: string) => {
    if (!confirm("确定要取消这个订单吗？")) return;
    
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    
    if (order.status === "已创建合同") {
      toast.error("该订单已创建合同，无法取消");
      return;
    }
    
    const updatedOrder: PurchaseOrder = {
      ...order,
      status: "已取消",
      updatedAt: new Date().toISOString()
    };
    
    upsertPurchaseOrder(updatedOrder);
    setOrders(getPurchaseOrders());
    toast.success("订单已取消");
  };

  // 导出数据
  const handleExportData = () => {
    const csvRows = [
      ["订单编号", "下单人", "平台", "店铺", "SKU", "产品名称", "数量", "紧急程度", "状态", "创建时间"].join(",")
    ];

    filteredOrders.forEach((o) => {
      csvRows.push([
        o.orderNumber,
        o.createdBy,
        o.platform,
        o.storeName || "",
        o.sku,
        o.productName || "",
        o.quantity.toString(),
        o.urgency,
        o.status,
        formatDate(o.createdAt)
      ].join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `采购订单列表_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast.success("数据已导出");
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="采购订单管理"
        description="运营下单 → 风控评估 → 审批 → 推送给采购"
        actions={
          <>
            <ActionButton onClick={handleExportData} variant="secondary" icon={Download}>
              导出数据
            </ActionButton>
            <ActionButton onClick={() => setIsCreateModalOpen(true)} variant="primary" icon={Plus}>
              新建订单
            </ActionButton>
          </>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard title="订单总数" value={stats.total} icon={Package} />
        <StatCard title="待风控" value={stats.pendingRiskControl} icon={Clock} />
        <StatCard title="待审批" value={stats.pendingApproval} icon={AlertCircle} />
        <StatCard title="已推送采购" value={stats.pushedToProcurement} icon={CheckCircle2} />
        <StatCard title="已创建合同" value={stats.createdContract} icon={CheckCircle2} />
        <StatCard title="已拒绝" value={stats.rejected} icon={XCircle} />
        <StatCard title="总数量" value={stats.totalQuantity} icon={Package} />
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索订单编号、SKU、产品名称、下单人..."
        />
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">状态：</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as PurchaseOrderStatus | "all")}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            <option value="待风控">待风控</option>
            <option value="风控通过">风控通过</option>
            <option value="风控拒绝">风控拒绝</option>
            <option value="待审批">待审批</option>
            <option value="审批通过">审批通过</option>
            <option value="审批拒绝">审批拒绝</option>
            <option value="已推送采购">已推送采购</option>
            <option value="已创建合同">已创建合同</option>
            <option value="已取消">已取消</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">平台：</span>
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            <option value="TikTok">TikTok</option>
            <option value="Amazon">Amazon</option>
            <option value="其他">其他</option>
          </select>
        </div>
      </div>

      {/* 订单列表 */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无采购订单"
          description="点击右上角「新建订单」开始下单"
        />
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">订单编号</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">下单人</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">平台/店铺</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">SKU</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">数量</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">紧急程度</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">状态</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredOrders.map((order) => {
                const statusColors = STATUS_COLORS[order.status];
                return (
                  <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-200 font-medium">{order.orderNumber}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{order.createdBy}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {order.platform}
                      {order.storeName && ` · ${order.storeName}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{order.sku}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">{order.quantity}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        order.urgency === "加急" ? "bg-rose-500/20 text-rose-300" :
                        order.urgency === "紧急" ? "bg-amber-500/20 text-amber-300" :
                        "bg-slate-700/50 text-slate-400"
                      }`}>
                        {order.urgency}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors.bg} ${statusColors.text}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <ActionButton
                          onClick={() => handleViewDetail(order)}
                          variant="secondary"
                          size="sm"
                          icon={Eye}
                        >
                          详情
                        </ActionButton>
                        {order.status !== "已创建合同" && order.status !== "已取消" && (
                          <ActionButton
                            onClick={() => handleCancel(order.id)}
                            variant="danger"
                            size="sm"
                          >
                            取消
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 新建订单模态框 */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-100">新建采购订单</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">下单人 *</span>
                  <input
                    type="text"
                    value={form.createdBy}
                    onChange={(e) => setForm((f) => ({ ...f, createdBy: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    placeholder="运营姓名"
                    required
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">目标平台 *</span>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as typeof form.platform }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  >
                    <option value="TikTok">TikTok</option>
                    <option value="Amazon">Amazon</option>
                    <option value="其他">其他</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">目标店铺</span>
                  <select
                    value={form.storeId}
                    onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  >
                    <option value="">请选择（可选）</option>
                    {stores.filter((s) => s.platform === form.platform).map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name} ({store.country})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">产品SKU *</span>
                  <select
                    value={form.skuId}
                    onChange={(e) => {
                      const product = products.find((p) => p.sku_id === e.target.value);
                      setForm((f) => ({
                        ...f,
                        skuId: e.target.value,
                        sku: product?.sku_id || ""
                      }));
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  >
                    <option value="">请选择产品</option>
                    {products.map((product) => (
                      <option key={product.sku_id} value={product.sku_id}>
                        {product.sku_id} - {product.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">采购数量 *</span>
                  <input
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">期望到货日期</span>
                  <input
                    type="date"
                    value={form.expectedDeliveryDate}
                    onChange={(e) => setForm((f) => ({ ...f, expectedDeliveryDate: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">紧急程度 *</span>
                  <select
                    value={form.urgency}
                    onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value as typeof form.urgency }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  >
                    <option value="普通">普通</option>
                    <option value="紧急">紧急</option>
                    <option value="加急">加急</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">备注说明</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="可选：说明采购原因、特殊要求等"
                />
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <ActionButton
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  variant="secondary"
                >
                  取消
                </ActionButton>
                <ActionButton type="submit" variant="primary">
                  创建订单
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 详情模态框 */}
      {isDetailModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">订单详情</h2>
                <p className="text-sm text-slate-400 mt-1">{selectedOrder.orderNumber}</p>
              </div>
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedOrder(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">订单编号：</span>
                  <span className="text-slate-200 ml-2">{selectedOrder.orderNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400">下单人：</span>
                  <span className="text-slate-200 ml-2">{selectedOrder.createdBy}</span>
                </div>
                <div>
                  <span className="text-slate-400">平台：</span>
                  <span className="text-slate-200 ml-2">{selectedOrder.platform}</span>
                </div>
                <div>
                  <span className="text-slate-400">店铺：</span>
                  <span className="text-slate-200 ml-2">{selectedOrder.storeName || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400">SKU：</span>
                  <span className="text-slate-200 ml-2">{selectedOrder.sku}</span>
                </div>
                <div>
                  <span className="text-slate-400">产品名称：</span>
                  <span className="text-slate-200 ml-2">{selectedOrder.productName || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400">采购数量：</span>
                  <span className="text-slate-200 ml-2 font-medium">{selectedOrder.quantity}</span>
                </div>
                <div>
                  <span className="text-slate-400">紧急程度：</span>
                  <span className="text-slate-200 ml-2">{selectedOrder.urgency}</span>
                </div>
                <div>
                  <span className="text-slate-400">期望到货日期：</span>
                  <span className="text-slate-200 ml-2">{formatDate(selectedOrder.expectedDeliveryDate)}</span>
                </div>
                <div>
                  <span className="text-slate-400">状态：</span>
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${STATUS_COLORS[selectedOrder.status].bg} ${STATUS_COLORS[selectedOrder.status].text}`}>
                    {selectedOrder.status}
                  </span>
                </div>
              </div>

              {/* 风控评估信息 */}
              {selectedOrder.riskControlStatus !== "待评估" && (
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3">风控评估</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">评估结果：</span>
                      <span className={`ml-2 px-2 py-1 rounded text-xs ${
                        selectedOrder.riskControlStatus === "通过" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                      }`}>
                        {selectedOrder.riskControlStatus}
                      </span>
                    </div>
                    {selectedOrder.riskControlBy && (
                      <div>
                        <span className="text-slate-400">评估人：</span>
                        <span className="text-slate-200 ml-2">{selectedOrder.riskControlBy}</span>
                      </div>
                    )}
                    {selectedOrder.riskControlAt && (
                      <div>
                        <span className="text-slate-400">评估时间：</span>
                        <span className="text-slate-200 ml-2">{formatDate(selectedOrder.riskControlAt)}</span>
                      </div>
                    )}
                    {selectedOrder.riskControlSnapshot && (
                      <>
                        <div>
                          <span className="text-slate-400">工厂现货：</span>
                          <span className="text-slate-200 ml-2">{selectedOrder.riskControlSnapshot.atFactory}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">国内仓库存：</span>
                          <span className="text-slate-200 ml-2">{selectedOrder.riskControlSnapshot.atDomestic}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">在途数量：</span>
                          <span className="text-slate-200 ml-2">{selectedOrder.riskControlSnapshot.inTransit}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">总可用库存：</span>
                          <span className="text-slate-200 ml-2 font-medium">{selectedOrder.riskControlSnapshot.totalAvailable}</span>
                        </div>
                      </>
                    )}
                    {selectedOrder.riskControlNotes && (
                      <div className="col-span-2">
                        <span className="text-slate-400">评估备注：</span>
                        <p className="text-slate-300 mt-1">{selectedOrder.riskControlNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 审批信息 */}
              {selectedOrder.approvalStatus !== "待审批" && (
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3">审批信息</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">审批结果：</span>
                      <span className={`ml-2 px-2 py-1 rounded text-xs ${
                        selectedOrder.approvalStatus === "通过" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                      }`}>
                        {selectedOrder.approvalStatus}
                      </span>
                    </div>
                    {selectedOrder.approvedBy && (
                      <div>
                        <span className="text-slate-400">审批人：</span>
                        <span className="text-slate-200 ml-2">{selectedOrder.approvedBy}</span>
                      </div>
                    )}
                    {selectedOrder.approvedAt && (
                      <div>
                        <span className="text-slate-400">审批时间：</span>
                        <span className="text-slate-200 ml-2">{formatDate(selectedOrder.approvedAt)}</span>
                      </div>
                    )}
                    {selectedOrder.approvalNotes && (
                      <div className="col-span-2">
                        <span className="text-slate-400">审批备注：</span>
                        <p className="text-slate-300 mt-1">{selectedOrder.approvalNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 采购关联信息 */}
              {selectedOrder.relatedContractNumber && (
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3">采购合同</h3>
                  <div className="text-sm">
                    <span className="text-slate-400">合同编号：</span>
                    <span className="text-slate-200 ml-2">{selectedOrder.relatedContractNumber}</span>
                  </div>
                </div>
              )}

              {/* 备注 */}
              {selectedOrder.notes && (
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200 mb-2">备注说明</h3>
                  <p className="text-sm text-slate-300">{selectedOrder.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
