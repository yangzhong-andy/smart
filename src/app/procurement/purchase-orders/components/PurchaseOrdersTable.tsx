"use client";

import { currency, formatDate, getProductionProgress, isContractPickupComplete } from "./types";
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
        <table className="w-full min-w-[1280px] text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 align-top">合同编号</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 align-top">供应商</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 align-top min-w-[300px]">
                SPU / SKU · 数量
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 align-top">合同总额</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 align-top min-w-[260px]">
                拿货进度
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 align-top">生产进度</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 align-top">财务状态</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 align-top">操作</th>
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
                  <td className="px-4 py-2 align-top">
                    <div className="font-medium text-slate-100 break-words">{contract.contractNumber}</div>
                    <div className="text-[11px] text-slate-500">{formatDate(contract.createdAt)}</div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="text-slate-100 break-words">{contract.supplierName}</div>
                    <div className="text-[11px] text-slate-500">
                      {contract.depositRate > 0
                        ? `定金 ${contract.depositRate}% · `
                        : (contract.depositAmount ?? 0) > 0
                        ? "定金（固定） · "
                        : ""}
                      尾款账期 {contract.tailPeriodDays} 天
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    {contract.items && contract.items.length > 0 ? (
                      <div className="space-y-1 min-w-0">
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
                            <div className="text-[11px] text-slate-400 font-medium break-words">
                              {spuLabel ? (
                                <span className="text-primary-300/90">SPU: {spuLabel}</span>
                              ) : null}
                              {spuLabel ? " · " : null}
                              共 {contract.items.length} 个变体 · 合同总数 {contract.totalQty}
                            </div>
                          );
                        })()}
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                          {contract.items.map((item) => (
                            <div
                              key={item.id}
                              className="text-[11px] text-slate-300 border-b border-slate-800/60 pb-1 last:border-0 last:pb-0"
                            >
                              <div
                                className="break-words text-slate-200 leading-snug"
                                title={[item.spuName, item.sku, item.skuName]
                                  .filter(Boolean)
                                  .join(" / ")}
                              >
                                {item.spuName ? `${item.spuName} · ${item.sku}` : item.sku}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px]">
                                <span className="text-amber-200/90 font-medium" title="下单数量">
                                  数量 {item.qty}
                                </span>
                                <span className="text-slate-500 text-[10px]">{currency(item.unitPrice)}</span>
                              </div>
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
                  <td className="px-4 py-2 align-top">
                    <div className="text-slate-100">{currency(contract.totalAmount)}</div>
                    <div className="text-[11px] text-amber-200">
                      定金 {currency(contract.depositAmount)}
                      {(contract.depositRate ?? 0) === 0 && (contract.depositAmount ?? 0) > 0 && (
                        <span className="text-slate-400">（固定）</span>
                      )}
                      {contract.depositPaid > 0 && (
                        <span className="text-emerald-300">
                          （已付 {currency(contract.depositPaid)}）
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    {contract.items && contract.items.length > 0 ? (
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-1 rounded-full bg-slate-800 h-1.5 overflow-hidden min-w-[60px]">
                            <div
                              className="h-full bg-primary-500 transition-all duration-300"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                            {contract.pickedQty} / {contract.totalQty}
                          </span>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {contract.items.map((item) => {
                            const itemRemain = item.qty - item.pickedQty;
                            return (
                              <div
                                key={item.id}
                                className="text-[11px] border-b border-slate-800/60 pb-1 last:border-0 last:pb-0"
                              >
                                <div className="break-words text-slate-300 leading-snug">{item.sku}</div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-500">
                                  <span className="tabular-nums">
                                    {item.pickedQty} / {item.qty}
                                  </span>
                                  {itemRemain > 0 && (
                                    <span className="text-amber-500/90 font-medium">剩 {itemRemain}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="text-[10px] mt-0.5 flex items-center gap-1 flex-wrap">
                          <ContractPickupStatusPill contract={contract} />
                          {remainingQty > 0 && <span className="text-slate-500">· 剩余 {remainingQty}</span>}
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
                        <div className="text-[11px] mt-1 flex items-center gap-1 flex-wrap">
                          <ContractPickupStatusPill contract={contract} />
                          {remainingQty > 0 && <span className="text-slate-500">· 剩余 {remainingQty}</span>}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <ProductionProgressCell
                      contract={contract}
                      clientNow={clientNow}
                      formatDate={formatDate}
                    />
                  </td>
                  <td className="px-4 py-2 align-top">
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
                  <td className="px-4 py-2 text-right align-top">
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

function ContractPickupStatusPill({ contract }: { contract: PurchaseContract }) {
  if (contract.status === "已结清") {
    return (
      <span className="rounded px-1.5 py-0.5 text-emerald-300 bg-emerald-500/20 text-[10px] font-medium">
        已结清
      </span>
    );
  }
  if (contract.status === "已取消") {
    return <span className="rounded px-1.5 py-0.5 text-slate-400 bg-slate-600/40 text-[10px]">已取消</span>;
  }
  if (isContractPickupComplete(contract)) {
    return (
      <span className="rounded px-1.5 py-0.5 text-teal-300 bg-teal-500/20 text-[10px] font-medium">
        完结
      </span>
    );
  }
  return <span className="text-slate-500">{contract.status}</span>;
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
