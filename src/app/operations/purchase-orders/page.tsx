"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { Package, Plus, Search, X, Eye, Clock, CheckCircle2, XCircle, AlertCircle, Download, Palette } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import useSWR, { mutate as swrMutate } from "swr";
import {
  type PurchaseOrder,
  type PurchaseOrderStatus
} from "@/lib/purchase-orders-store";
import { getSpuListFromAPI, getVariantsBySpuIdFromAPI, type Product, type SpuListItem } from "@/lib/products-store";
import type { Store } from "@/lib/store-store";

// 按 SPU 分组：1 个 SPU 对应多个颜色变体 (SKU)
type SpuOption = {
  productId: string;
  name: string;
  variants: Product[];
};
// 已选变体行（用于提交 OrderItem）
type SelectedItem = {
  sku: string;
  skuId: string;
  skuName: string;
  spec: string;
  quantity: number;
  unitPrice: number;
};

// SWR fetcher
const fetcher = (url: string) => fetch(url).then(res => res.json());

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
  // 使用 SWR 加载采购订单数据
  const { data: ordersDataRaw, isLoading: ordersLoading, mutate: mutateOrders } = useSWR<any>('/api/purchase-orders?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    keepPreviousData: true,
    dedupingInterval: 600000
  });
  const ordersData = Array.isArray(ordersDataRaw) ? ordersDataRaw : (ordersDataRaw?.data ?? []);

  const [spuList, setSpuList] = useState<SpuListItem[]>([]);
  const [variantCache, setVariantCache] = useState<Record<string, Product[]>>({});
  const [loadingSpuId, setLoadingSpuId] = useState<string | null>(null);
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
    productId: "", // SPU ID（product_id）
    expectedDeliveryDate: "",
    urgency: "普通" as "普通" | "紧急" | "加急",
    notes: ""
  });
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [variantQuantities, setVariantQuantities] = useState<Record<string, string>>({}); // sku_id -> quantity string
  const [variantSearch, setVariantSearch] = useState(""); // 变体选择器内按颜色/SKU 搜索
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]); // 已选变体行，用于提交

  const orders = ordersData;

  const spuOptions = useMemo((): SpuOption[] => {
    return spuList.map((s) => ({
      productId: s.productId,
      name: s.name,
      variants: variantCache[s.productId] ?? [],
    }));
  }, [spuList, variantCache]);

  const selectedSpu = useMemo(() => {
    if (!form.productId) return null;
    return spuOptions.find((s) => s.productId === form.productId) ?? null;
  }, [form.productId, spuOptions]);

  // 一次性只拉 SPU 列表；变体在用户选中该规格时再按需拉取并缓存，切换颜色/改数量零请求
  useEffect(() => {
    if (typeof window === "undefined") return;
    getSpuListFromAPI().then(setSpuList);
    fetch("/api/stores?page=1&pageSize=500").then((res) => (res.ok ? res.json() : [])).then((json) => setStores(Array.isArray(json) ? json : (json?.data ?? [])));
    setInitialized(true);
  }, []);

  // 当用户选中规格/型号时，按需拉取该 SPU 下全部变体并缓存（仅此一次请求）
  useEffect(() => {
    if (!form.productId || variantCache[form.productId]?.length) return;
    const pid = form.productId;
    setLoadingSpuId(pid);
    getVariantsBySpuIdFromAPI(pid)
      .then((variants) => {
        setVariantCache((prev) => ({ ...prev, [pid]: variants }));
      })
      .finally(() => setLoadingSpuId(null));
  }, [form.productId, variantCache]);

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

  const [isCreating, setIsCreating] = useState(false);

  // 打开颜色变体弹窗：未选规格前不进入；按当前选中的 SPU 初始化各变体数量
  const openVariantModal = () => {
    if (!selectedSpu) {
      toast.error("请先选择规格/型号");
      return;
    }
    const next: Record<string, string> = {};
    selectedSpu.variants.forEach((v) => {
      next[v.sku_id] = variantQuantities[v.sku_id] ?? "";
    });
    setVariantQuantities(next);
    setVariantSearch("");
    setVariantModalOpen(true);
  };

  // 确认颜色与数量：只保留数量 > 0 的变体，写入 selectedItems（一次下单多行）
  const confirmVariantSelection = () => {
    if (!selectedSpu) return;
    const items: SelectedItem[] = [];
    selectedSpu.variants.forEach((v) => {
      const q = Number(variantQuantities[v.sku_id]);
      if (Number.isNaN(q) || q <= 0) return;
      const skuName = selectedSpu.name;
      const spec = (v as any).color || v.sku_id || "";
      items.push({
        sku: v.sku_id,
        skuId: v.sku_id,
        skuName,
        spec,
        quantity: q,
        unitPrice: (v as any).cost_price ?? v.cost_price ?? 0,
      });
    });
    if (items.length === 0) {
      toast.error("请至少为一个颜色填写数量");
      return;
    }
    setSelectedItems(items);
    setVariantModalOpen(false);
    toast.success(`已选 ${items.length} 个颜色，共 ${items.reduce((s, i) => s + i.quantity, 0)} 件`);
  };

  // 创建订单：一次性提交所有变体到 OrderItem（单次请求）
  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isCreating) {
      toast.loading("正在创建，请勿重复点击");
      return;
    }
    if (!form.createdBy.trim()) {
      toast.error("请填写下单人姓名");
      return;
    }
    if (!form.productId || selectedItems.length === 0) {
      toast.error("请选择产品并填写各颜色数量");
      return;
    }

    const selectedStore = stores.find((s) => s.id === form.storeId);
    setIsCreating(true);
    try {
      const response = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          createdBy: form.createdBy.trim(),
          platform: form.platform,
          storeId: form.storeId || undefined,
          storeName: selectedStore?.name,
          expectedDeliveryDate: form.expectedDeliveryDate || undefined,
          urgency: form.urgency,
          notes: form.notes.trim() || undefined,
          status: '待风控',
          riskControlStatus: '待评估',
          approvalStatus: '待审批',
          items: selectedItems.map((i) => ({
            sku: i.sku,
            skuId: i.skuId,
            skuName: i.skuName,
            spec: i.spec,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '创建订单失败');
      }
      await mutateOrders();
      toast.success("采购订单已创建，等待风控评估");
      setForm({
        createdBy: "",
        platform: "TikTok",
        storeId: "",
        productId: "",
        expectedDeliveryDate: "",
        urgency: "普通",
        notes: "",
      });
      setSelectedItems([]);
      setVariantQuantities({});
      setIsCreateModalOpen(false);
    } catch (error: any) {
      console.error('Error creating purchase order:', error);
      toast.error(error.message || "创建订单失败");
    } finally {
      setIsCreating(false);
    }
  };

  // 查看详情
  const handleViewDetail = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
  };

  // 取消订单
  const handleCancel = async (orderId: string) => {
    if (!confirm("确定要取消这个订单吗？")) return;
    
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    
    if (order.status === "已创建合同") {
      toast.error("该订单已创建合同，无法取消");
      return;
    }
    
    try {
      const response = await fetch(`/api/purchase-orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...order,
          status: "已取消"
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '取消订单失败');
      }

      // 刷新数据
      await mutateOrders();
      toast.success("订单已取消");
    } catch (error: any) {
      console.error('Error canceling purchase order:', error);
      toast.error(error.message || "取消订单失败");
    }
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
        title="运营工作台"
        description="创建采购订单，跟踪订单状态（待风控 → 风控通过 → 待审批 → 审批通过 → 已推送采购）"
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
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {order.items?.length
                        ? `${order.items[0]?.skuName || order.items[0]?.sku || order.sku}${order.items.length > 1 ? ` 等${order.items.length}项` : ""}`
                        : order.sku}
                    </td>
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

                <label className="block space-y-1 col-span-2">
                  <span className="text-sm text-slate-300">第一步：选择规格/型号 *</span>
                  <select
                    value={form.productId}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, productId: e.target.value }));
                      setSelectedItems([]);
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  >
                    <option value="">请选择规格/型号（如 mz03）</option>
                    {spuOptions.map((spu) => (
                      <option key={spu.productId} value={spu.productId}>
                        {spu.name}（{loadingSpuId === spu.productId ? "加载中…" : `${spu.variants.length} 个颜色`}）
                      </option>
                    ))}
                  </select>
                </label>

                <div className="col-span-2 flex items-center gap-3">
                  <span className="text-sm text-slate-400">第二步：选择颜色并填数量（先选规格后再点）</span>
                  <button
                    type="button"
                    onClick={openVariantModal}
                    disabled={!form.productId || !!loadingSpuId}
                    className="flex items-center gap-2 rounded-md border border-primary-500/50 bg-primary-500/10 px-3 py-2 text-sm font-medium text-primary-200 hover:bg-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Palette className="h-4 w-4" />
                    {selectedItems.length > 0
                      ? `已选 ${selectedItems.length} 个颜色，共 ${selectedItems.reduce((s, i) => s + i.quantity, 0)} 件（总价 ¥${selectedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0).toFixed(2)}）`
                      : "选择颜色并输入各颜色采购数量"}
                  </button>
                  {selectedItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedItems([])}
                      className="text-xs text-slate-400 hover:text-rose-400"
                    >
                      清空重选
                    </button>
                  )}
                </div>

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
                <ActionButton type="submit" variant="primary" isLoading={isCreating} disabled={isCreating || selectedItems.length === 0}>
                  {isCreating ? "创建中..." : "创建订单"}
                </ActionButton>
              </div>
            </form>

            {/* 颜色变体弹窗：级联选择后在此填数量矩阵，打平为多行 OrderItem */}
            {variantModalOpen && selectedSpu && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur">
                <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between mb-4 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-slate-100">
                      {selectedSpu.name} · 选择颜色与数量
                    </h3>
                    <button
                      type="button"
                      onClick={() => { setVariantModalOpen(false); setVariantSearch(""); }}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-3 flex-shrink-0">
                    同规格下为各颜色直接填写采购数量，未填或为 0 不纳入订单。
                  </p>
                  <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                    <Search className="h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      value={variantSearch}
                      onChange={(e) => setVariantSearch(e.target.value)}
                      placeholder="按颜色或 SKU 搜索…"
                      className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary-400"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mb-2 flex-shrink-0">数量矩阵</p>
                  <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
                    {(() => {
                      const kw = variantSearch.trim().toLowerCase();
                      const list = kw
                        ? selectedSpu.variants.filter(
                            (v) =>
                              ((v as any).color || "").toLowerCase().includes(kw) ||
                              (v.sku_id || "").toLowerCase().includes(kw)
                          )
                        : selectedSpu.variants;
                      return list.length > 0 ? (
                        list.map((v) => (
                          <div
                            key={v.sku_id}
                            className="flex items-center gap-4 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 flex-shrink-0"
                          >
                            <span className="text-slate-200 font-medium w-24 truncate">
                              {(v as any).color || v.sku_id}
                            </span>
                            <span className="text-slate-500 text-sm flex-1 truncate">{v.sku_id}</span>
                            <span className="text-slate-400 text-sm whitespace-nowrap">
                              ¥{Number((v as any).cost_price ?? 0).toFixed(2)}
                            </span>
                            <input
                              type="number"
                              min={0}
                              placeholder="0"
                              value={variantQuantities[v.sku_id] ?? ""}
                              onChange={(e) =>
                                setVariantQuantities((prev) => ({ ...prev, [v.sku_id]: e.target.value }))
                              }
                              className="w-24 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-right text-slate-100 outline-none focus:border-primary-400"
                            />
                            <span className="text-slate-500 text-sm w-8">件</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-slate-500 text-sm">
                          {variantSearch.trim() ? "未匹配到该颜色或 SKU，请修改搜索词" : "该规格下暂无变体"}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-800 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => { setVariantModalOpen(false); setVariantSearch(""); }}
                      className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={confirmVariantSelection}
                      className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600"
                    >
                      确定
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                  <span className="text-slate-400">产品/数量：</span>
                  <span className="text-slate-200 ml-2">
                    {selectedOrder.items?.length
                      ? `${selectedOrder.items.length} 个 SKU，共 ${selectedOrder.quantity} 件`
                      : `${selectedOrder.sku || "-"}，${selectedOrder.quantity} 件`}
                  </span>
                </div>
                {selectedOrder.items && selectedOrder.items.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-slate-400 block mb-2">物料明细：</span>
                    <div className="rounded border border-slate-700 bg-slate-800/50 divide-y divide-slate-700 text-sm">
                      {selectedOrder.items.map((it: any, idx: number) => (
                        <div key={it.id || idx} className="flex justify-between px-3 py-2">
                          <span className="text-slate-200">
                            {(it.skuName || it.sku) + (it.spec ? ` - ${it.spec}` : "")}
                          </span>
                          <span className="text-slate-300">
                            {it.quantity} 件 × ¥{Number(it.unitPrice || 0).toFixed(2)} = ¥{Number(it.totalAmount || 0).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
