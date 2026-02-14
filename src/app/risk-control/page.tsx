"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { Shield, CheckCircle2, XCircle, Search, Eye, AlertTriangle, Package } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import { performRiskControl, checkInventoryForRiskControl, type PurchaseOrder } from "@/lib/purchase-orders-store";

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));

export default function RiskControlPage() {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [riskControlForm, setRiskControlForm] = useState({
    result: "通过" as "通过" | "拒绝",
    notes: "",
    riskControlBy: ""
  });

  const { data: ordersDataRaw, mutate: mutateOrders } = useSWR<any>(
    "/api/purchase-orders?page=1&pageSize=500",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const ordersData = Array.isArray(ordersDataRaw) ? ordersDataRaw : (ordersDataRaw?.data ?? []);
  const orders = useMemo(
    () => ordersData.filter((o: PurchaseOrder) => o.status === "待风控"),
    [ordersData]
  );
  const { data: productsRaw } = useSWR<any>("/api/products?page=1&pageSize=500", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  });
  const products = Array.isArray(productsRaw) ? productsRaw : (productsRaw?.data ?? productsRaw?.list ?? []);

  // 筛选订单
  const filteredOrders = useMemo(() => {
    let result = [...orders];
    
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((o) =>
        o.orderNumber.toLowerCase().includes(keyword) ||
        o.sku.toLowerCase().includes(keyword) ||
        o.productName?.toLowerCase().includes(keyword) ||
        o.createdBy.toLowerCase().includes(keyword)
      );
    }
    
    result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return result;
  }, [orders, searchKeyword]);

  // 统计信息
  const stats = useMemo(() => {
    return {
      total: filteredOrders.length,
      totalQuantity: filteredOrders.reduce((sum, o) => sum + o.quantity, 0)
    };
  }, [filteredOrders]);

  // 打开风控评估模态框
  const handleOpenModal = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    
    // 自动检查库存
    let inventorySnapshot;
    if (order.skuId) {
      inventorySnapshot = checkInventoryForRiskControl(order.skuId);
    }
    
    // 根据库存情况给出建议
    let suggestedResult: "通过" | "拒绝" = "通过";
    let suggestedNotes = "";
    
    if (inventorySnapshot) {
      const { totalAvailable, needsRestock } = inventorySnapshot;
      if (totalAvailable >= order.quantity) {
        suggestedResult = "通过";
        suggestedNotes = `库存充足（总可用：${totalAvailable}），可以下单。`;
      } else if (needsRestock) {
        suggestedResult = "通过";
        suggestedNotes = `库存不足（总可用：${totalAvailable}，需求：${order.quantity}），但需要补货，建议通过。`;
      } else {
        suggestedResult = "拒绝";
        suggestedNotes = `库存严重不足（总可用：${totalAvailable}，需求：${order.quantity}），建议拒绝或先补货。`;
      }
    }
    
    setRiskControlForm({
      result: suggestedResult,
      notes: suggestedNotes,
      riskControlBy: ""
    });
    setIsModalOpen(true);
  };

  // 提交风控评估
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOrder) return;
    if (!riskControlForm.riskControlBy.trim()) {
      toast.error("请填写评估人姓名");
      return;
    }
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击");
      return;
    }
    setIsSubmitting(true);
    try {
      const success = await performRiskControl(
        selectedOrder.id,
        riskControlForm.result,
        riskControlForm.notes,
        riskControlForm.riskControlBy.trim()
      );
      if (success) {
        toast.success(`风控评估${riskControlForm.result === "通过" ? "通过" : "拒绝"}`);
        mutateOrders();
        setIsModalOpen(false);
        setSelectedOrder(null);
        setRiskControlForm({ result: "通过", notes: "", riskControlBy: "" });
      } else {
        toast.error("评估失败，请重试");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="风控评估"
        description="评估采购订单的库存情况，决定是否通过风控"
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard title="待评估订单" value={stats.total} icon={Shield} />
        <StatCard title="总需求数量" value={stats.totalQuantity} icon={Package} />
      </div>

      {/* 搜索 */}
      <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索订单编号、SKU、产品名称..."
        />
      </div>

      {/* 订单列表 */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="暂无待评估订单"
          description="当运营创建采购订单后，订单会出现在这里等待风控评估"
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            // 获取当前库存情况
            let inventoryInfo;
            if (order.skuId) {
              inventoryInfo = checkInventoryForRiskControl(order.skuId);
            }
            
            const product = products.find((p) => p.sku_id === order.skuId);
            
            return (
              <div
                key={order.id}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-primary-500/50 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-white text-lg">{order.orderNumber}</h3>
                      <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300">
                        {order.urgency}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-slate-400">下单人：</span>
                        <span className="text-slate-200 ml-2">{order.createdBy}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">平台：</span>
                        <span className="text-slate-200 ml-2">{order.platform}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">SKU：</span>
                        <span className="text-slate-200 ml-2">{order.sku}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">需求数量：</span>
                        <span className="text-slate-200 ml-2 font-medium">{order.quantity}</span>
                      </div>
                    </div>

                    {/* 库存情况 */}
                    {inventoryInfo && (
                      <div className="mt-3 p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Package className="h-4 w-4 text-slate-400" />
                          <span className="text-sm font-medium text-slate-300">当前库存情况</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-slate-500">工厂现货：</span>
                            <span className="text-slate-300 ml-1">{inventoryInfo.atFactory}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">国内仓：</span>
                            <span className="text-slate-300 ml-1">{inventoryInfo.atDomestic}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">在途：</span>
                            <span className="text-slate-300 ml-1">{inventoryInfo.inTransit}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">总可用：</span>
                            <span className={`ml-1 font-medium ${
                              inventoryInfo.totalAvailable >= order.quantity
                                ? "text-emerald-300"
                                : inventoryInfo.needsRestock
                                ? "text-amber-300"
                                : "text-rose-300"
                            }`}>
                              {inventoryInfo.totalAvailable}
                            </span>
                          </div>
                        </div>
                        {inventoryInfo.totalAvailable < order.quantity && (
                          <div className="mt-2 flex items-center gap-2 text-xs text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>库存不足，需求 {order.quantity}，可用 {inventoryInfo.totalAvailable}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="ml-4">
                    <ActionButton
                      onClick={() => handleOpenModal(order)}
                      variant="primary"
                      icon={Shield}
                    >
                      评估
                    </ActionButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 风控评估模态框 */}
      {isModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">风控评估</h2>
                <p className="text-sm text-slate-400 mt-1">{selectedOrder.orderNumber}</p>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedOrder(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {/* 订单信息 */}
            <div className="mb-6 p-4 rounded-lg border border-slate-700 bg-slate-800/50">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">SKU：</span>
                  <span className="text-slate-200 ml-2">{selectedOrder.sku}</span>
                </div>
                <div>
                  <span className="text-slate-400">需求数量：</span>
                  <span className="text-slate-200 ml-2 font-medium">{selectedOrder.quantity}</span>
                </div>
                {(() => {
                  const inventoryInfo = selectedOrder.skuId 
                    ? checkInventoryForRiskControl(selectedOrder.skuId)
                    : null;
                  return inventoryInfo ? (
                    <>
                      <div>
                        <span className="text-slate-400">工厂现货：</span>
                        <span className="text-slate-200 ml-2">{inventoryInfo.atFactory}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">国内仓：</span>
                        <span className="text-slate-200 ml-2">{inventoryInfo.atDomestic}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">在途：</span>
                        <span className="text-slate-200 ml-2">{inventoryInfo.inTransit}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">总可用：</span>
                        <span className={`ml-2 font-medium ${
                          inventoryInfo.totalAvailable >= selectedOrder.quantity
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }`}>
                          {inventoryInfo.totalAvailable}
                        </span>
                      </div>
                    </>
                  ) : null;
                })()}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-1">
                <span className="text-sm text-slate-300">评估结果 *</span>
                <select
                  value={riskControlForm.result}
                  onChange={(e) => setRiskControlForm((f) => ({ ...f, result: e.target.value as typeof f.result }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  required
                >
                  <option value="通过">通过</option>
                  <option value="拒绝">拒绝</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">评估人 *</span>
                <input
                  type="text"
                  value={riskControlForm.riskControlBy}
                  onChange={(e) => setRiskControlForm((f) => ({ ...f, riskControlBy: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="风控人员姓名"
                  required
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">评估备注</span>
                <textarea
                  value={riskControlForm.notes}
                  onChange={(e) => setRiskControlForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={4}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="说明评估理由、库存情况、风险提示等"
                />
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <ActionButton
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedOrder(null);
                  }}
                  variant="secondary"
                >
                  取消
                </ActionButton>
                <ActionButton type="submit" variant="primary" isLoading={isSubmitting} disabled={isSubmitting}>
                  {isSubmitting ? "处理中..." : "提交评估"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
