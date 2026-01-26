"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { Factory, Plus, X, Save, ArrowLeft, FileText, Zap, CheckCircle } from "lucide-react";
import { PageHeader, ActionButton, EmptyState } from "@/components/ui";
import Link from "next/link";
import { getPurchaseContracts, type PurchaseContract } from "@/lib/purchase-contracts-store";
import { getDeliveryOrders, type DeliveryOrder } from "@/lib/delivery-orders-store";
import { getMonthlyBills, saveMonthlyBills, type MonthlyBill } from "@/lib/reconciliation-store";
import { formatCurrency } from "@/lib/currency-utils";
import ConfirmDialog from "@/components/ConfirmDialog";

// 供应商类型定义（从采购模块复用）
type Supplier = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  depositRate: number;
  tailPeriodDays: number;
  settleBase: "SHIPMENT" | "INBOUND";
  level?: "S" | "A" | "B" | "C";
  category?: string;
  address?: string;
  bankAccount?: string;
  bankName?: string;
  taxId?: string;
  invoiceRequirement?: "SPECIAL_INVOICE" | "GENERAL_INVOICE" | "NO_INVOICE";
  invoicePoint?: number;
  defaultLeadTime?: number;
  moq?: number;
  factoryImages?: string | string[];
  createdAt?: string;
};

const SUPPLIERS_KEY = "suppliers";

function getSuppliers(): Supplier[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(SUPPLIERS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse suppliers", e);
    return [];
  }
}

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

type SupplierBillDetail = {
  contractId: string;
  contractNumber: string;
  hasDeposit: boolean; // 是否有预付款
  depositAmount: number; // 合同定金金额
  deliveryOrders: Array<{
    orderId: string;
    deliveryNumber: string;
    qty: number;
    tailAmount: number; // 尾款金额（未付）
    totalAmount?: number; // 拿货单总金额（无预付款时使用）
    shippedDate?: string;
  }>;
  totalTailAmount: number; // 尾款合计
  totalBillAmount: number; // 账单金额（有预付款=尾款，无预付款=全部金额）
};

type OtherFee = {
  id: string;
  type: string;
  amount: number;
  description: string;
};

