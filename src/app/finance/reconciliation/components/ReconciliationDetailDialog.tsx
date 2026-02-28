"use client";

import { formatCurrency } from "./types";
import type { MonthlyBill, BillStatus } from "./types";

export const statusColors: Record<BillStatus, string> = {
  Draft: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  Pending_Finance_Review: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  Pending_Approval: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  Approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  Cashier_Approved: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  Paid: "bg-purple-500/20 text-purple-300 border-purple-500/40",
};

export const statusLabels: Record<BillStatus, string> = {
  Draft: "草稿",
  Pending_Finance_Review: "待财务审批",
  Pending_Approval: "待主管审批",
  Approved: "已核准",
  Cashier_Approved: "出纳已审核",
  Paid: "已支付",
};

type RechargeLike = { id: string; date?: string; accountName?: string; amount?: number; currency?: string; rebateAmount?: number; voucher?: string; notes?: string };
type ConsumptionLike = { id: string; date?: string; accountName?: string; amount?: number; currency?: string; estimatedRebate?: number; voucher?: string; notes?: string };
type RebateReceivableLike = {
  adAccountId?: string; rechargeId?: string;
  rebateAmount: number; currency: string; currentBalance: number; status: string; rechargeDate?: string;
  writeoffRecords: Array<{ id: string; consumptionDate?: string; writeoffAmount: number; remainingBalance: number; createdAt: string }>;
  adjustments: Array<{ id: string; amount: number; reason: string; adjustedBy: string; adjustedAt: string; balanceBefore: number; balanceAfter: number }>;
};
type DeliveryOrderLike = { id: string; deliveryNumber?: string; contractId?: string; qty?: number; shippedDate?: string; createdAt?: string; tailAmount?: number; tailPaid?: number; status?: string };
type PurchaseContractLike = { id: string; contractNumber?: string; supplierId?: string; sku?: string };

interface ReconciliationDetailDialogProps {
  open: boolean;
  bill: MonthlyBill | null;
  recharges: RechargeLike[];
  rebateReceivables: RebateReceivableLike[];
  deliveryOrders: DeliveryOrderLike[];
  contracts: PurchaseContractLike[];
  consumptions: ConsumptionLike[];
  onClose: () => void;
  onViewVoucher: (voucher: string | null) => void;
}

