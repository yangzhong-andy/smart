"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Megaphone, Plus, X, Save, ArrowLeft, FileText, Zap, CheckCircle } from "lucide-react";
import { PageHeader, ActionButton, EmptyState } from "@/components/ui";
import Link from "next/link";
import { 
  getAgencies, 
  getAdConsumptions, 
  getAdRecharges,
  type Agency, 
  type AdConsumption,
  type AdRecharge 
} from "@/lib/ad-agency-store";
import { getMonthlyBills, saveMonthlyBills, type MonthlyBill } from "@/lib/reconciliation-store";
import { formatCurrency } from "@/lib/currency-utils";
import ConfirmDialog from "@/components/ConfirmDialog";

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

type AdBillDetail = {
  accountId: string;
  accountName: string;
  consumptions: Array<{
    consumptionId: string;
    date: string;
    amount: number;
    currency: string;
    estimatedRebate?: number;
    rebateRate?: number;
  }>;
  totalConsumption: number; // 消耗总额
  totalRebate: number; // 返点总额
  netAmount: number; // 净金额（消耗 - 返点）
  currency: string;
};

type OtherFee = {
  id: string;
  type: string;
  amount: number;
  description: string;
};

export default function AdBillsPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [consumptions, setConsumptions] = useState<AdConsumption[]>([]);
  const [recharges, setRecharges] = useState<AdRecharge[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [billDetails, setBillDetails] = useState<AdBillDetail[]>([]);
  const [otherFees, setOtherFees] = useState<OtherFee[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchResult, setBatchResult] = useState<{
    total: number;
    success: number;
    skipped: number;
    failed: number;
    details: Array<{ agencyName: string; status: "success" | "skipped" | "failed"; message: string }>;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title?: string;
    message: string;
    type?: "danger" | "warning" | "info";
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    setAgencies(getAgencies());
    setConsumptions(getAdConsumptions());
    setRecharges(getAdRecharges());
  }, []);

  // 自动汇总账单明细
  const handleAutoCalculate = () => {
    if (!selectedAgencyId) {
      toast.error("请先选择代理商");
      return;
    }

    const agency = agencies.find((a) => a.id === selectedAgencyId);
    if (!agency) {
      toast.error("代理商不存在");
      return;
    }

    // 获取该代理商的所有消耗记录（按月份筛选）
    const agencyConsumptions = consumptions.filter((c) => {
      // 检查消耗是否属于该代理商
      if (c.agencyId !== selectedAgencyId) return false;
      
      // 按消耗月份筛选
      return c.month === selectedMonth;
    });

    if (agencyConsumptions.length === 0) {
      toast.error(`该代理商在 ${selectedMonth} 没有消耗记录`);
      return;
    }

    // 按账户分组汇总
    const accountMap = new Map<string, AdBillDetail>();

    agencyConsumptions.forEach((consumption) => {
      const accountId = consumption.adAccountId;
      
      if (!accountMap.has(accountId)) {
        accountMap.set(accountId, {
          accountId,
          accountName: consumption.accountName || "-",
          consumptions: [],
          totalConsumption: 0,
          totalRebate: 0,
          netAmount: 0,
          currency: consumption.currency,
        });
      }

      const detail = accountMap.get(accountId)!;
      detail.consumptions.push({
        consumptionId: consumption.id,
        date: consumption.date,
        amount: consumption.amount,
        currency: consumption.currency,
        estimatedRebate: consumption.estimatedRebate,
        rebateRate: consumption.rebateRate,
      });
      detail.totalConsumption += consumption.amount;
      detail.totalRebate += consumption.estimatedRebate || 0;
    });

    // 计算净金额
    const details = Array.from(accountMap.values()).map((detail) => ({
      ...detail,
      netAmount: detail.totalConsumption - detail.totalRebate,
    }));

    setBillDetails(details);
    toast.success(`已汇总 ${details.length} 个账户的消耗记录`);
  };

  // 添加其他费用
  const handleAddOtherFee = () => {
    const newFee: OtherFee = {
      id: Date.now().toString(),
      type: "",
      amount: 0,
      description: "",
    };
    setOtherFees([...otherFees, newFee]);
  };

  // 删除其他费用
  const handleRemoveOtherFee = (id: string) => {
    setOtherFees(otherFees.filter((f) => f.id !== id));
  };

  // 更新其他费用
  const handleUpdateOtherFee = (id: string, field: keyof OtherFee, value: any) => {
    setOtherFees(
      otherFees.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    );
  };

  // 计算账单总金额
  const totalAmount = useMemo(() => {
    const consumptionTotal = billDetails.reduce((sum, detail) => sum + detail.totalConsumption, 0);
    const otherFeesTotal = otherFees.reduce((sum, fee) => sum + fee.amount, 0);
    return consumptionTotal + otherFeesTotal;
  }, [billDetails, otherFees]);

  // 计算返点总额
  const totalRebate = useMemo(() => {
    return billDetails.reduce((sum, detail) => sum + detail.totalRebate, 0);
  }, [billDetails]);

  // 计算净金额
  const netAmount = useMemo(() => {
    return totalAmount - totalRebate;
  }, [totalAmount, totalRebate]);

  // 获取币种（优先使用第一个账户的币种）
  const currency = useMemo(() => {
    if (billDetails.length === 0) return "USD";
    return billDetails[0].currency || "USD";
  }, [billDetails]);

  // 创建月账单
  const createNewBill = () => {
    if (!selectedAgencyId) {
      toast.error("请先选择代理商");
      return;
    }

    if (billDetails.length === 0) {
      toast.error("请先汇总账单明细");
      return;
    }

    const agency = agencies.find((a) => a.id === selectedAgencyId);
    if (!agency) {
      toast.error("代理商不存在");
      return;
    }

    // 检查是否已存在该代理商该月份的账单
    const existingBills = getMonthlyBills();
    const existingBill = existingBills.find(
      (b) =>
        b.billType === "广告" &&
        b.agencyId === selectedAgencyId &&
        b.month === selectedMonth
    );

    if (existingBill) {
      setConfirmDialog({
        open: true,
        title: "确认覆盖",
        message: `该代理商在 ${selectedMonth} 已存在月账单，是否覆盖？`,
        type: "warning",
        onConfirm: () => {
          // 删除旧账单
          const updatedBills = existingBills.filter((b) => b.id !== existingBill.id);
          saveMonthlyBills(updatedBills);
          // 继续创建新账单
          executeCreateBill(agency);
        },
      });
      return;
    }

    executeCreateBill(agency);
  };

  const executeCreateBill = (agency: Agency) => {
    setIsGenerating(true);

    try {
      const consumptionIds = billDetails.flatMap((detail) =>
        detail.consumptions.map((c) => c.consumptionId)
      );

      const newBill: MonthlyBill = {
        id: `bill_${Date.now()}`,
        month: selectedMonth,
        billCategory: "Payable", // 广告费用是应付款
        billType: "广告",
        agencyId: agency.id,
        agencyName: agency.name,
        totalAmount: totalAmount,
        currency: currency as "USD" | "CNY" | "HKD",
        rebateAmount: totalRebate,
        netAmount: netAmount,
        consumptionIds: consumptionIds,
        status: "Draft",
        createdBy: "部门同事", // 实际应该从用户系统获取
        createdAt: new Date().toISOString(),
        notes: otherFees.length > 0
          ? `其他费用：${otherFees.map((f) => `${f.type} ${f.amount} ${f.description}`).join("；")}`
          : undefined,
      };

      const bills = getMonthlyBills();
      bills.push(newBill);
      saveMonthlyBills(bills);

      toast.success("月账单创建成功");
      
      // 清空表单
      setBillDetails([]);
      setOtherFees([]);
      setSelectedAgencyId("");
      
      // 延迟跳转
      setTimeout(() => {
        window.location.href = "/finance/monthly-bills";
      }, 1500);
    } catch (error) {
      console.error("Failed to create bill", error);
      toast.error("创建失败，请重试");
    } finally {
      setIsGenerating(false);
      setConfirmDialog(null);
    }
  };

  // 批量生成
  const handleBatchGenerate = () => {
    if (agencies.length === 0) {
      toast.error("没有可用的代理商");
      return;
    }

    setConfirmDialog({
      open: true,
      title: "批量生成月账单",
      message: `将为所有代理商生成 ${selectedMonth} 的月账单，是否继续？`,
      type: "info",
      onConfirm: () => {
        executeBatchGenerate();
      },
    });
  };

  const executeBatchGenerate = () => {
    setIsBatchGenerating(true);
    setBatchResult({
      total: agencies.length,
      success: 0,
      skipped: 0,
      failed: 0,
      details: [],
    });

    const results: Array<{ agencyName: string; status: "success" | "skipped" | "failed"; message: string }> = [];
    const bills = getMonthlyBills();

    agencies.forEach((agency) => {
      // 检查是否已存在
      const existingBill = bills.find(
        (b) =>
          b.billType === "广告" &&
          b.agencyId === agency.id &&
          b.month === selectedMonth
      );

      if (existingBill) {
        results.push({
          agencyName: agency.name,
          status: "skipped",
          message: "已存在月账单",
        });
        return;
      }

      // 获取该代理商的消耗记录
      const agencyConsumptions = consumptions.filter(
        (c) => c.agencyId === agency.id && c.month === selectedMonth
      );

      if (agencyConsumptions.length === 0) {
        results.push({
          agencyName: agency.name,
          status: "skipped",
          message: "没有消耗记录",
        });
        return;
      }

      // 按账户分组汇总
      const accountMap = new Map<string, AdBillDetail>();

      agencyConsumptions.forEach((consumption) => {
        const accountId = consumption.adAccountId;
        
        if (!accountMap.has(accountId)) {
          accountMap.set(accountId, {
            accountId,
            accountName: consumption.accountName || "-",
            consumptions: [],
            totalConsumption: 0,
            totalRebate: 0,
            netAmount: 0,
            currency: consumption.currency,
          });
        }

        const detail = accountMap.get(accountId)!;
        detail.consumptions.push({
          consumptionId: consumption.id,
          date: consumption.date,
          amount: consumption.amount,
          currency: consumption.currency,
          estimatedRebate: consumption.estimatedRebate,
          rebateRate: consumption.rebateRate,
        });
        detail.totalConsumption += consumption.amount;
        detail.totalRebate += consumption.estimatedRebate || 0;
      });

      const details = Array.from(accountMap.values()).map((detail) => ({
        ...detail,
        netAmount: detail.totalConsumption - detail.totalRebate,
      }));

      const consumptionIds = details.flatMap((detail) =>
        detail.consumptions.map((c) => c.consumptionId)
      );

      const totalConsumption = details.reduce((sum, d) => sum + d.totalConsumption, 0);
      const totalRebate = details.reduce((sum, d) => sum + d.totalRebate, 0);
      const netAmount = totalConsumption - totalRebate;
      const currency = details.length > 0 ? (details[0].currency || "USD") : "USD";

      try {
        const newBill: MonthlyBill = {
          id: `bill_${Date.now()}_${agency.id}`,
          month: selectedMonth,
          billCategory: "Payable",
          billType: "广告",
          agencyId: agency.id,
          agencyName: agency.name,
          totalAmount: totalConsumption,
          currency: currency as "USD" | "CNY" | "HKD",
          rebateAmount: totalRebate,
          netAmount: netAmount,
          consumptionIds: consumptionIds,
          status: "Draft",
          createdBy: "部门同事", // 实际应该从用户系统获取
          createdAt: new Date().toISOString(),
        };

        bills.push(newBill);
        results.push({
          agencyName: agency.name,
          status: "success",
          message: `生成成功，消耗 ${formatCurrency(totalConsumption, currency, "expense")}，返点 ${formatCurrency(totalRebate, currency, "expense")}`,
        });
      } catch (error) {
        results.push({
          agencyName: agency.name,
          status: "failed",
          message: `生成失败：${error instanceof Error ? error.message : "未知错误"}`,
        });
      }
    });

    saveMonthlyBills(bills);

    setBatchResult({
      total: agencies.length,
      success: results.filter((r) => r.status === "success").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      details: results,
    });

    setIsBatchGenerating(false);
    toast.success(`批量生成完成：成功 ${results.filter((r) => r.status === "success").length}，跳过 ${results.filter((r) => r.status === "skipped").length}，失败 ${results.filter((r) => r.status === "failed").length}`);
  };

  const selectedAgency = agencies.find((a) => a.id === selectedAgencyId);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="广告月账单生成"
        description="按消耗记录汇总生成广告代理商月账单"
        actions={
          <>
            <Link href="/finance/monthly-bills">
              <ActionButton icon={ArrowLeft} variant="secondary">
                返回月账单管理
              </ActionButton>
            </Link>
          </>
        }
      />

      {/* 选择代理商和月份 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">选择条件</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              代理商 <span className="text-red-400">*</span>
            </label>
            <select
              value={selectedAgencyId}
              onChange={(e) => setSelectedAgencyId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-slate-100 outline-none focus:border-primary-400"
            >
              <option value="">请选择代理商</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name} ({agency.platform})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              账单月份 <span className="text-red-400">*</span>
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-slate-100 outline-none focus:border-primary-400"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <ActionButton
            icon={Zap}
            variant="primary"
            onClick={handleAutoCalculate}
            disabled={!selectedAgencyId || !selectedMonth}
          >
            自动汇总
          </ActionButton>
          <ActionButton
            icon={Zap}
            variant="secondary"
            onClick={handleBatchGenerate}
            disabled={!selectedMonth || isBatchGenerating}
          >
            批量生成所有代理商
          </ActionButton>
        </div>
      </div>

      {/* 批量生成结果 */}
      {batchResult && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">批量生成结果</h2>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-100">{batchResult.total}</div>
              <div className="text-sm text-slate-400">总计</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{batchResult.success}</div>
              <div className="text-sm text-slate-400">成功</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{batchResult.skipped}</div>
              <div className="text-sm text-slate-400">跳过</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{batchResult.failed}</div>
              <div className="text-sm text-slate-400">失败</div>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {batchResult.details.map((detail, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  detail.status === "success"
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : detail.status === "skipped"
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-red-500/10 border-red-500/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-slate-200 font-medium">{detail.agencyName}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      detail.status === "success"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : detail.status === "skipped"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {detail.status === "success" ? "成功" : detail.status === "skipped" ? "跳过" : "失败"}
                  </span>
                </div>
                <div className="text-sm text-slate-400 mt-1">{detail.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 账单明细 */}
      {billDetails.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">账单明细</h2>
          
          {billDetails.map((detail, index) => (
            <div key={detail.accountId} className="mb-6 last:mb-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-md font-medium text-slate-200">
                  账户：{detail.accountName}
                </h3>
                <div className="text-sm text-slate-400">
                  消耗：{formatCurrency(detail.totalConsumption, detail.currency, "expense")} | 
                  返点：{formatCurrency(detail.totalRebate, detail.currency, "expense")} | 
                  净额：{formatCurrency(detail.netAmount, detail.currency, "expense")}
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/60">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-300">消耗日期</th>
                      <th className="px-3 py-2 text-right text-slate-300">消耗金额</th>
                      <th className="px-3 py-2 text-right text-slate-300">返点比例</th>
                      <th className="px-3 py-2 text-right text-slate-300">返点金额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {detail.consumptions.map((consumption) => (
                      <tr key={consumption.consumptionId} className="hover:bg-slate-800/40">
                        <td className="px-3 py-2 text-slate-300">{formatDate(consumption.date)}</td>
                        <td className="px-3 py-2 text-right text-slate-200">
                          {formatCurrency(consumption.amount, consumption.currency, "expense")}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300">
                          {consumption.rebateRate ? `${consumption.rebateRate}%` : "-"}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-200">
                          {consumption.estimatedRebate
                            ? formatCurrency(consumption.estimatedRebate, consumption.currency, "expense")
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 其他费用 */}
      {billDetails.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-100">其他费用（可选）</h2>
            <ActionButton icon={Plus} variant="secondary" onClick={handleAddOtherFee}>
              添加费用
            </ActionButton>
          </div>

          {otherFees.length === 0 ? (
            <div className="text-center py-8 text-slate-400">暂无其他费用</div>
          ) : (
            <div className="space-y-3">
              {otherFees.map((fee) => (
                <div key={fee.id} className="flex gap-3 items-start">
                  <input
                    type="text"
                    placeholder="费用类型"
                    value={fee.type}
                    onChange={(e) => handleUpdateOtherFee(fee.id, "type", e.target.value)}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                  <input
                    type="number"
                    placeholder="金额"
                    value={fee.amount || ""}
                    onChange={(e) => handleUpdateOtherFee(fee.id, "amount", Number(e.target.value) || 0)}
                    className="w-32 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                  <input
                    type="text"
                    placeholder="说明"
                    value={fee.description}
                    onChange={(e) => handleUpdateOtherFee(fee.id, "description", e.target.value)}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                  <button
                    onClick={() => handleRemoveOtherFee(fee.id)}
                    className="p-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 账单汇总 */}
      {billDetails.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">账单汇总</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-slate-400 mb-1">消耗总额</div>
              <div className="text-xl font-semibold text-slate-100">
                {formatCurrency(totalAmount, currency, "expense")}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400 mb-1">返点总额</div>
              <div className="text-xl font-semibold text-emerald-400">
                {formatCurrency(totalRebate, currency, "expense")}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400 mb-1">净金额（应付）</div>
              <div className="text-xl font-semibold text-primary-400">
                {formatCurrency(netAmount, currency, "expense")}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400 mb-1">币种</div>
              <div className="text-xl font-semibold text-slate-300">{currency}</div>
            </div>
          </div>

          {selectedAgency && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="text-sm text-slate-400">
                <div>代理商：{selectedAgency.name}</div>
                {selectedAgency.creditTerm && (
                  <div className="mt-1">账期规则：{selectedAgency.creditTerm}</div>
                )}
              </div>
            </div>
          )}

          <div className="mt-6">
            <ActionButton
              icon={Save}
              variant="primary"
              onClick={createNewBill}
              disabled={isGenerating}
            >
              {isGenerating ? "生成中..." : "生成月账单"}
            </ActionButton>
          </div>
        </div>
      )}

      {/* 空状态 */}
      {billDetails.length === 0 && !isBatchGenerating && (
        <EmptyState
          icon={Megaphone}
          title="暂无账单明细"
          description="请选择代理商和月份，然后点击「自动汇总」生成账单明细"
        />
      )}

      {/* 确认对话框 */}
      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type}
          onConfirm={() => {
            confirmDialog.onConfirm();
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