export default function SupplierBillsPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contracts, setContracts] = useState<PurchaseContract[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [billDetails, setBillDetails] = useState<SupplierBillDetail[]>([]);
  const [otherFees, setOtherFees] = useState<OtherFee[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchResult, setBatchResult] = useState<{
    total: number;
    success: number;
    skipped: number;
    failed: number;
    details: Array<{ supplierName: string; status: "success" | "skipped" | "failed"; message: string }>;
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
    
    setSuppliers(getSuppliers());
    setContracts(getPurchaseContracts());
    setDeliveryOrders(getDeliveryOrders());
  }, []);

  // 自动汇总账单明细
  const handleAutoCalculate = () => {
    if (!selectedSupplierId) {
      toast.error("请先选择供应商");
      return;
    }

    const supplier = suppliers.find((s) => s.id === selectedSupplierId);
    if (!supplier) {
      toast.error("供应商不存在");
      return;
    }

    // 获取该供应商的所有合同
    const supplierContracts = contracts.filter((c) => c.supplierId === selectedSupplierId);

    // 获取该供应商的所有拿货单（按月份筛选）
    const monthStart = `${selectedMonth}-01`;
    const monthEnd = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 1) - 1)
      .toISOString()
      .slice(0, 10);

    const supplierDeliveryOrders = deliveryOrders.filter((order) => {
      // 检查拿货单是否属于该供应商的合同
      const contract = supplierContracts.find((c) => c.id === order.contractId);
      if (!contract) return false;

      // 按拿货时间筛选：优先使用发货日期，如果没有则使用创建时间
      const deliveryDate = order.shippedDate || order.createdAt;
      const orderMonth = deliveryDate.slice(0, 7); // YYYY-MM
      return orderMonth === selectedMonth;
    });

    // 按合同分组汇总
    const detailsMap = new Map<string, SupplierBillDetail>();

    supplierDeliveryOrders.forEach((order) => {
      const contract = supplierContracts.find((c) => c.id === order.contractId);
      if (!contract) return;

      // 判断是否有预付款
      const hasDeposit = (contract.depositRate || 0) > 0 || (contract.depositAmount || 0) > 0;
      
      if (!detailsMap.has(contract.id)) {
        detailsMap.set(contract.id, {
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          hasDeposit: hasDeposit,
          depositAmount: contract.depositAmount || 0,
          deliveryOrders: [],
          totalTailAmount: 0,
          totalBillAmount: 0
        });
      }

      const detail = detailsMap.get(contract.id)!;
      const unpaidTailAmount = order.tailAmount - (order.tailPaid || 0);
      
      // 对于拿货单：
      // - 有预付款：tailAmount 是尾款部分，月账单只算尾款
      // - 无预付款：tailAmount 就是全部金额，月账单算全部金额
      // 所以无论是否有预付款，都使用 unpaidTailAmount 作为账单金额
      
      detail.deliveryOrders.push({
        orderId: order.id,
        deliveryNumber: order.deliveryNumber,
        qty: order.qty,
        tailAmount: unpaidTailAmount, // 未付尾款（有预付款）或未付全部金额（无预付款）
        shippedDate: order.shippedDate
      });
      
      detail.totalTailAmount += unpaidTailAmount;
      detail.totalBillAmount += unpaidTailAmount; // 账单金额 = 未付金额
    });

    const details = Array.from(detailsMap.values());
    setBillDetails(details);

    if (details.length === 0) {
      toast.success("该月份暂无拿货单记录");
    } else {
      toast.success(`已汇总 ${details.length} 个合同的拿货单`);
    }
  };

  // 添加其他费用
  const handleAddOtherFee = () => {
    const newFee: OtherFee = {
      id: `fee-${Date.now()}`,
      type: "",
      amount: 0,
      description: ""
    };
    setOtherFees([...otherFees, newFee]);
  };

  // 删除其他费用
  const handleRemoveOtherFee = (id: string) => {
    setOtherFees(otherFees.filter((f) => f.id !== id));
  };

  // 更新其他费用
  const handleUpdateOtherFee = (id: string, field: keyof OtherFee, value: string | number) => {
    setOtherFees(
      otherFees.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    );
  };

  // 计算总金额（有预付款=尾款合计，无预付款=全部金额合计）
  const totalAmount = useMemo(() => {
    const billTotal = billDetails.reduce((sum, detail) => sum + detail.totalBillAmount, 0);
    const feesTotal = otherFees.reduce((sum, fee) => sum + (fee.amount || 0), 0);
    return billTotal + feesTotal;
  }, [billDetails, otherFees]);

  // 生成账单
  const handleGenerateBill = () => {
    if (!selectedSupplierId) {
      toast.error("请选择供应商");
      return;
    }

    const supplier = suppliers.find((s) => s.id === selectedSupplierId);
    if (!supplier) {
      toast.error("供应商不存在");
      return;
    }

    if (billDetails.length === 0 && otherFees.length === 0) {
      toast.error("请先汇总账单明细或添加其他费用");
      return;
    }

    // 检查是否已存在该供应商该月份的账单
    (async () => {
      const existingBills = await getMonthlyBills();
      if (!Array.isArray(existingBills)) {
        createNewBill(supplier);
        return;
      }
      const existingBill = existingBills.find(
        (b) =>
          b.supplierId === selectedSupplierId &&
          b.month === selectedMonth &&
          b.billType === "工厂订单"
      );

      if (existingBill) {
        setConfirmDialog({
          open: true,
          title: "账单已存在",
          message: `该供应商 ${selectedMonth} 的账单已存在，是否覆盖？`,
          type: "warning",
          onConfirm: async () => {
            // 删除旧账单
            const updatedBills = existingBills.filter((b) => b.id !== existingBill.id);
            await saveMonthlyBills(updatedBills);
            // 创建新账单
            await createNewBill(supplier);
            setConfirmDialog(null);
          }
        });
      } else {
        await createNewBill(supplier);
      }
    })();
  };

  // 批量自动生成所有供应商的月账单
  const handleBatchGenerate = () => {
    if (!selectedMonth) {
      toast.error("请先选择账单月份");
      return;
    }

    setConfirmDialog({
      open: true,
      title: "批量生成账单",
      message: `确定要为所有有拿货单的供应商自动生成 ${selectedMonth} 的月账单吗？`,
      type: "info",
      onConfirm: async () => {
        setConfirmDialog(null);
        await executeBatchGenerate();
      }
    });
  };

  const executeBatchGenerate = async () => {
    setIsBatchGenerating(true);
    setBatchResult(null);

    try {
      const existingBills = await getMonthlyBills();
      if (!Array.isArray(existingBills)) {
        toast.error("获取账单列表失败");
        setIsBatchGenerating(false);
        return;
      }
      const results: Array<{ supplierName: string; status: "success" | "skipped" | "failed"; message: string }> = [];
      let successCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      // 遍历所有供应商
      for (const supplier of suppliers) {
        try {
          // 检查是否已存在该供应商该月份的账单
          const existingBill = existingBills.find(
            (b) =>
              b.supplierId === supplier.id &&
              b.month === selectedMonth &&
              b.billType === "工厂订单"
          );

          if (existingBill) {
            results.push({
              supplierName: supplier.name,
              status: "skipped",
              message: "账单已存在"
            });
            skippedCount++;
            continue;
          }

          // 获取该供应商的所有合同
          const supplierContracts = contracts.filter((c) => c.supplierId === supplier.id);

          // 获取该供应商的所有拿货单（按月份筛选）
          const supplierDeliveryOrders = deliveryOrders.filter((order) => {
            const contract = supplierContracts.find((c) => c.id === order.contractId);
            if (!contract) return false;
            // 按拿货时间筛选：优先使用发货日期，如果没有则使用创建时间
            const deliveryDate = order.shippedDate || order.createdAt;
            const orderMonth = deliveryDate.slice(0, 7); // YYYY-MM
            return orderMonth === selectedMonth;
          });

          if (supplierDeliveryOrders.length === 0) {
            results.push({
              supplierName: supplier.name,
              status: "skipped",
              message: "该月份无拿货单"
            });
            skippedCount++;
            continue;
          }

          // 按合同分组汇总
          const detailsMap = new Map<string, SupplierBillDetail>();

          supplierDeliveryOrders.forEach((order) => {
            const contract = supplierContracts.find((c) => c.id === order.contractId);
            if (!contract) return;

            // 判断是否有预付款
            const hasDeposit = (contract.depositRate || 0) > 0 || (contract.depositAmount || 0) > 0;
            
            if (!detailsMap.has(contract.id)) {
              detailsMap.set(contract.id, {
                contractId: contract.id,
                contractNumber: contract.contractNumber,
                hasDeposit: hasDeposit,
                depositAmount: contract.depositAmount || 0,
                deliveryOrders: [],
                totalTailAmount: 0,
                totalBillAmount: 0
              });
            }

            const detail = detailsMap.get(contract.id)!;
            const unpaidTailAmount = order.tailAmount - (order.tailPaid || 0);
            
            detail.deliveryOrders.push({
              orderId: order.id,
              deliveryNumber: order.deliveryNumber,
              qty: order.qty,
              tailAmount: unpaidTailAmount,
              shippedDate: order.shippedDate
            });
            
            detail.totalTailAmount += unpaidTailAmount;
            detail.totalBillAmount += unpaidTailAmount;
          });

          const details = Array.from(detailsMap.values());
          const totalAmount = details.reduce((sum, detail) => sum + detail.totalBillAmount, 0);

          if (totalAmount <= 0) {
            results.push({
              supplierName: supplier.name,
              status: "skipped",
              message: "无未付尾款"
            });
            skippedCount++;
            continue;
          }

          // 创建账单明细说明
          const detailsText = details
            .map((detail) => {
              const ordersText = detail.deliveryOrders
                .map((o) => `${o.deliveryNumber}(${o.qty}件,尾款${formatCurrency(o.tailAmount, "CNY")})`)
                .join("、");
              return `${detail.contractNumber}: ${ordersText}`;
            })
            .join("\n");

          const currency = "CNY" as "USD" | "CNY" | "HKD";

          const newBill: MonthlyBill = {
            id: `bill-supplier-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            month: selectedMonth,
            billCategory: "Payable" as const,
            billType: "工厂订单" as const,
            supplierId: supplier.id,
            supplierName: supplier.name,
            agencyId: "",
            agencyName: "",
            totalAmount: totalAmount,
            currency: currency,
            rebateAmount: 0,
            netAmount: totalAmount,
            consumptionIds: [],
            status: "Draft" as const,
            createdBy: "财务人员",
            createdAt: new Date().toISOString(),
            notes: `供应商月账单明细:\n${detailsText}`
          };

          const updatedBills = [...existingBills, newBill];
          await saveMonthlyBills(updatedBills);
          existingBills.push(newBill); // 更新本地引用，避免重复生成

          results.push({
            supplierName: supplier.name,
            status: "success",
            message: `生成成功，金额：${formatCurrency(totalAmount, currency)}`
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to generate bill for supplier ${supplier.name}`, error);
          results.push({
            supplierName: supplier.name,
            status: "failed",
            message: `生成失败：${error instanceof Error ? error.message : "未知错误"}`
          });
          failedCount++;
        }
      }

      setBatchResult({
        total: suppliers.length,
        success: successCount,
        skipped: skippedCount,
        failed: failedCount,
        details: results
      });

      if (successCount > 0) {
        toast.success(`批量生成完成：成功 ${successCount} 个，跳过 ${skippedCount} 个，失败 ${failedCount} 个`);
      } else {
        toast.error("没有生成任何账单");
      }
    } catch (error) {
      console.error("Failed to batch generate bills", error);
      toast.error("批量生成失败");
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const createNewBill = async (supplier: Supplier) => {
    setIsGenerating(true);

    try {
      // 收集所有拿货单ID
      const deliveryOrderIds: string[] = [];
      billDetails.forEach((detail) => {
        detail.deliveryOrders.forEach((order) => {
          deliveryOrderIds.push(order.orderId);
        });
      });

      // 确定币种（从第一个合同获取，或默认CNY）
      const firstContract = contracts.find((c) => c.supplierId === selectedSupplierId);
      const currency = "CNY" as "USD" | "CNY" | "HKD"; // 默认CNY，后续可以从供应商信息获取

      // 创建账单明细说明
      const detailsText = billDetails
        .map((detail) => {
          const ordersText = detail.deliveryOrders
            .map((o) => `${o.deliveryNumber}(${o.qty}件,尾款${formatCurrency(o.tailAmount, currency)})`)
            .join("、");
          return `${detail.contractNumber}: ${ordersText}`;
        })
        .join("\n");

      const otherFeesText =
        otherFees.length > 0
          ? "\n其他费用:\n" +
            otherFees.map((f) => `${f.type}: ${formatCurrency(f.amount, currency)} (${f.description})`).join("\n")
          : "";

      const notes = `供应商月账单明细:\n${detailsText}${otherFeesText}`;

      const newBill: MonthlyBill = {
        id: `bill-supplier-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        month: selectedMonth,
        billCategory: "Payable" as const,
        billType: "工厂订单" as const,
        supplierId: selectedSupplierId,
        supplierName: supplier.name,
        agencyId: "", // 供应商账单不使用agencyId
        agencyName: "", // 供应商账单不使用agencyName
        totalAmount: totalAmount,
        currency: currency,
        rebateAmount: 0, // 供应商账单无返点
        netAmount: totalAmount,
        consumptionIds: [], // 供应商账单不使用consumptionIds
        status: "Draft" as const,
        createdBy: "财务人员", // 实际应该从用户系统获取
        createdAt: new Date().toISOString(),
        notes: notes
      };

      const existingBills = await getMonthlyBills();
      if (!Array.isArray(existingBills)) {
        throw new Error("获取账单列表失败");
      }
      const updatedBills = [...existingBills, newBill];
      await saveMonthlyBills(updatedBills);

      toast.success("账单生成成功");
      
      // 清空表单
      setBillDetails([]);
      setOtherFees([]);
      
      // 延迟跳转，让用户看到成功提示
      setTimeout(() => {
        window.location.href = "/finance/monthly-bills";
      }, 1500);
    } catch (e) {
      console.error("Failed to generate bill", e);
      toast.error("生成账单失败");
      throw e; // 重新抛出错误，让 InteractiveButton 也能捕获
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="供应商月账单生成"
        description="按拿货单汇总生成供应商月账单"
        actions={
          <>
            <Link href="/finance/monthly-bills">
              <ActionButton variant="secondary" icon={ArrowLeft}>
                返回月账单管理
              </ActionButton>
            </Link>
          </>
        }
      />

      {/* 选择供应商和月份 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <p className="text-sm text-blue-200">
            <strong>汇总规则：</strong>按拿货时间（发货日期优先，无发货日期则按创建时间）汇总到对应月份的账单。
            例如：1月份的所有拿货单，无论何时创建，都会汇总到1月的月账单中。
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              选择供应商 <span className="text-rose-400">*</span>
            </label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-slate-100 outline-none focus:border-primary-400"
            >
              <option value="">请选择供应商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              账单月份 <span className="text-rose-400">*</span>
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-slate-100 outline-none focus:border-primary-400"
            />
            <p className="text-xs text-slate-500 mt-1">将汇总该月份所有拿货单的尾款</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <InteractiveButton
            onClick={handleAutoCalculate}
            disabled={!selectedSupplierId || !selectedMonth}
            icon={<FileText className="h-4 w-4" />}
            variant="primary"
            size="md"
          >
            自动汇总账单
          </InteractiveButton>
          <InteractiveButton
            onClick={handleBatchGenerate}
            disabled={!selectedMonth || isBatchGenerating}
            icon={<Zap className="h-4 w-4" />}
            variant="primary"
            size="md"
          >
            批量生成所有供应商账单
          </InteractiveButton>
        </div>
      </div>

      {/* 批量生成结果 */}
      {batchResult && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-100">批量生成结果</h2>
            <button
              onClick={() => setBatchResult(null)}
              className="text-slate-400 hover:text-slate-200 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
              <div className="text-sm text-slate-400 mb-1">成功</div>
              <div className="text-2xl font-bold text-emerald-300">{batchResult.success}</div>
            </div>
            <div className="rounded-lg border border-slate-500/40 bg-slate-500/10 p-4">
              <div className="text-sm text-slate-400 mb-1">跳过</div>
              <div className="text-2xl font-bold text-slate-300">{batchResult.skipped}</div>
            </div>
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4">
              <div className="text-sm text-slate-400 mb-1">失败</div>
              <div className="text-2xl font-bold text-rose-300">{batchResult.failed}</div>
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {batchResult.details.map((detail, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  detail.status === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : detail.status === "skipped"
                      ? "border-slate-500/40 bg-slate-500/10"
                      : "border-rose-500/40 bg-rose-500/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  {detail.status === "success" && (
                    <CheckCircle className="h-4 w-4 text-emerald-300" />
                  )}
                  <span className="text-slate-200 font-medium">{detail.supplierName}</span>
                </div>
                <span
                  className={`text-sm ${
                    detail.status === "success"
                      ? "text-emerald-300"
                      : detail.status === "skipped"
                        ? "text-slate-400"
                        : "text-rose-300"
                  }`}
                >
                  {detail.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 账单明细预览 */}
      {billDetails.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">账单明细</h2>
          <div className="space-y-4">
            {billDetails.map((detail) => {
              const contract = contracts.find((c) => c.id === detail.contractId);
              return (
                <div
                  key={detail.contractId}
                  className="rounded-lg border border-slate-800 bg-slate-900/40 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-slate-200">
                          合同：{detail.contractNumber}
                        </div>
                        {detail.hasDeposit ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-300 border border-blue-500/40">
                            有预付款
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs bg-slate-500/20 text-slate-300 border border-slate-500/40">
                            无预付款
                          </span>
                        )}
                      </div>
                      {contract && (
                        <div className="text-xs text-slate-400 mt-1">
                          SKU: {contract.sku} · 单价: {formatCurrency(contract.unitPrice, "CNY")}
                          {detail.hasDeposit && detail.depositAmount > 0 && (
                            <span> · 预付款: {formatCurrency(detail.depositAmount, "CNY")}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">
                        {detail.hasDeposit ? "尾款合计" : "账单金额"}
                      </div>
                      <div className="text-lg font-semibold text-primary-300">
                        {formatCurrency(detail.totalBillAmount, "CNY")}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {detail.deliveryOrders.map((order) => (
                      <div
                        key={order.orderId}
                        className="flex items-center justify-between text-sm bg-slate-800/40 rounded p-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-slate-300">{order.deliveryNumber}</span>
                          <span className="text-slate-400">数量: {order.qty}</span>
                          {order.shippedDate && (
                            <span className="text-slate-500 text-xs">
                              发货: {formatDate(order.shippedDate)}
                            </span>
                          )}
                        </div>
                        <span className="text-slate-200 font-medium">
                          {formatCurrency(order.tailAmount, "CNY")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 其他费用 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">其他费用</h2>
          <ActionButton variant="secondary" size="sm" icon={Plus} onClick={handleAddOtherFee}>
            添加费用
          </ActionButton>
        </div>

        {otherFees.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无其他费用</p>
            <p className="text-xs text-slate-600 mt-1">点击"添加费用"按钮添加物流费、质检费等</p>
          </div>
        ) : (
          <div className="space-y-3">
            {otherFees.map((fee) => (
              <div
                key={fee.id}
                className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3"
              >
                <input
                  type="text"
                  placeholder="费用类型（如：物流费）"
                  value={fee.type}
                  onChange={(e) => handleUpdateOtherFee(fee.id, "type", e.target.value)}
                  className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                />
                <input
                  type="number"
                  placeholder="金额"
                  value={fee.amount || ""}
                  onChange={(e) =>
                    handleUpdateOtherFee(fee.id, "amount", Number(e.target.value) || 0)
                  }
                  min={0}
                  step="0.01"
                  className="w-32 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                />
                <input
                  type="text"
                  placeholder="说明"
                  value={fee.description}
                  onChange={(e) => handleUpdateOtherFee(fee.id, "description", e.target.value)}
                  className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                />
                <button
                  onClick={() => handleRemoveOtherFee(fee.id)}
                  className="p-2 rounded border border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 账单汇总 */}
      {(billDetails.length > 0 || otherFees.length > 0) && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">账单汇总</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">拿货单金额合计：</span>
              <span className="text-slate-200">
                {formatCurrency(
                  billDetails.reduce((sum, detail) => sum + detail.totalBillAmount, 0),
                  "CNY"
                )}
              </span>
            </div>
            {billDetails.some((d) => d.hasDeposit) && (
              <div className="text-xs text-slate-500 mt-1">
                （含预付款合同：只计算尾款；无预付款合同：计算全部金额）
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">其他费用合计：</span>
              <span className="text-slate-200">
                {formatCurrency(
                  otherFees.reduce((sum, fee) => sum + (fee.amount || 0), 0),
                  "CNY"
                )}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-700">
              <span className="text-lg font-semibold text-slate-100">账单总额：</span>
              <span className="text-2xl font-bold text-primary-300">
                {formatCurrency(totalAmount, "CNY")}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <InteractiveButton
              onClick={handleGenerateBill}
              disabled={isGenerating || totalAmount <= 0}
              icon={<Save className="h-4 w-4" />}
              variant="primary"
              size="md"
            >
              生成账单
            </InteractiveButton>
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type || "warning"}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
