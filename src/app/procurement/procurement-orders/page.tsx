"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ShoppingCart, Search, Eye, Plus, Link as LinkIcon, Package, CheckSquare, Square, Layers } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import {
  getPurchaseOrders,
  getPushedToProcurementOrders,
  linkPurchaseContract,
  linkPurchaseContractBatch,
  type PurchaseOrder
} from "@/lib/purchase-orders-store";
import { getPurchaseContracts, upsertPurchaseContract, type PurchaseContract } from "@/lib/purchase-contracts-store";
import { getProducts, getProductBySkuId } from "@/lib/products-store";
// 供应商数据直接从 localStorage 读取
import Link from "next/link";

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

export default function ProcurementOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [contracts, setContracts] = useState<PurchaseContract[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeGroups, setMergeGroups] = useState<Array<{
    supplierId: string;
    supplierName: string;
    skuId: string;
    sku: string;
    productName: string;
    orders: PurchaseOrder[];
    totalQty: number;
    unitPrice: number;
  }>>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    loadData();
  }, []);

  const loadData = () => {
    setOrders(getPushedToProcurementOrders());
    setContracts(getPurchaseContracts());
    setProducts(getProducts());
    // 加载供应商数据
    try {
      const stored = window.localStorage.getItem("suppliers");
      if (stored) {
        setSuppliers(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load suppliers", e);
    }
  };

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
      totalQuantity: filteredOrders.reduce((sum, o) => sum + o.quantity, 0),
      linked: filteredOrders.filter((o) => o.relatedContractId).length
    };
  }, [filteredOrders]);

  // 查看详情
  const handleViewDetail = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
  };

  // 创建采购合同（跳转到采购合同页面，并传递订单信息）
  const handleCreateContract = (order: PurchaseOrder) => {
    // 使用URL参数传递订单ID，更可靠
    if (typeof window !== "undefined") {
      window.location.href = "/procurement/purchase-orders?fromOrder=" + order.id;
    }
  };

  // 切换订单选择
  const handleToggleOrder = (orderId: string) => {
    const newSelected = new Set(selectedOrderIds);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrderIds(newSelected);
  };

  // 全选/取消全选
  const handleToggleAll = () => {
    const availableOrders = filteredOrders.filter(o => !o.relatedContractId);
    if (selectedOrderIds.size === availableOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(availableOrders.map(o => o.id)));
    }
  };

  // 分析合并分组
  const analyzeMergeGroups = () => {
    const selectedOrders = filteredOrders.filter(o => selectedOrderIds.has(o.id) && !o.relatedContractId);
    if (selectedOrders.length === 0) {
      toast.error("请至少选择一个订单");
      return;
    }

    // 按供应商和SKU分组
    const groupMap = new Map<string, {
      supplierId: string;
      supplierName: string;
      skuId: string;
      sku: string;
      productName: string;
      orders: PurchaseOrder[];
      totalQty: number;
    }>();

    selectedOrders.forEach(order => {
      const product = order.skuId ? getProductBySkuId(order.skuId) : null;
      // 获取产品的主供应商
      let supplierId = "";
      let supplierName = "";
      
      if (product) {
        if (product.factory_id) {
          const supplier = suppliers.find(s => s.id === product.factory_id);
          if (supplier) {
            supplierId = supplier.id;
            supplierName = supplier.name;
          }
        } else if (product.suppliers && product.suppliers.length > 0) {
          const primarySupplier = product.suppliers.find(s => s.isPrimary) || product.suppliers[0];
          const supplier = suppliers.find(s => s.id === primarySupplier.id);
          if (supplier) {
            supplierId = supplier.id;
            supplierName = supplier.name;
          }
        }
      }

      if (!supplierId) {
        toast.error(`订单 ${order.orderNumber} 的产品 ${order.sku} 没有关联供应商，无法合并`);
        return;
      }

      const key = `${supplierId}-${order.skuId || order.sku}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          supplierId,
          supplierName,
          skuId: order.skuId || "",
          sku: order.sku,
          productName: order.productName || product?.name || order.sku,
          orders: [],
          totalQty: 0
        });
      }

      const group = groupMap.get(key)!;
      group.orders.push(order);
      group.totalQty += order.quantity;
    });

    // 计算单价（使用产品的成本价）
    const groups = Array.from(groupMap.values()).map(group => {
      const product = group.skuId ? getProductBySkuId(group.skuId) : null;
      const unitPrice = product?.cost_price || 0;
      return {
        ...group,
        unitPrice
      };
    });

    setMergeGroups(groups);
    setIsMergeModalOpen(true);
  };

  // 执行合并创建合同
  const handleMergeCreateContracts = async () => {
    if (mergeGroups.length === 0) {
      toast.error("没有可合并的订单组");
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const group of mergeGroups) {
      try {
        // 生成合同编号
        const now = new Date();
        const year = now.getFullYear();
        const contractNumber = `HT-${year}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Date.now()).slice(-6)}`;

        // 获取供应商信息
        const supplier = suppliers.find(s => s.id === group.supplierId);
        if (!supplier) {
          toast.error(`供应商 ${group.supplierName} 不存在`);
          errorCount++;
          continue;
        }

        // 创建合同
        const contract: PurchaseContract = {
          id: crypto.randomUUID(),
          contractNumber,
          supplierId: group.supplierId,
          supplierName: group.supplierName,
          sku: group.sku,
          skuId: group.skuId || undefined,
          unitPrice: group.unitPrice,
          totalQty: group.totalQty,
          pickedQty: 0,
          finishedQty: 0,
          totalAmount: group.totalQty * group.unitPrice,
          depositRate: supplier.depositRate,
          depositAmount: (group.totalQty * group.unitPrice) * (supplier.depositRate / 100),
          depositPaid: 0,
          tailPeriodDays: supplier.tailPeriodDays,
          status: "待发货",
          totalPaid: 0,
          totalOwed: (group.totalQty * group.unitPrice),
          relatedOrderIds: group.orders.map(o => o.id),
          relatedOrderNumbers: group.orders.map(o => o.orderNumber),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        upsertPurchaseContract(contract);

        // 关联订单
        linkPurchaseContractBatch(
          group.orders.map(o => o.id),
          contract.id,
          contract.contractNumber
        );

        successCount++;
      } catch (error: any) {
        console.error("创建合同失败:", error);
        toast.error(`创建合同失败: ${error.message}`);
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`成功创建 ${successCount} 个合同！`);
      loadData();
      setSelectedOrderIds(new Set());
      setIsMergeModalOpen(false);
      setMergeGroups([]);
    }

    if (errorCount > 0) {
      toast.error(`${errorCount} 个合同创建失败`);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="采购订单管理"
        description="查看已推送的采购订单，支持批量合并创建采购合同"
        actions={
          <div className="flex gap-2">
            {selectedOrderIds.size > 0 && (
              <ActionButton
                variant="primary"
                icon={Layers}
                onClick={analyzeMergeGroups}
              >
                合并下单 ({selectedOrderIds.size})
              </ActionButton>
            )}
            <Link href="/procurement/purchase-orders">
              <ActionButton variant="secondary" icon={Plus}>
                创建采购合同
              </ActionButton>
            </Link>
          </div>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="待处理订单" value={stats.total} icon={ShoppingCart} />
        <StatCard title="总需求数量" value={stats.totalQuantity} icon={Package} />
        <StatCard title="已创建合同" value={stats.linked} icon={LinkIcon} />
      </div>

      {/* 搜索和批量操作 */}
      <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="flex-1">
          <SearchBar
            value={searchKeyword}
            onChange={setSearchKeyword}
            placeholder="搜索订单编号、SKU、产品名称..."
          />
        </div>
        {filteredOrders.filter(o => !o.relatedContractId).length > 0 && (
          <button
            onClick={handleToggleAll}
            className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:border-slate-600 transition-all duration-200 text-sm font-medium flex items-center gap-2"
          >
            {selectedOrderIds.size === filteredOrders.filter(o => !o.relatedContractId).length ? (
              <>
                <CheckSquare className="h-4 w-4" />
                取消全选
              </>
            ) : (
              <>
                <Square className="h-4 w-4" />
                全选
              </>
            )}
          </button>
        )}
      </div>

      {/* 订单列表 */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="暂无待处理订单"
          description="当订单通过审批后，会推送到这里等待采购处理"
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const hasContract = !!order.relatedContractId;
            const relatedContract = hasContract 
              ? contracts.find((c) => c.id === order.relatedContractId)
              : null;
            
            return (
              <div
                key={order.id}
                className={`rounded-xl border p-4 transition-all ${
                  selectedOrderIds.has(order.id)
                    ? "border-primary-500 bg-primary-500/10"
                    : "border-slate-800 bg-slate-900/60 hover:border-primary-500/50"
                } ${order.relatedContractId ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {!order.relatedContractId && (
                      <button
                        onClick={() => handleToggleOrder(order.id)}
                        className="mt-1 text-slate-400 hover:text-primary-400 transition-colors"
                      >
                        {selectedOrderIds.has(order.id) ? (
                          <CheckSquare className="h-5 w-5 text-primary-400" />
                        ) : (
                          <Square className="h-5 w-5" />
                        )}
                      </button>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-white text-lg">{order.orderNumber}</h3>
                      {hasContract ? (
                        <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-300">
                          已创建合同
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-300">
                          待创建合同
                        </span>
                      )}
                      <span className={`px-2 py-1 rounded text-xs ${
                        order.urgency === "加急" ? "bg-rose-500/20 text-rose-300" :
                        order.urgency === "紧急" ? "bg-amber-500/20 text-amber-300" :
                        "bg-slate-700/50 text-slate-400"
                      }`}>
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
                      {hasContract && relatedContract && (
                        <div className="col-span-2">
                          <span className="text-slate-400">关联合同：</span>
                          <Link 
                            href={`/procurement/purchase-orders?contractId=${relatedContract.id}`}
                            className="text-primary-400 hover:text-primary-300 ml-2"
                          >
                            {relatedContract.contractNumber}
                          </Link>
                        </div>
                      )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="ml-4 flex gap-2">
                    <ActionButton
                      onClick={() => handleViewDetail(order)}
                      variant="secondary"
                      size="sm"
                      icon={Eye}
                    >
                      详情
                    </ActionButton>
                    {!hasContract && (
                      <ActionButton
                        onClick={() => handleCreateContract(order)}
                        variant="primary"
                        size="sm"
                        icon={Plus}
                      >
                        创建合同
                      </ActionButton>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
                ✕
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
              </div>

              {/* 风控信息 */}
              {selectedOrder.riskControlSnapshot && (
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3">风控评估信息</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">工厂现货：</span>
                      <span className="text-slate-200 ml-2">{selectedOrder.riskControlSnapshot.atFactory}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">国内仓：</span>
                      <span className="text-slate-200 ml-2">{selectedOrder.riskControlSnapshot.atDomestic}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">在途：</span>
                      <span className="text-slate-200 ml-2">{selectedOrder.riskControlSnapshot.inTransit}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">总可用：</span>
                      <span className="text-slate-200 ml-2 font-medium">{selectedOrder.riskControlSnapshot.totalAvailable}</span>
                    </div>
                    {selectedOrder.riskControlNotes && (
                      <div className="col-span-2">
                        <span className="text-slate-400">风控备注：</span>
                        <p className="text-slate-300 mt-1">{selectedOrder.riskControlNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 审批信息 */}
              {selectedOrder.approvedBy && (
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3">审批信息</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">审批人：</span>
                      <span className="text-slate-200 ml-2">{selectedOrder.approvedBy}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">审批时间：</span>
                      <span className="text-slate-200 ml-2">{formatDate(selectedOrder.approvedAt)}</span>
                    </div>
                    {selectedOrder.approvalNotes && (
                      <div className="col-span-2">
                        <span className="text-slate-400">审批备注：</span>
                        <p className="text-slate-300 mt-1">{selectedOrder.approvalNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 关联合同 */}
              {selectedOrder.relatedContractNumber && (
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200 mb-2">关联采购合同</h3>
                  <Link 
                    href={`/procurement/purchase-orders?contractId=${selectedOrder.relatedContractId}`}
                    className="text-primary-400 hover:text-primary-300"
                  >
                    {selectedOrder.relatedContractNumber}
                  </Link>
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

      {/* 合并下单确认模态框 */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">合并下单确认</h2>
                <p className="text-sm text-slate-400 mt-1">
                  将 {selectedOrderIds.size} 个订单按供应商和SKU分组，创建 {mergeGroups.length} 个采购合同
                </p>
              </div>
              <button
                onClick={() => {
                  setIsMergeModalOpen(false);
                  setMergeGroups([]);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {mergeGroups.map((group, index) => (
                <div
                  key={`${group.supplierId}-${group.skuId}`}
                  className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-100">
                        合同 {index + 1}: {group.supplierName} - {group.productName}
                      </h3>
                      <p className="text-sm text-slate-400 mt-1">SKU: {group.sku}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-primary-300">
                        {group.totalQty} 件
                      </div>
                      <div className="text-sm text-slate-400">
                        ¥{(group.totalQty * group.unitPrice).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t border-slate-800">
                    <p className="text-xs text-slate-400 mb-2">包含订单 ({group.orders.length} 个):</p>
                    <div className="flex flex-wrap gap-2">
                      {group.orders.map(order => (
                        <span
                          key={order.id}
                          className="px-2 py-1 rounded text-xs bg-slate-800 text-slate-300"
                        >
                          {order.orderNumber} ({order.quantity}件)
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsMergeModalOpen(false);
                  setMergeGroups([]);
                }}
                className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleMergeCreateContracts}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-500 hover:to-primary-600 text-white font-semibold transition-all duration-200 shadow-lg shadow-primary-500/20"
              >
                确认创建 {mergeGroups.length} 个合同
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
