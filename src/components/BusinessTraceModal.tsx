"use client";

import { useState, useEffect } from "react";
import {
  traceBusinessUID,
  getBusinessChain,
  parseBusinessUID,
  STATUS_LABELS,
  STATUS_COLORS,
  type BusinessTraceResult,
  type BusinessEntityType
} from "@/lib/business-core";
import { formatCurrency } from "@/lib/currency-utils";

type BusinessTraceModalProps = {
  uid: string;
  isOpen: boolean;
  onClose: () => void;
};

const ENTITY_TYPE_LABELS: Record<BusinessEntityType, string> = {
  ORDER: "采购订单",
  RECHARGE: "充值记录",
  CONSUMPTION: "消耗记录",
  BILL: "账单",
  PAYMENT_REQUEST: "付款申请",
  CASH_FLOW: "财务流水",
  SETTLEMENT: "结算记录",
  REBATE: "返点记录",
  TRANSFER: "内部划拨",
  ADJUSTMENT: "调整记录"
};

export default function BusinessTraceModal({ uid, isOpen, onClose }: BusinessTraceModalProps) {
  const [traceResults, setTraceResults] = useState<BusinessTraceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsedUID, setParsedUID] = useState<ReturnType<typeof parseBusinessUID>>({ entityType: null, timestamp: null, random: null });

  useEffect(() => {
    if (isOpen && uid) {
      setLoading(true);
      const parsed = parseBusinessUID(uid);
      setParsedUID(parsed);
      
      // 执行穿透查询
      const results = traceBusinessUID(uid, 5);
      setTraceResults(results);
      setLoading(false);
    }
  }, [isOpen, uid]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-4xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", zIndex: 51 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">业务穿透查询</h2>
            <p className="text-xs text-slate-400 mt-1">UID: {uid}</p>
            {parsedUID.entityType && (
              <p className="text-xs text-slate-400">
                类型: {ENTITY_TYPE_LABELS[parsedUID.entityType] || parsedUID.entityType}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-2xl"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-400">查询中...</div>
        ) : traceResults.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p>未找到关联业务数据</p>
            <p className="text-xs mt-2">该UID可能不存在或没有关联数据</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-slate-300 mb-4">
              共找到 {traceResults.length} 条关联记录
            </div>
            
            {traceResults.map((result, index) => (
              <div
                key={result.uid}
                className="rounded-lg border border-slate-800 bg-slate-800/40 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400">
                        #{index + 1}
                      </span>
                      <span className="text-sm font-semibold text-slate-100">
                        {ENTITY_TYPE_LABELS[result.entityType] || result.entityType}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[result.status]}`}
                      >
                        {STATUS_LABELS[result.status]}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      UID: {result.uid}
                    </div>
                  </div>
                </div>

                {/* 显示关键业务数据 */}
                <div className="mt-3 space-y-2 text-sm">
                  {result.data.amount !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">金额:</span>
                      <span className="text-slate-100 font-medium">
                        {formatCurrency(
                          Math.abs(result.data.amount),
                          result.data.currency || "CNY",
                          result.data.type === "income" ? "income" : "expense"
                        )}
                      </span>
                    </div>
                  )}
                  {result.data.netAmount !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">净金额:</span>
                      <span className="text-slate-100 font-medium">
                        {formatCurrency(
                          result.data.netAmount,
                          result.data.currency || "CNY",
                          result.data.billCategory === "Receivable" ? "income" : "expense"
                        )}
                      </span>
                    </div>
                  )}
                  {result.data.date && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">日期:</span>
                      <span className="text-slate-100">
                        {new Date(result.data.date).toLocaleDateString("zh-CN")}
                      </span>
                    </div>
                  )}
                  {result.data.createdAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">创建时间:</span>
                      <span className="text-slate-100">
                        {new Date(result.data.createdAt).toLocaleString("zh-CN")}
                      </span>
                    </div>
                  )}
                </div>

                {/* 显示关联关系 */}
                {result.relations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <div className="text-xs text-slate-400 mb-2">关联关系:</div>
                    <div className="space-y-1">
                      {result.relations.map((rel, relIndex) => (
                        <div key={relIndex} className="text-xs text-slate-500">
                          {rel.relationType}: {rel.targetUID === result.uid ? rel.sourceUID : rel.targetUID}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
