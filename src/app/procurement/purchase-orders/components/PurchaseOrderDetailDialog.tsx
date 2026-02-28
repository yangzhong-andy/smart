"use client";

import Link from "next/link";
import {
  Package,
  FileImage,
  Wallet,
  Factory,
  Truck,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import InventoryDistribution from "@/components/InventoryDistribution";
import { currency, formatDate } from "./types";
import type { ContractDetail } from "./types";

type ProductLike = {
  id?: string;
  sku?: string;
  sku_id?: string;
  at_factory?: number;
  at_domestic?: number;
  in_transit?: number;
};

interface PurchaseOrderDetailDialogProps {
  open: boolean;
  contractDetail: ContractDetail | null;
  products: ProductLike[];
  isSuperAdmin: boolean;
  onClose: () => void;
  onDelete: (contractId: string) => void;
  onFactoryFinished: (contractId: string) => void;
  onPaymentTail: (contractId: string, deliveryOrderId: string) => void;
}

export function PurchaseOrderDetailDialog({
  open,
  contractDetail,
  products,
  isSuperAdmin,
  onClose,
  onDelete,
  onFactoryFinished,
  onPaymentTail,
}: PurchaseOrderDetailDialogProps) {
  if (!open || !contractDetail) return null;

  const { contract, deliveryOrders } = contractDetail;
  const product = products.find(
    (p) =>
      p.sku_id === contract.skuId ||
      (p.id || p.sku) === contract.skuId
  );

  const openImageModal = (imageSrc: string) => {
    const modal = document.createElement("div");
    modal.className =
      "fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm";
    const closeBtn = document.createElement("button");
    closeBtn.className =
      "absolute top-4 right-4 text-white text-2xl hover:text-slate-300 z-10 bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90";
    closeBtn.innerHTML = "✕";
    closeBtn.onclick = () => modal.remove();
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
    const img = document.createElement("img");
    img.src = imageSrc;
    img.className = "max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl";
    img.onclick = (e) => e.stopPropagation();
    modal.appendChild(closeBtn);
    modal.appendChild(img);
    document.body.appendChild(modal);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">合同详情</h2>
            <p className="text-xs text-slate-400">{contract.contractNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("确定要删除该采购合同吗？此操作不可恢复。")) return;
                  await onDelete(contract.id);
                  onClose();
                }}
                className="flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除合同
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {contract.relatedOrderNumber && (
            <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-primary-400" />
                <h3 className="text-sm font-medium text-primary-300">关联采购订单</h3>
              </div>
              <div className="text-sm text-slate-300">
                <Link
                  href="/operations/purchase-orders"
                  className="text-primary-400 hover:text-primary-300 font-medium"
                >
                  {contract.relatedOrderNumber}
                </Link>
                <span className="text-slate-500 ml-2">（点击查看订单详情）</span>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-medium text-slate-100 mb-3">合同信息</h3>
            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <div>
                <span className="text-slate-400">供应商：</span>
                <span className="text-slate-100 ml-2">{contract.supplierName}</span>
              </div>
              <div>
                <span className="text-slate-400">合同总数：</span>
                <span className="text-slate-100 ml-2">{contract.totalQty}</span>
              </div>
              <div>
                <span className="text-slate-400">已取货数：</span>
                <span className="text-slate-100 ml-2">{contract.pickedQty}</span>
              </div>
              <div>
                <span className="text-slate-400">工厂完工数：</span>
                <span className="text-slate-100 ml-2">{contract.finishedQty || 0}</span>
              </div>
              <div>
                <span className="text-slate-400">合同总额：</span>
                <span className="text-slate-100 ml-2">{currency(contract.totalAmount)}</span>
              </div>
            </div>
            <div>
              <span className="text-slate-400 text-sm">SKU / 变体明细：</span>
              {contract.items && contract.items.length > 0 ? (
                <div className="mt-2 rounded border border-slate-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/80">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-400">SKU / 品名</th>
                        <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-400">单价</th>
                        <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-400">数量</th>
                        <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-400">已取货</th>
                        <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-400">小计</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {contract.items.map((item) => (
                        <tr key={item.id} className="bg-slate-900/40">
                          <td className="px-3 py-1.5 text-slate-200">
                            <span className="font-medium">{item.sku}</span>
                            {item.skuName && (
                              <span className="text-slate-500 ml-1">/ {item.skuName}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-300">
                            {currency(item.unitPrice)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-300">{item.qty}</td>
                          <td className="px-3 py-1.5 text-right text-slate-400">{item.pickedQty}</td>
                          <td className="px-3 py-1.5 text-right text-slate-200">
                            {currency(item.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <span className="text-slate-100 ml-2">{contract.sku}</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-medium text-slate-100 mb-3 flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              财务状态
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-400">合同总额：</span>
                <span className="text-slate-100 ml-2">{currency(contract.totalAmount)}</span>
              </div>
              <div>
                <span className="text-slate-400">已付总额：</span>
                <span className="text-emerald-300 ml-2">{currency(contract.totalPaid || 0)}</span>
              </div>
              <div>
                <span className="text-slate-400">已付定金：</span>
                <span className="text-slate-100 ml-2">
                  {currency(contract.depositPaid || 0)} / {currency(contract.depositAmount)}
                </span>
              </div>
              <div>
                <span className="text-slate-400">还欠金额：</span>
                <span className="text-amber-200 ml-2">
                  {currency(contract.totalOwed || contract.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-medium text-slate-100 mb-3 flex items-center gap-2">
              <FileImage className="h-4 w-4" />
              合同凭证
            </h3>
            {contract.contractVoucher ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(Array.isArray(contract.contractVoucher)
                  ? contract.contractVoucher
                  : [contract.contractVoucher]
                ).map((voucher, index) => {
                  let imageSrc = voucher;
                  if (typeof voucher === "string") {
                    if (
                      !voucher.startsWith("data:") &&
                      !voucher.startsWith("http") &&
                      !voucher.startsWith("/")
                    ) {
                      imageSrc = `data:image/jpeg;base64,${voucher}`;
                    } else {
                      imageSrc = voucher;
                    }
                  }
                  return (
                    <div key={index} className="relative group">
                      <img
                        src={imageSrc as string}
                        alt={`合同凭证 ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg border border-slate-700 cursor-pointer hover:border-primary-400 transition-all"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (
                            typeof voucher === "string" &&
                            !voucher.startsWith("data:") &&
                            !voucher.startsWith("http")
                          ) {
                            target.src = `data:image/png;base64,${voucher}`;
                          }
                        }}
                        onClick={() => openImageModal(imageSrc as string)}
                      />
                      <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                        {index + 1}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-sm">暂无合同凭证</div>
            )}
          </div>

          {contract.skuId && product && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-sm font-medium text-slate-100 mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" />
                库存分布
              </h3>
              <InventoryDistribution
                atFactory={(product as { at_factory?: number }).at_factory || 0}
                atDomestic={(product as { at_domestic?: number }).at_domestic || 0}
                inTransit={(product as { in_transit?: number }).in_transit || 0}
                unitPrice={contract.unitPrice}
                size="md"
                showValue={true}
              />
            </div>
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-medium text-slate-100 mb-3 flex items-center gap-2">
              <Factory className="h-4 w-4" />
              工厂操作
            </h3>
            <div className="flex gap-2 flex-wrap items-center">
              {(() => {
                const finishedQty = contract.finishedQty || 0;
                const totalQty = contract.totalQty || 0;
                const remainingQty = totalQty - finishedQty;
                if (totalQty === 0) {
                  return (
                    <div className="text-xs text-slate-400">
                      合同数量为 0，无法进行工厂完工操作
                    </div>
                  );
                }
                if (remainingQty > 0) {
                  return (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFactoryFinished(contract.id);
                      }}
                      className="flex items-center gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-100 hover:bg-blue-500/20 transition-colors"
                    >
                      <Factory className="h-4 w-4" />
                      工厂完工（{remainingQty} 件）
                    </button>
                  );
                }
                return (
                  <div className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    工厂已全部完工（{finishedQty} / {totalQty} 件）
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-medium text-slate-100 mb-3 flex items-center gap-2">
              <Truck className="h-4 w-4" />
              拿货单列表
            </h3>
            {deliveryOrders.length === 0 ? (
              <div className="text-center py-4 text-slate-500 text-sm">暂无拿货单</div>
            ) : (
              <div className="space-y-2">
                {deliveryOrders.map((order) => {
                  const isPaid = order.tailPaid >= order.tailAmount;
                  return (
                    <div
                      key={order.id}
                      className="rounded border border-slate-800 bg-slate-900/40 p-3 text-sm"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-slate-100">{order.deliveryNumber}</span>
                            <span className="text-xs text-slate-500">数量：{order.qty}</span>
                            {order.domesticTrackingNumber && (
                              <span className="text-xs text-slate-500">
                                物流单号：{order.domesticTrackingNumber}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            尾款：{currency(order.tailAmount)}
                            {isPaid ? (
                              <span className="text-emerald-300 ml-2">（已付）</span>
                            ) : (
                              <span className="text-amber-200 ml-2">
                                （待付，到期日：
                                {order.tailDueDate ? formatDate(order.tailDueDate) : "-"}）
                              </span>
                            )}
                          </div>
                        </div>
                        {!isPaid && (
                          <button
                            onClick={() => onPaymentTail(contract.id, order.id)}
                            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
                          >
                            支付尾款
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
