"use client";

import { currency, formatDate, getProductionProgress } from "./types";
import type { PurchaseContract } from "./types";
import { PurchaseOrderActions } from "./PurchaseOrderActions";

type ExpenseRequest = { id: string; summary: string; status: string };

interface PurchaseOrdersTableProps {
  contracts: PurchaseContract[];
  filteredContracts: PurchaseContract[];
  expenseRequestsList: ExpenseRequest[];
  clientNow: Date | null;
  isSuperAdmin: boolean;
  onOpenDetail: (contractId: string) => void;
  onOpenDelivery: (contractId: string) => void;
  onPayment: (contractId: string, type: "deposit" | "tail", deliveryOrderId?: string) => void;
  onGenerateContract: (contractId: string) => void;
  onDeleteContract: (contractId: string) => void;
}

export function PurchaseOrdersTable({
  contracts,
  filteredContracts,
  expenseRequestsList,
  clientNow,
  isSuperAdmin,
  onOpenDetail,
  onOpenDelivery,
  onPayment,
  onGenerateContract,
  onDeleteContract,
}: PurchaseOrdersTableProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">合同编号</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">供应商</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">SPU / SKU · 数量</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">合同总额</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">拿货进度</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">生产进度</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">财务状态</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/40">
            {filteredContracts.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                  {contracts.length === 0
                    ? '暂无采购合同，请点击右上角"新建采购合同"'
                    : "没有符合条件的合同"}
                </td>
              </tr>
            )}
            {filteredContracts.map((contract) => {
              const progressPercent =
                contract.totalQty > 0 ? (contract.pickedQty / contract.totalQty) * 100 : 0;
              const remainingQty = contract.totalQty - contract.pickedQty;

              return (
                <tr key={contract.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-100">{contract.contractNumber}</div>
                    <div className="text-[11px] text-slate-500">{formatDate(contract.createdAt)}</div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-slate-100">{contract.supplierName}</div>
                    <div className="text-[11px] text-slate-500">
                      定金 {contract.depositRate}% · 尾款账期 {contract.tailPeriodDays} 天
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {contract.items && contract.items.length > 0 ? (
                      <div className="space-y-1 max-w-[260px]">
                        {(() => {
                          const spuSet = new Set(
                            contract.items.map((i) => i.spuName).filter(Boolean)
                          );
                          const spuLabel =
                            spuSet.size === 1
                              ? Array.from(spuSet)[0]
                              : spuSet.size > 1
                              ? "多款"
                              : null;
                          return (
                            <div className="text-[11px] text-slate-400 font-medium">
                              {spuLabel ? (
                                <span className="text-primary-300/90">SPU: {spuLabel}</span>
                              ) : null}
                              {spuLabel ? " · " : null}
                              共 {contract.items.length} 个变体 · 合同总数 {contract.totalQty}
                            </div>
                          );
                        })()}
                        <div className="max-h-24 overflow-y-auto space-y-0.5 pr-1">
                          {contract.items.map((item) => (
                            <div
                              key={item.id}
                              className="text-[11px] text-slate-300 flex justify-between gap-2 border-b border-slate-800/60 pb-0.5 last:border-0 last:pb-0"
                            >
                              <span
                                className="truncate"
                                title={[item.spuName, item.sku, item.skuName]
                                  .filter(Boolean)
                                  .join(" / ")}
                              >
                                {item.spuName ? `${item.spuName} · ${item.sku}` : item.sku}
                              </span>
                              <span className="text-slate-500 shrink-0">
                                {currency(item.unitPrice)} × {item.qty}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-slate-100">{contract.sku}</div>
                        <div className="text-[11px] text-slate-500">
                          单价 {currency(contract.unitPrice)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          合同总数 {contract.totalQty}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-slate-100">{currency(contract.totalAmount)}</div>
                    <div className="text-[11px] text-amber-200">
                      定金 {currency(contract.depositAmount)}
                      {contract.depositPaid > 0 && (
                        <span className="text-emerald-300">
                          （已付 {currency(contract.depositPaid)}）
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {contract.items && contract.items.length > 0 ? (
                      <div className="space-y-1 max-w-[180px]">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-1 rounded-full bg-slate-800 h-1.5 overflow-hidden min-w-[60px]">
                            <div
                              className="h-full bg-primary-500 transition-all duration-300"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400 whitespace-nowrap">
                            {contract.pickedQty} / {contract.totalQty}
                          </span>
                        </div>
                        <div className="max-h-20 overflow-y-auto space-y-0.5">
                          {contract.items.map((item) => {
                            const itemRemain = item.qty - item.pickedQty;
                            return (
                              <div
                                key={item.id}
                                className="text-[11px] text-slate-400 flex justify-between gap-2 border-b border-slate-800/60 pb-0.5 last:border-0 last:pb-0"
                              >
                                <span className="truncate">{item.sku}</span>
                                <span className="text-slate-500 shrink-0">
                                  {item.pickedQty} / {item.qty}
                                  {itemRemain > 0 && (
                                    <span className="text-amber-500/80 ml-0.5">剩{itemRemain}</span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {contract.status}{" "}
                          {remainingQty > 0 && `· 剩余 ${remainingQty}`}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 rounded-full bg-slate-800 h-2 overflow-hidden">
                            <div
                              className="h-full bg-primary-500 transition-all duration-300"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-300 whitespace-nowrap">
                            {contract.pickedQty} / {contract.totalQty}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {contract.status}{" "}
                          {remainingQty > 0 && `· 剩余 ${remainingQty}`}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <ProductionProgressCell
                      contract={contract}
                      clientNow={clientNow}
                      formatDate={formatDate}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-slate-100">
                      {currency(contract.totalPaid || 0)} / {currency(contract.totalAmount)}
                    </div>
                    <div className="text-[11px] text-slate-500">已付总额 / 合同总额</div>
                    {(contract.totalOwed ?? 0) > 0 && (
                      <div className="text-[11px] text-amber-200 mt-1">
                        还欠 {currency(contract.totalOwed ?? 0)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <PurchaseOrderActions
                      contract={contract}
                      expenseRequestsList={expenseRequestsList}
                      remainingQty={remainingQty}
                      isSuperAdmin={isSuperAdmin}
                      onGenerateContract={onGenerateContract}
                      onOpenDetail={onOpenDetail}
                      onOpenDelivery={onOpenDelivery}
                      onPayment={onPayment}
                      onDelete={onDeleteContract}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductionProgressCell({
  contract,
  clientNow,
  formatDate,
}: {
  contract: PurchaseContract;
  clientNow: Date | null;
  formatDate: (d: string) => string;
}) {
  const finished = contract.finishedQty ?? 0;
  const total = contract.totalQty;
  const isFullyComplete = total > 0 && finished >= total;

  if (!contract.deliveryDate) {
    return (
      <div className="space-y-0.5 min-w-[90px]">
        <div className="text-[11px] text-slate-500">未设交货日期</div>
        <div className="text-[10px] text-emerald-400/90">
          完工 {finished} / {total}
        </div>
      </div>
    );
  }

  if (isFullyComplete) {
    const orderDate = contract.createdAt ? new Date(contract.createdAt) : null;
    if (orderDate) orderDate.setHours(0, 0, 0, 0);
    const endDate = clientNow ? new Date(clientNow) : new Date();
    endDate.setHours(0, 0, 0, 0);
    const productionDays = orderDate
      ? Math.max(
          0,
          Math.round(
            (endDate.getTime() - orderDate.getTime()) / (24 * 60 * 60 * 1000)
          )
        )
      : null;
    return (
      <div className="space-y-0.5 min-w-[90px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-full bg-slate-800 h-1.5 overflow-hidden min-w-[50px]">
            <div
              className="h-full bg-emerald-500/90 transition-all duration-300"
              style={{ width: "100%" }}
            />
          </div>
          <span className="text-[11px] text-emerald-400 whitespace-nowrap">
            100%
          </span>
        </div>
        <div className="text-[10px] text-emerald-400/90">
          已完工 · {formatDate(contract.deliveryDate)} 交货
        </div>
        <div className="text-[10px] text-emerald-400/90">
          完工 {finished} / {total}
        </div>
        {productionDays != null && (
          <div className="text-[10px] text-slate-400">生产 {productionDays} 天</div>
        )}
      </div>
    );
  }

  const prod = clientNow
    ? getProductionProgress(
        contract.createdAt,
        contract.deliveryDate,
        clientNow
      )
    : null;

  if (!prod) {
    return (
      <div className="space-y-0.5 min-w-[90px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-full bg-slate-800 h-1.5 overflow-hidden min-w-[50px]">
            <div className="h-full bg-slate-700 w-0" />
          </div>
          <span className="text-[11px] text-slate-500">—</span>
        </div>
        <div className="text-[10px] text-slate-500">
          · {formatDate(contract.deliveryDate)} 交货
        </div>
        <div className="text-[10px] text-emerald-400/90">
          完工 {finished} / {total}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 min-w-[90px]">
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-full bg-slate-800 h-1.5 overflow-hidden min-w-[50px]">
          <div
            className="h-full bg-amber-500/80 transition-all duration-300"
            style={{ width: `${prod.percent}%` }}
          />
        </div>
        <span className="text-[11px] text-slate-400 whitespace-nowrap">
          {prod.percent}%
        </span>
      </div>
      <div className="text-[10px] text-slate-500">
        {prod.totalDays > 0 ? `已过 ${prod.elapsedDays} / 共 ${prod.totalDays} 天 · ` : ""}
        {prod.label}
        <span className="ml-1">· {formatDate(contract.deliveryDate)} 交货</span>
      </div>
      <div className="text-[10px] text-emerald-400/90">
        完工 {finished} / {total}
      </div>
    </div>
  );
}