export function ReconciliationDetailDialog({
  open,
  bill,
  recharges,
  rebateReceivables,
  deliveryOrders,
  contracts,
  consumptions,
  onClose,
  onViewVoucher,
}: ReconciliationDetailDialogProps) {
  if (!open || !bill) return null;

  const selectedBill = bill;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">账单详情 - {selectedBill.month}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-400 mb-1">代理商</div>
              <div className="text-slate-100">{selectedBill.agencyName}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">状态</div>
              <span className={`px-2 py-1 rounded text-xs border ${statusColors[selectedBill.status]}`}>
                {statusLabels[selectedBill.status]}
              </span>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">账单金额</div>
              <div className="text-slate-100">{formatCurrency(selectedBill.totalAmount, selectedBill.currency, "expense")}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">返点金额</div>
              <div className="text-emerald-300">{formatCurrency(selectedBill.rebateAmount || 0, selectedBill.currency, "income")}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">
                {!selectedBill.billCategory || selectedBill.billCategory === "Payable" ? "净应付" : "净应收"}
              </div>
              <div className={`font-medium ${selectedBill.billCategory === "Receivable" ? "text-emerald-300" : "text-rose-300"}`}>
                {formatCurrency(selectedBill.netAmount, selectedBill.currency, selectedBill.billCategory === "Receivable" ? "income" : "expense")}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">币种</div>
              <div className="text-slate-100">{selectedBill.currency}</div>
            </div>
          </div>

          {selectedBill.notes && (
            <div>
              <div className="text-xs text-slate-400 mb-1">备注</div>
              <div className="text-slate-300">{selectedBill.notes}</div>
            </div>
          )}

          {selectedBill.rejectionReason && (
            <div className="rounded-md bg-rose-500/10 border border-rose-500/40 p-3">
              <div className="text-xs text-rose-300 mb-1">退回原因</div>
              <div className="text-rose-200">{selectedBill.rejectionReason}</div>
            </div>
          )}

          {/* 关联的充值记录 */}
          {(selectedBill.billType === "广告" || selectedBill.billType === "广告返点") && selectedBill.rechargeIds && selectedBill.rechargeIds.length > 0 && (
            <div className="border-t border-slate-700 pt-4">
              <div className="text-sm font-medium text-slate-300 mb-3">关联充值记录</div>
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800/60">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-300">日期</th>
                      <th className="px-3 py-2 text-left text-slate-300">账户</th>
                      <th className="px-3 py-2 text-right text-slate-300">充值金额</th>
                      <th className="px-3 py-2 text-right text-slate-300">返点金额</th>
                      <th className="px-3 py-2 text-center text-slate-300">凭证</th>
                      <th className="px-3 py-2 text-left text-slate-300">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {selectedBill.rechargeIds.map((rechargeId) => {
                      const recharge = recharges.find((r: { id: string }) => r.id === rechargeId);
                      if (!recharge) return null;
                      return (
                        <tr key={rechargeId} className="hover:bg-slate-800/40">
                          <td className="px-3 py-2 text-slate-300">{recharge.date}</td>
                          <td className="px-3 py-2 text-slate-100">{recharge.accountName || "-"}</td>
                          <td className="px-3 py-2 text-right text-slate-100">
                            {formatCurrency(recharge.amount || 0, recharge.currency || "USD", "expense")}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-300">
                            {formatCurrency(recharge.rebateAmount || 0, recharge.currency || "USD", "income")}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {recharge.voucher && recharge.voucher.length > 10 ? (
                              <button onClick={() => onViewVoucher(recharge.voucher || null)} className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition">查看</button>
                            ) : (
                              <span className="text-slate-500 text-xs">无</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-400">{recharge.notes || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 广告返点账单：返点明细 */}
          {selectedBill.billType === "广告返点" && selectedBill.adAccountId && (() => {
            const receivable = rebateReceivables.find((r) =>
              r.adAccountId === selectedBill.adAccountId && selectedBill.rechargeIds?.some((rechargeId: string) => r.rechargeId === rechargeId)
            );
            if (!receivable) {
              return (
                <div className="border-t border-slate-700 pt-4">
                  <div className="text-sm font-medium text-slate-300 mb-3">返点明细</div>
                  <div className="text-center py-4 text-slate-500 bg-slate-800/60 rounded-lg">未找到关联的返点应收款记录</div>
                </div>
              );
            }
            return (
              <div className="border-t border-slate-700 pt-4">
                <div className="text-sm font-medium text-slate-300 mb-3">返点明细</div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 bg-slate-800/60 rounded-lg p-4">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">返点总额</div>
                      <div className="text-emerald-300 font-bold text-lg">{formatCurrency(receivable.rebateAmount, receivable.currency, "income")}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">当前余额</div>
                      <div className={`font-bold text-lg ${receivable.currentBalance > 0 ? "text-emerald-300" : "text-slate-400"}`}>
                        {formatCurrency(receivable.currentBalance, receivable.currency, "income")}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">状态</div>
                      <div className={`px-2 py-1 rounded text-xs border inline-block ${
                        receivable.status === "已结清" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
                        receivable.status === "核销中" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                        "bg-slate-500/20 text-slate-300 border-slate-500/40"
                      }`}>{receivable.status}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">产生日期</div>
                      <div className="text-slate-100">{receivable.rechargeDate}</div>
                    </div>
                  </div>
                  {receivable.writeoffRecords && receivable.writeoffRecords.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-slate-300 mb-2">核销流水</div>
                      <div className="rounded-lg border border-slate-700 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-800/60">
                            <tr>
                              <th className="px-3 py-2 text-left text-slate-300">消耗日期</th>
                              <th className="px-3 py-2 text-right text-slate-300">核销金额</th>
                              <th className="px-3 py-2 text-right text-slate-300">剩余余额</th>
                              <th className="px-3 py-2 text-left text-slate-300">核销时间</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {receivable.writeoffRecords.map((record: { id: string; consumptionDate?: string; writeoffAmount: number; remainingBalance: number; createdAt: string }) => (
                              <tr key={record.id} className="hover:bg-slate-800/40">
                                <td className="px-3 py-2 text-slate-300">{record.consumptionDate}</td>
                                <td className="px-3 py-2 text-right text-amber-300">{formatCurrency(record.writeoffAmount, receivable.currency, "expense")}</td>
                                <td className="px-3 py-2 text-right text-slate-300">{formatCurrency(record.remainingBalance, receivable.currency, "income")}</td>
                                <td className="px-3 py-2 text-slate-400">{new Date(record.createdAt).toLocaleString("zh-CN")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {receivable.adjustments && receivable.adjustments.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-slate-300 mb-2">手动修正记录</div>
                      <div className="rounded-lg border border-slate-700 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-800/60">
                            <tr>
                              <th className="px-3 py-2 text-left text-slate-300">修正金额</th>
                              <th className="px-3 py-2 text-left text-slate-300">修正原因</th>
                              <th className="px-3 py-2 text-left text-slate-300">修正人</th>
                              <th className="px-3 py-2 text-left text-slate-300">修正时间</th>
                              <th className="px-3 py-2 text-right text-slate-300">修正前余额</th>
                              <th className="px-3 py-2 text-right text-slate-300">修正后余额</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {receivable.adjustments.map((adj: { id: string; amount: number; reason: string; adjustedBy: string; adjustedAt: string; balanceBefore: number; balanceAfter: number }) => (
                              <tr key={adj.id} className="hover:bg-slate-800/40">
                                <td className={`px-3 py-2 font-medium ${adj.amount > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                                  {adj.amount > 0 ? "+" : ""}{formatCurrency(adj.amount, receivable.currency, adj.amount > 0 ? "income" : "expense")}
                                </td>
                                <td className="px-3 py-2 text-slate-300">{adj.reason}</td>
                                <td className="px-3 py-2 text-slate-300">{adj.adjustedBy}</td>
                                <td className="px-3 py-2 text-slate-400">{new Date(adj.adjustedAt).toLocaleString("zh-CN")}</td>
                                <td className="px-3 py-2 text-right text-slate-300">{formatCurrency(adj.balanceBefore, receivable.currency, "income")}</td>
                                <td className="px-3 py-2 text-right text-emerald-300">{formatCurrency(adj.balanceAfter, receivable.currency, "income")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {(!receivable.writeoffRecords || receivable.writeoffRecords.length === 0) && (!receivable.adjustments || receivable.adjustments.length === 0) && (
                    <div className="text-center py-4 text-slate-500 bg-slate-800/60 rounded-lg">暂无核销记录和修正记录</div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 工厂订单：拿货单明细 */}
          {selectedBill.billType === "工厂订单" && selectedBill.supplierId && (() => {
            const supplierDeliveryOrders = deliveryOrders.filter((order: DeliveryOrderLike) => {
              const contract = contracts.find((c: { id: string }) => c.id === order.contractId);
              if (!contract || (contract as PurchaseContractLike).supplierId !== selectedBill.supplierId) return false;
              const deliveryDate = order.shippedDate || order.createdAt || "";
              const orderMonth = deliveryDate.slice(0, 7);
              return orderMonth === selectedBill.month;
            });
            if (supplierDeliveryOrders.length === 0) {
              return (
                <div className="border-t border-slate-700 pt-4">
                  <div className="text-sm font-medium text-slate-300 mb-3">拿货单明细（供采购人员核对）</div>
                  <div className="text-center py-4 text-slate-500 bg-slate-800/60 rounded-lg">该月份暂无拿货单记录</div>
                </div>
              );
            }
            const ordersByContract = new Map<string, { contract: PurchaseContractLike; orders: DeliveryOrderLike[] }>();
            supplierDeliveryOrders.forEach((order: DeliveryOrderLike) => {
              const contract = contracts.find((c: { id: string }) => c.id === order.contractId) as PurchaseContractLike | undefined;
              if (!contract) return;
              if (!ordersByContract.has(contract.id)) ordersByContract.set(contract.id, { contract, orders: [] });
              ordersByContract.get(contract.id)!.orders.push(order);
            });
            const totalTailAmount = supplierDeliveryOrders.reduce(
              (sum: number, order: DeliveryOrderLike) => sum + ((order.tailAmount || 0) - (order.tailPaid || 0)),
              0
            );
            return (
              <div className="border-t border-slate-700 pt-4">
                <div className="text-sm font-medium text-slate-300 mb-3">拿货单明细（供采购人员核对）</div>
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800/60">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-300">拿货单号</th>
                        <th className="px-3 py-2 text-left text-slate-300">合同编号</th>
                        <th className="px-3 py-2 text-left text-slate-300">SKU</th>
                        <th className="px-3 py-2 text-right text-slate-300">数量</th>
                        <th className="px-3 py-2 text-left text-slate-300">发货日期</th>
                        <th className="px-3 py-2 text-right text-slate-300">尾款金额</th>
                        <th className="px-3 py-2 text-right text-slate-300">已付尾款</th>
                        <th className="px-3 py-2 text-right text-slate-300">未付尾款</th>
                        <th className="px-3 py-2 text-left text-slate-300">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {Array.from(ordersByContract.values()).map(({ contract, orders }) =>
                        orders.map((order: DeliveryOrderLike, index: number) => (
                          <tr key={order.id} className="hover:bg-slate-800/40">
                            {index === 0 && (
                              <>
                                <td className="px-3 py-2 text-slate-200 font-medium" rowSpan={orders.length}>{order.deliveryNumber}</td>
                                <td className="px-3 py-2 text-slate-300" rowSpan={orders.length}>{contract.contractNumber}</td>
                                <td className="px-3 py-2 text-slate-300" rowSpan={orders.length}>{contract.sku}</td>
                              </>
                            )}
                            <td className="px-3 py-2 text-right text-slate-200">{order.qty}</td>
                            <td className="px-3 py-2 text-slate-300">
                              {order.shippedDate ? new Date(order.shippedDate).toLocaleDateString("zh-CN") : order.createdAt ? new Date(order.createdAt).toLocaleDateString("zh-CN") : "-"}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-200">{formatCurrency(order.tailAmount || 0, selectedBill.currency, "expense")}</td>
                            <td className="px-3 py-2 text-right text-emerald-300">{formatCurrency(order.tailPaid || 0, selectedBill.currency, "expense")}</td>
                            <td className="px-3 py-2 text-right text-rose-300 font-medium">
                              {formatCurrency((order.tailAmount || 0) - (order.tailPaid || 0), selectedBill.currency, "expense")}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                order.status === "已入库" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" :
                                order.status === "运输中" ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" :
                                order.status === "已发货" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" :
                                "bg-slate-500/20 text-slate-300 border border-slate-500/40"
                              }`}>{order.status}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-slate-800/80">
                      <tr>
                        <td colSpan={7} className="px-3 py-2 text-right text-slate-300 font-medium">未付尾款合计：</td>
                        <td className="px-3 py-2 text-right text-rose-300 font-bold">{formatCurrency(totalTailAmount, selectedBill.currency, "expense")}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  <p>• 拿货时间：优先显示发货日期，无发货日期则显示创建时间</p>
                  <p>• 未付尾款合计应与账单金额一致，如有差异请核对</p>
                </div>
              </div>
            );
          })()}

          {/* 关联消耗记录 */}
          {selectedBill.consumptionIds && selectedBill.consumptionIds.length > 0 && (
            <div className="border-t border-slate-700 pt-4">
              <div className="text-sm font-medium text-slate-300 mb-3">关联消耗记录</div>
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800/60">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-300">日期</th>
                      <th className="px-3 py-2 text-left text-slate-300">账户</th>
                      <th className="px-3 py-2 text-right text-slate-300">消耗金额</th>
                      <th className="px-3 py-2 text-right text-slate-300">预估返点</th>
                      <th className="px-3 py-2 text-center text-slate-300">凭证</th>
                      <th className="px-3 py-2 text-left text-slate-300">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {selectedBill.consumptionIds.map((consumptionId: string) => {
                      const consumption = consumptions.find((c: { id: string }) => c.id === consumptionId);
                      if (!consumption) return null;
                      return (
                        <tr key={consumptionId} className="hover:bg-slate-800/40">
                          <td className="px-3 py-2 text-slate-300">{consumption.date}</td>
                          <td className="px-3 py-2 text-slate-100">{consumption.accountName || "-"}</td>
                          <td className="px-3 py-2 text-right text-slate-100">{formatCurrency(consumption.amount || 0, consumption.currency || "USD", "expense")}</td>
                          <td className="px-3 py-2 text-right text-emerald-300">{formatCurrency(consumption.estimatedRebate || 0, consumption.currency || "USD", "income")}</td>
                          <td className="px-3 py-2 text-center">
                            {consumption.voucher && consumption.voucher.length > 10 ? (
                              <button onClick={() => onViewVoucher(consumption.voucher || null)} className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition">查看</button>
                            ) : (
                              <span className="text-slate-500 text-xs">无</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-400">{consumption.notes || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 审批流程 */}
          <div className="border-t border-slate-700 pt-4">
            <div className="text-sm font-medium text-slate-300 mb-2">审批流程</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-400">创建人：</span><span className="text-slate-200">{selectedBill.createdBy}</span></div>
              {selectedBill.submittedToFinanceAt && <div className="flex justify-between"><span className="text-slate-400">提交给财务时间：</span><span className="text-slate-200">{new Date(selectedBill.submittedToFinanceAt).toLocaleString("zh-CN")}</span></div>}
              {selectedBill.financeReviewedBy && <div className="flex justify-between"><span className="text-slate-400">财务审批人：</span><span className="text-slate-200">{selectedBill.financeReviewedBy}</span></div>}
              {selectedBill.financeReviewedAt && <div className="flex justify-between"><span className="text-slate-400">财务审批时间：</span><span className="text-slate-200">{new Date(selectedBill.financeReviewedAt).toLocaleString("zh-CN")}</span></div>}
              {selectedBill.submittedAt && <div className="flex justify-between"><span className="text-slate-400">提交给主管时间：</span><span className="text-slate-200">{new Date(selectedBill.submittedAt).toLocaleString("zh-CN")}</span></div>}
              {selectedBill.approvedBy && <div className="flex justify-between"><span className="text-slate-400">主管审批人：</span><span className="text-slate-200">{selectedBill.approvedBy}</span></div>}
              {selectedBill.approvedAt && <div className="flex justify-between"><span className="text-slate-400">主管审批时间：</span><span className="text-slate-200">{new Date(selectedBill.approvedAt).toLocaleString("zh-CN")}</span></div>}
              {selectedBill.cashierApprovedBy && <div className="flex justify-between"><span className="text-slate-400">出纳审核人：</span><span className="text-slate-200">{selectedBill.cashierApprovedBy}</span></div>}
              {selectedBill.cashierApprovedAt && <div className="flex justify-between"><span className="text-slate-400">出纳审核时间：</span><span className="text-slate-200">{new Date(selectedBill.cashierApprovedAt).toLocaleString("zh-CN")}</span></div>}
              {selectedBill.paidBy && <div className="flex justify-between"><span className="text-slate-400">付款人：</span><span className="text-slate-200">{selectedBill.paidBy}</span></div>}
              {selectedBill.paidAt && <div className="flex justify-between"><span className="text-slate-400">付款时间：</span><span className="text-slate-200">{new Date(selectedBill.paidAt).toLocaleString("zh-CN")}</span></div>}
            </div>
          </div>

          {selectedBill.paymentApplicationVoucher && (
            <div className="border-t border-slate-700 pt-4">
              <div className="text-sm font-medium text-slate-300 mb-3">付款申请书凭证</div>
              <div className="bg-slate-800/60 rounded-lg p-4">
                {(() => {
                  const voucherUrl = Array.isArray(selectedBill.paymentApplicationVoucher) ? selectedBill.paymentApplicationVoucher[0] : selectedBill.paymentApplicationVoucher;
                  return voucherUrl && voucherUrl.length > 10 ? (
                    <button onClick={() => onViewVoucher(voucherUrl)} className="px-4 py-2 rounded border border-primary-500/40 bg-primary-500/10 text-sm text-primary-100 hover:bg-primary-500/20 transition">查看付款申请书凭证</button>
                  ) : (
                    <span className="text-slate-500 text-sm">无凭证</span>
                  );
                })()}
              </div>
            </div>
          )}

          {selectedBill.status === "Paid" && (
            <div className="border-t border-slate-700 pt-4">
              <div className="text-sm font-medium text-slate-300 mb-3">付款明细</div>
              <div className="bg-slate-800/60 rounded-lg p-4 space-y-3">
                {selectedBill.paymentVoucherNumber && <div className="flex justify-between items-center"><span className="text-slate-400">付款单号：</span><span className="text-primary-300 font-mono font-medium">{selectedBill.paymentVoucherNumber}</span></div>}
                {selectedBill.paymentAccountName && <div className="flex justify-between"><span className="text-slate-400">付款账户：</span><span className="text-slate-200">{selectedBill.paymentAccountName}</span></div>}
                {selectedBill.paymentMethod && <div className="flex justify-between"><span className="text-slate-400">付款方式：</span><span className="text-slate-200">{selectedBill.paymentMethod}</span></div>}
                {selectedBill.paymentVoucher && (
                  <div>
                    <span className="text-slate-400 block mb-2">付款凭证：</span>
                    {(() => {
                      const voucherUrl = Array.isArray(selectedBill.paymentVoucher) ? selectedBill.paymentVoucher[0] : selectedBill.paymentVoucher;
                      return voucherUrl && voucherUrl.length > 10 ? (
                        <button onClick={() => onViewVoucher(voucherUrl)} className="px-3 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-sm text-primary-100 hover:bg-primary-500/20 transition">查看付款凭证</button>
                      ) : (
                        <span className="text-slate-500 text-sm">无凭证</span>
                      );
                    })()}
                  </div>
                )}
                {selectedBill.paymentRemarks && <div><span className="text-slate-400 block mb-1">付款备注：</span><span className="text-slate-300 text-sm">{selectedBill.paymentRemarks}</span></div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
