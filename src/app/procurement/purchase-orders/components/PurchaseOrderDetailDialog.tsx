"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Package,
  FileImage,
  Wallet,
  Factory,
  Truck,
  CheckCircle2,
  Trash2,
  Upload,
  FileText,
  Edit2,
} from "lucide-react";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";
import InventoryDistribution from "@/components/InventoryDistribution";
import { computeDeliveryOrderTailAmount } from "@/lib/delivery-orders-store";
import {
  findActiveTailExpenseRequestForDeliveryOrder,
  type ExpenseRequest,
} from "@/lib/expense-income-request-store";
import { useSystemConfirm } from "@/hooks/use-system-confirm";
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
  /** 用于判断尾款是否已发起付款申请（可选，不传则仅依赖父级 handlePayment 内校验） */
  expenseRequests?: ExpenseRequest[];
  onRefresh?: () => void;
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
  expenseRequests = [],
  onRefresh,
}: PurchaseOrderDetailDialogProps) {
  const { confirm, confirmDialog } = useSystemConfirm();
  if (!open || !contractDetail) return null;

  const { contract, deliveryOrders } = contractDetail;
  const [voucherDraft, setVoucherDraft] = useState<string | string[]>(
    contract.contractVoucher ?? ""
  );
  const [voucherDisplay, setVoucherDisplay] = useState<string | string[] | undefined>(
    contract.contractVoucher
  );
  const [voucherSaving, setVoucherSaving] = useState(false);
  // 编辑定金：按比例 或 固定金额
  const [depositType, setDepositType] = useState<"ratio" | "fixed">(
    (contract.depositRate ?? 0) > 0 ? "ratio" : "fixed"
  );
  const [depositRateInput, setDepositRateInput] = useState(stringifyNum(contract.depositRate));
  const [depositAmountInput, setDepositAmountInput] = useState(stringifyNum(contract.depositAmount));
  const [depositSaving, setDepositSaving] = useState(false);
  const [settleSaving, setSettleSaving] = useState(false);
  const canManuallySettle =
    contract.status !== "已结清" && contract.status !== "已取消";
  useEffect(() => {
    setVoucherDraft(contract.contractVoucher ?? "");
    setVoucherDisplay(contract.contractVoucher);
  }, [contract.id, contract.contractVoucher]);
  useEffect(() => {
    setDepositType((contract.depositRate ?? 0) > 0 ? "ratio" : "fixed");
    setDepositRateInput(stringifyNum(contract.depositRate));
    setDepositAmountInput(stringifyNum(contract.depositAmount));
  }, [contract.id, contract.depositRate, contract.depositAmount]);
  function stringifyNum(n: number | undefined) {
    if (n == null || !Number.isFinite(n)) return "";
    return String(n);
  }
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
            {canManuallySettle && (
              <button
                type="button"
                disabled={settleSaving}
                onClick={async () => {
                  const totalQty = contract.totalQty ?? 0;
                  const pickedQty = contract.pickedQty ?? 0;
                  const remaining = totalQty - pickedQty;
                  const msg =
                    remaining > 0
                      ? `确定要手动完结该合同吗？合同数量 ${totalQty} 件，已拿货 ${pickedQty} 件，剩余 ${remaining} 件将不再跟进，合同将标记为「已结清」。`
                      : "确定要将该合同标记为「已结清」吗？";
                  if (!(await confirm({ title: "确认操作", message: msg, type: "warning" }))) return;
                  setSettleSaving(true);
                  try {
                    const res = await fetch(`/api/purchase-contracts/${contract.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "已结清" }),
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error(err?.error || "操作失败");
                    }
                    toast.success("合同已手动完结");
                    onRefresh?.();
                    onClose();
                  } catch (e: any) {
                    toast.error(e?.message || "操作失败");
                  } finally {
                    setSettleSaving(false);
                  }
                }}
                className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {settleSaving ? "处理中…" : "手动完结"}
              </button>
            )}
            {isSuperAdmin && (
              <button
                type="button"
                onClick={async () => {
                  if (!(await confirm({ title: "删除确认", message: "确定要删除该采购合同吗？此操作不可恢复。", type: "danger" }))) return;
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
            {/* 编辑定金：支持按比例或固定金额（供应商有时定金不按比例） */}
            <div className="mt-3 pt-3 border-t border-slate-700">
              <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1">
                <Edit2 className="h-3.5 w-3.5" />
                编辑定金
              </h4>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="depositType"
                    checked={depositType === "ratio"}
                    onChange={() => setDepositType("ratio")}
                    className="rounded border-slate-600 bg-slate-800 text-primary-500"
                  />
                  <span className="text-slate-300">按比例</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={depositRateInput}
                    onChange={(e) => setDepositRateInput(e.target.value)}
                    disabled={depositType !== "ratio"}
                    className="w-16 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200 text-right disabled:opacity-50"
                  />
                  <span className="text-slate-500">%</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="depositType"
                    checked={depositType === "fixed"}
                    onChange={() => setDepositType("fixed")}
                    className="rounded border-slate-600 bg-slate-800 text-primary-500"
                  />
                  <span className="text-slate-300">固定金额</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={depositAmountInput}
                    onChange={(e) => setDepositAmountInput(e.target.value)}
                    disabled={depositType !== "fixed"}
                    className="w-28 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200 text-right disabled:opacity-50"
                  />
                  <span className="text-slate-500">元</span>
                </label>
                <button
                  type="button"
                  disabled={depositSaving}
                  onClick={async () => {
                    const rate = depositType === "ratio" ? parseFloat(depositRateInput) : 0;
                    const amount =
                      depositType === "fixed"
                        ? parseFloat(depositAmountInput)
                        : (contract.totalAmount * (rate / 100)) || 0;
                    if (depositType === "ratio" && (Number.isNaN(rate) || rate < 0 || rate > 100)) {
                      toast.error("请输入 0–100 的定金比例");
                      return;
                    }
                    if (depositType === "fixed" && (Number.isNaN(amount) || amount < 0)) {
                      toast.error("请输入有效的定金金额");
                      return;
                    }
                    if ((contract.depositPaid ?? 0) > amount) {
                      toast.error("定金金额不能小于已付定金");
                      return;
                    }
                    setDepositSaving(true);
                    try {
                      const res = await fetch(`/api/purchase-contracts/${contract.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          depositRate: depositType === "ratio" ? rate : 0,
                          depositAmount: amount,
                        }),
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.error || "保存失败");
                      }
                      toast.success("定金已更新");
                      onRefresh?.();
                    } catch (e: any) {
                      toast.error(e?.message || "保存失败");
                    } finally {
                      setDepositSaving(false);
                    }
                  }}
                  className="rounded border border-primary-500/50 bg-primary-500/20 px-3 py-1.5 text-xs font-medium text-primary-200 hover:bg-primary-500/30 disabled:opacity-50"
                >
                  {depositSaving ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-medium text-slate-100 mb-3 flex items-center gap-2">
              <FileImage className="h-4 w-4" />
              合同凭证
            </h3>
            {voucherDisplay && (Array.isArray(voucherDisplay) ? voucherDisplay.length > 0 : !!voucherDisplay) ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {(Array.isArray(voucherDisplay)
                  ? voucherDisplay
                  : [voucherDisplay]
                ).map((voucher, index) => {
                  const isPdf = typeof voucher === "string" && voucher.startsWith("data:application/pdf");
                  if (isPdf) {
                    return (
                      <div
                        key={index}
                        className="relative group w-full h-32 flex flex-col items-center justify-center rounded-lg border border-slate-700 cursor-pointer hover:border-primary-400 transition-all bg-slate-800"
                        onClick={() => window.open(voucher as string, "_blank")}
                      >
                        <FileText className="w-10 h-10 text-rose-400 mb-1" />
                        <span className="text-xs text-slate-300">PDF</span>
                        <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                          {index + 1}
                        </div>
                      </div>
                    );
                  }
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
              <div className="text-center py-4 text-slate-500 text-sm mb-4">暂无合同凭证，可下方补充上传</div>
            )}
            <div className="border-t border-slate-700 pt-4">
              <p className="text-xs text-slate-400 mb-2">补充凭证（盖完章后上传扫描件/照片）</p>
              <ImageUploader
                value={voucherDraft}
                onChange={setVoucherDraft}
                label=""
                multiple
                maxImages={10}
                maxSizeKB={250}
                placeholder="点击上传或 Ctrl+V 粘贴，支持 JPG、PDF，最多10张（单张约 250KB 内更易保存）"
                acceptPdf
              />
              <button
                type="button"
                disabled={voucherSaving}
                onClick={async () => {
                  setVoucherSaving(true);
                  try {
                    const res = await fetch(`/api/purchase-contracts/${contract.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        contractVoucher:
                          !voucherDraft ||
                          (Array.isArray(voucherDraft) && voucherDraft.length === 0) ||
                          (typeof voucherDraft === "string" && !voucherDraft.trim())
                            ? null
                            : voucherDraft,
                      }),
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      const msg = [err?.error, err?.details].filter(Boolean).join("：") || "保存失败";
                      throw new Error(msg);
                    }
                    const data = await res.json();
                    const next = data.contractVoucher ?? null;
                    setVoucherDisplay(next && (Array.isArray(next) ? next.length > 0 : next) ? next : undefined);
                    toast.success("合同凭证已更新");
                    onRefresh?.();
                  } catch (e: any) {
                    toast.error(e?.message || "保存失败");
                  } finally {
                    setVoucherSaving(false);
                  }
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-500 disabled:opacity-60"
              >
                <Upload className="h-3.5 w-3.5" />
                {voucherSaving ? "保存中…" : "保存凭证"}
              </button>
            </div>
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
                  const displayTail = computeDeliveryOrderTailAmount(contract, order as { qty: number; itemQtys?: Record<string, number> });
                  const isPaid = (order.tailPaid || 0) >= displayTail;
                  const activeTailReq = findActiveTailExpenseRequestForDeliveryOrder(
                    expenseRequests,
                    order.id
                  );
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
                            尾款：{currency(displayTail)}
                            {isPaid ? (
                              <span className="text-emerald-300 ml-2">（已付款）</span>
                            ) : (
                              <span className="text-amber-200 ml-2">
                                （待付，到期日：
                                {order.tailDueDate ? formatDate(order.tailDueDate) : "-"}）
                              </span>
                            )}
                          </div>
                        </div>
                        {!isPaid &&
                          (activeTailReq ? (
                            <span
                              className="rounded-md border border-slate-600 bg-slate-800/80 px-2 py-1 text-xs font-medium text-slate-300"
                              title="已发起尾款付款申请"
                            >
                              {activeTailReq.status === "Pending_Approval"
                                ? "尾款审批中"
                                : activeTailReq.status === "Approved"
                                  ? "待财务付款"
                                  : "已付款"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onPaymentTail(contract.id, order.id)}
                              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
                            >
                              支付尾款
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
