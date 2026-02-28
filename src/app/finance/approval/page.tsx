"use client";

import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useState, useCallback, useMemo } from "react";
import useSWR, { mutate } from "swr";
import {
  getMonthlyBills,
  saveMonthlyBills,
  getBillsByStatus,
  type MonthlyBill,
  type BillStatus,
  type BillType,
  type BillCategory,
} from "@/lib/reconciliation-store";
import type { Agency } from "@/lib/ad-agency-store";
import { formatCurrencyString } from "@/lib/currency-utils";
import { createPendingEntry, getPendingEntryByRelatedId } from "@/lib/pending-entry-store";
import type { RebateReceivable } from "@/lib/rebate-receivable-store";
import {
  getExpenseRequests,
  getExpenseRequestsByStatus,
  updateExpenseRequest,
  type ExpenseRequest,
} from "@/lib/expense-income-request-store";
import {
  getIncomeRequests,
  getIncomeRequestsByStatus,
  updateIncomeRequest,
  type IncomeRequest,
} from "@/lib/expense-income-request-store";
import { ApprovalStats } from "./components/ApprovalStats";
import { ApprovalFilters, type ActiveTab } from "./components/ApprovalFilters";
import { ApprovalList } from "./components/ApprovalList";
import { ApprovalDetailDialog } from "./components/ApprovalDetailDialog";

export default function ApprovalCenterPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending"); // 褰撳墠鏍囩锛氬緟瀹℃壒/鍘嗗彶璁板綍
  const [historyFilter, setHistoryFilter] = useState<BillStatus | "all">("all"); // 鍘嗗彶璁板綍鐘舵€佺瓫閫?
  const [billTypeFilter, setBillTypeFilter] = useState<BillType | "all">("all"); // 璐﹀崟绫诲瀷绛涢€夛紙寰呭鎵瑰拰鍘嗗彶璁板綍鍏辩敤锛?
  
  const [selectedBill, setSelectedBill] = useState<MonthlyBill | null>(null);
  const [selectedExpenseRequest, setSelectedExpenseRequest] = useState<ExpenseRequest | null>(null);
  const [selectedIncomeRequest, setSelectedIncomeRequest] = useState<IncomeRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isRequestDetailOpen, setIsRequestDetailOpen] = useState(false);
  const [voucherViewModal, setVoucherViewModal] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; type: "bill" | "expense" | "income" | null; id: string | null }>({
    open: false,
    type: null,
    id: null
  });
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title?: string;
    message: string;
    type?: "danger" | "warning" | "info";
    onConfirm: () => void;
  } | null>(null);
  
  // 妯℃嫙鐢ㄦ埛瑙掕壊锛堝疄闄呭簲璇ヤ粠鐢ㄦ埛绯荤粺鑾峰彇锛?
  const [userRole] = useState<"finance" | "boss" | "cashier">("boss");

  // SWR fetcher 鍑芥暟
  const fetcher = useCallback(async (key: string) => {
    if (typeof window === "undefined") return null;
    switch (key) {
      case "monthly-bills":
        return await getMonthlyBills();
      case "pending-bills":
        return await getBillsByStatus("Pending_Approval");
      case "expense-requests":
        return await getExpenseRequests();
      case "pending-expense-requests":
        return await getExpenseRequestsByStatus("Pending_Approval");
      case "income-requests":
        return await getIncomeRequests();
      case "pending-income-requests":
        return await getIncomeRequestsByStatus("Pending_Approval");
      case "recharges": {
        const res = await fetch("/api/ad-recharges");
        if (!res.ok) throw new Error(`API 閿欒: ${res.status}`);
        return res.json();
      }
      case "consumptions": {
        const res = await fetch("/api/ad-consumptions");
        if (!res.ok) throw new Error(`API 閿欒: ${res.status}`);
        return res.json();
      }
      case "rebate-receivables": {
        const res = await fetch("/api/rebate-receivables");
        if (!res.ok) throw new Error(`API 閿欒: ${res.status}`);
        return res.json();
      }
      default:
        return null;
    }
  }, []);

  // 浣跨敤 SWR 鑾峰彇鏁版嵁锛堜紭鍖栵細鍏抽棴鐒︾偣鍒锋柊锛屽鍔犲幓閲嶉棿闅斾互鍑忓皯鏁版嵁搴撹闂級
  const { data: allBillsData } = useSWR("monthly-bills", fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 浼樺寲锛氬鍔犲埌10鍒嗛挓鍐呭幓閲?
  });
  const { data: pendingBillsData } = useSWR("pending-bills", fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 浼樺寲锛氬鍔犲埌10鍒嗛挓鍐呭幓閲?
  });
  const { data: expenseRequestsData } = useSWR("expense-requests", fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300000 // 浼樺寲锛氬鍔犲埌5鍒嗛挓鍐呭幓閲?
  });
  const { data: pendingExpenseRequestsData } = useSWR("pending-expense-requests", fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300000 // 浼樺寲锛氬鍔犲埌5鍒嗛挓鍐呭幓閲?
  });
  const { data: incomeRequestsData } = useSWR("income-requests", fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300000 // 浼樺寲锛氬鍔犲埌5鍒嗛挓鍐呭幓閲?
  });
  const { data: pendingIncomeRequestsData } = useSWR("pending-income-requests", fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300000 // 浼樺寲锛氬鍔犲埌5鍒嗛挓鍐呭幓閲?
  });
  const { data: rechargesData } = useSWR("recharges", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10鍒嗛挓鍐呭幓閲?
  });
  const { data: consumptionsData } = useSWR("consumptions", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10鍒嗛挓鍐呭幓閲?
  });
  const { data: rebateReceivablesData } = useSWR("rebate-receivables", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10鍒嗛挓鍐呭幓閲?
  });

  // 纭繚鏁版嵁鏄暟缁勫苟鎸囧畾绫诲瀷
  const allBills: MonthlyBill[] = Array.isArray(allBillsData) ? (allBillsData as MonthlyBill[]) : [];
  const pendingBills: MonthlyBill[] = Array.isArray(pendingBillsData) ? (pendingBillsData as MonthlyBill[]) : [];
  const allExpenseRequests: ExpenseRequest[] = Array.isArray(expenseRequestsData) ? (expenseRequestsData as ExpenseRequest[]) : [];
  const pendingExpenseRequests: ExpenseRequest[] = Array.isArray(pendingExpenseRequestsData) ? (pendingExpenseRequestsData as ExpenseRequest[]) : [];
  const allIncomeRequests: IncomeRequest[] = Array.isArray(incomeRequestsData) ? (incomeRequestsData as IncomeRequest[]) : [];
  const pendingIncomeRequests: IncomeRequest[] = Array.isArray(pendingIncomeRequestsData) ? (pendingIncomeRequestsData as IncomeRequest[]) : [];
  const recharges: any[] = Array.isArray(rechargesData) ? rechargesData : [];
  const consumptions: any[] = Array.isArray(consumptionsData) ? consumptionsData : [];
  const rebateReceivables: RebateReceivable[] = Array.isArray(rebateReceivablesData) ? (rebateReceivablesData as RebateReceivable[]) : [];

  // 璁＄畻鍘嗗彶璁板綍锛堜娇鐢?useMemo 浼樺寲锛?
  const historyBills = useMemo(() => {
    return allBills.filter((b) => {
      if (b.status === "Draft" || b.status === "Pending_Approval") {
        return false;
      }
      return b.status === "Approved" || b.status === "Paid" || !!b.rejectionReason;
    });
  }, [allBills]);

  const historyExpenseRequests = useMemo(() => {
    return allExpenseRequests.filter((r) => {
      if (r.status === "Draft" || r.status === "Pending_Approval") {
        return false;
      }
      return r.status === "Approved" || r.status === "Paid" || r.status === "Received" || !!r.rejectionReason;
    });
  }, [allExpenseRequests]);

  const historyIncomeRequests = useMemo(() => {
    return allIncomeRequests.filter((r) => {
      if (r.status === "Draft" || r.status === "Pending_Approval") {
        return false;
      }
      return r.status === "Approved" || r.status === "Paid" || r.status === "Received" || !!r.rejectionReason;
    });
  }, [allIncomeRequests]);


  const handleViewDetail = (bill: MonthlyBill) => {
    setSelectedBill(bill);
    setIsDetailModalOpen(true);
  };

  const handleApprove = async (billId: string) => {
    // 浠庢渶鏂扮殑鏁版嵁婧愯幏鍙栬处鍗曚俊鎭紝纭繚鏁版嵁鍚屾
    const allBills = await getMonthlyBills();
    const bill = allBills.find((b) => b.id === billId);
    if (!bill) return;
    
    // 鑾峰彇璐﹀崟淇℃伅鐢ㄤ簬寮圭獥鏄剧ず
    const billType = bill.billType || "璐﹀崟";
    const serviceProvider = bill.billCategory === "Payable" 
      ? (bill.agencyName || bill.supplierName || bill.factoryName || "-")
      : (bill.agencyName || "-");
    const billAmount = formatCurrencyString(
      bill.netAmount, 
      bill.currency
    );
    
    setConfirmDialog({
      open: true,
      title: "鎵瑰噯璐﹀崟",
      message: `纭畾瑕佹壒鍑嗚繖绗旇处鍗曞悧锛熸壒鍑嗗悗绯荤粺灏嗚嚜鍔ㄦ帹閫佺粰璐㈠姟浜哄憳澶勭悊鍏ヨ处銆俓n\n璐﹀崟淇℃伅锛歕n- 绫诲瀷锛?{billType}\n- 閲戦锛?{billAmount}\n- 鏈嶅姟鏂癸細${serviceProvider}`,
      type: "info",
      onConfirm: async () => {
        const updatedBills = allBills.map((b) =>
          b.id === billId
            ? {
                ...b,
                status: "Approved" as BillStatus,
                approvedBy: "鑰佹澘", // 瀹為檯搴旇浠庣敤鎴风郴缁熻幏鍙?
                approvedAt: new Date().toISOString()
              }
            : b
        );
        await saveMonthlyBills(updatedBills);
        // 鍒锋柊 SWR 缂撳瓨
        mutate("monthly-bills");
        mutate("pending-bills");
        
        // 濡傛灉鏄箍鍛婅处鍗曪紝涓旀湭鐢熸垚杩旂偣搴旀敹娆撅紝鍒欒嚜鍔ㄧ敓鎴?
        if (bill.billType === "骞垮憡" && bill.agencyId && bill.adAccountId) {
          (async () => {
            try {
              // 鑾峰彇浠ｇ悊鍟嗕俊鎭紝鐢ㄤ簬鑾峰彇杩旂偣姣斾緥锛圓PI锛?
              const agenciesRes = await fetch("/api/ad-agencies");
              const agencies: Agency[] = agenciesRes.ok ? await agenciesRes.json() : [];
              const agency = bill.agencyId ? agencies.find((a: Agency) => a.id === bill.agencyId) : null;
              
              if (agency && bill.agencyId) {
                // 鑾峰彇杩旂偣姣斾緥
                const rebateRate = agency?.rebateConfig?.rate || agency?.rebateRate || 0;
                
                // 璁＄畻杩旂偣閲戦锛氬熀浜庡疄浠橀噾棰濓紙netAmount锛?
                // 瀹炰粯閲戦 = 鍏呭€奸噾棰濓紝杩旂偣閲戦 = 瀹炰粯閲戦 * 杩旂偣姣斾緥 / 100
                const rebateAmount = (bill.netAmount * rebateRate) / 100;
                
                // 濡傛灉鏈夎繑鐐归噾棰濅笖澶т簬0锛岀敓鎴愯繑鐐瑰簲鏀舵璁板綍
                if (rebateAmount > 0) {
                  // 鑾峰彇鍏宠仈鐨勫厖鍊艰褰曪紙API锛?
                  const rechargesRes = await fetch("/api/ad-recharges");
                  const recharges: Array<{ id: string; date: string }> = rechargesRes.ok ? await rechargesRes.json() : [];
                  const relatedRecharges = bill.rechargeIds 
                    ? recharges.filter((r: { id: string }) => bill.rechargeIds?.includes(r.id))
                    : [];
                  
                  // 濡傛灉娌℃湁鍏宠仈鍏呭€艰褰曪紝浣跨敤璐﹀崟鐨勬湀浠戒綔涓哄厖鍊兼棩鏈?
                  const rechargeDate = relatedRecharges.length > 0 
                    ? relatedRecharges[0].date 
                    : `${bill.month}-01`;
                  
                  // 鑾峰彇绗竴涓厖鍊艰褰旾D锛屽鏋滄病鏈夊垯浣跨敤璐﹀崟ID浣滀负鍏宠仈ID
                  const rechargeId = relatedRecharges.length > 0 
                    ? relatedRecharges[0].id 
                    : billId;
                  
                  // 妫€鏌ユ槸鍚﹀凡瀛樺湪璇ヨ处鍗曠殑杩旂偣搴旀敹娆撅紙API锛?
                  const receivablesRes = await fetch("/api/rebate-receivables");
                  const existingReceivables: Array<{ id: string; rechargeId: string }> = receivablesRes.ok ? await receivablesRes.json() : [];
                  const existingReceivable = existingReceivables.find(
                    (r: { rechargeId: string }) => r.rechargeId === rechargeId || r.rechargeId === billId
                  );
                  
                  if (!existingReceivable) {
                    // 鍒涘缓鏂扮殑杩旂偣搴旀敹娆捐褰曪紙API锛?
                    const createRes = await fetch("/api/rebate-receivables", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        rechargeId,
                        rechargeDate,
                        agencyId: bill.agencyId,
                        agencyName: bill.agencyName || agency.name,
                        adAccountId: bill.adAccountId || "",
                        accountName: bill.accountName || "-",
                        platform: agency.platform || "鍏朵粬",
                        rebateAmount,
                        currency: bill.currency,
                        currentBalance: rebateAmount,
                        status: "寰呮牳閿€",
                        notes: `瀹℃壒閫氳繃鍚庤嚜鍔ㄧ敓鎴愶細骞垮憡璐﹀崟 ${billId} 鐨勮繑鐐瑰簲鏀舵锛堝疄浠橀噾棰濓細${formatCurrency(bill.netAmount, bill.currency, "expense")}锛岃繑鐐规瘮渚嬶細${rebateRate}%锛塦,
                      }),
                    });
                    if (createRes.ok) {
                      const created = await createRes.json();
                      mutate("rebate-receivables");
                      console.log(`鉁?宸茬敓鎴愯繑鐐瑰簲鏀舵璁板綍锛?{created.id}锛岄噾棰濓細${formatCurrency(rebateAmount, bill.currency, "income")}`);
                    }
                    
                    // 鍦ㄥ璐︿腑蹇冪敓鎴?骞垮憡杩旂偣"绫诲瀷鐨勫簲鏀舵璐﹀崟
                    const existingBills = await getMonthlyBills();
                    // 鏌ユ壘鍚屼竴鍏宠仈鏂癸紙浠ｇ悊鍟?璐︽埛锛夈€佸悓涓€鏈堜唤銆佸悓涓€绫诲瀷銆佸悓涓€甯佺鐨勮崏绋胯处鍗?
                    const existingRebateBill = existingBills.find(
                      (b) =>
                        b.month === bill.month &&
                        b.billType === "骞垮憡杩旂偣" &&
                        b.billCategory === "Receivable" &&
                        b.agencyId === bill.agencyId &&
                        b.adAccountId === bill.adAccountId &&
                        b.currency === bill.currency &&
                        b.status === "Draft"
                    );
                    
                    if (existingRebateBill) {
                      // 鍚堝苟鍒扮幇鏈夎处鍗?
                      const updatedRebateBill: MonthlyBill = {
                        ...existingRebateBill,
                        totalAmount: existingRebateBill.totalAmount + rebateAmount,
                        rebateAmount: existingRebateBill.rebateAmount + rebateAmount,
                        netAmount: existingRebateBill.netAmount + rebateAmount,
                        rechargeIds: [...(existingRebateBill.rechargeIds || []), rechargeId],
                        notes: `鏇存柊锛氬鎵归€氳繃骞垮憡璐﹀崟 ${billId} 鍚庤嚜鍔ㄧ敓鎴愯繑鐐瑰簲鏀舵`
                      };
                      const updatedBills = existingBills.map((b) =>
                        b.id === existingRebateBill.id ? updatedRebateBill : b
                      );
                      await saveMonthlyBills(updatedBills);
                      console.log(`鉁?宸叉洿鏂板璐︿腑蹇冨簲鏀舵璐﹀崟锛?{updatedRebateBill.id}`);
                    } else {
                      // 鍒涘缓鏂扮殑杩旂偣搴旀敹娆捐处鍗?
                      const newRebateBill: MonthlyBill = {
                        id: `bill-rebate-approval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                        month: bill.month,
                        billCategory: "Receivable" as const,
                        billType: "骞垮憡杩旂偣" as const,
                        agencyId: bill.agencyId || undefined,
                        agencyName: bill.agencyName || agency.name,
                        adAccountId: bill.adAccountId || undefined,
                        accountName: bill.accountName || "-",
                        totalAmount: rebateAmount,
                        currency: bill.currency,
                        rebateAmount: rebateAmount,
                        netAmount: rebateAmount,
                        consumptionIds: [],
                        rechargeIds: [rechargeId],
                        status: "Draft",
                        createdBy: "绯荤粺",
                        createdAt: new Date().toISOString(),
                        notes: `鑷姩鐢熸垚锛氬鎵归€氳繃骞垮憡璐﹀崟 ${billId} 鍚庣敓鎴愮殑杩旂偣搴旀敹娆撅紙鍏宠仈鍗曟嵁鍙凤細${billId}锛塦
                      };
                      const updatedBills = [...existingBills, newRebateBill];
                      await saveMonthlyBills(updatedBills);
                      console.log(`鉁?宸茬敓鎴愬璐︿腑蹇冨簲鏀舵璐﹀崟骞舵帹閫佸埌瀵硅处涓績锛?{newRebateBill.id}锛堝叧鑱斿崟鎹彿锛?{billId}锛塦);
                    }
                  }
                }
              }
            } catch (e) {
              console.error("Failed to generate rebate receivable", e);
            }
          })();
        }
        
        // 鎺ㄩ€侀€昏緫锛氬簲鏀舵鎺ㄩ€佸埌寰呭叆璐︼紝搴斾粯娆炬帹閫佸埌寰呬粯娆?
        // 鍙湁搴旀敹娆撅紙Receivable锛夋墠鍒涘缓寰呭叆璐︿换鍔?
        // 搴斾粯娆撅紙Payable锛変笉鍒涘缓寰呭叆璐︿换鍔★紝浼氳嚜鍔ㄥ嚭鐜板湪寰呬粯娆惧垪琛ㄤ腑
        if (bill.billCategory === "Receivable") {
          // 搴旀敹娆撅細鍒涘缓寰呭叆璐︿换鍔★紝鎺ㄩ€佺粰璐㈠姟浜哄憳澶勭悊鍏ヨ处
          const existingEntry = await getPendingEntryByRelatedId("Bill", billId);
          if (!existingEntry) {
            try {
              await createPendingEntry({
                type: "Bill",
                relatedId: billId,
                billCategory: bill.billCategory,
                billType: bill.billType,
                month: bill.month,
                agencyName: bill.agencyName,
                supplierName: bill.supplierName,
                factoryName: bill.factoryName,
                accountName: bill.accountName,
                amount: bill.totalAmount,
                currency: bill.currency,
                netAmount: bill.netAmount,
                approvedBy: "鑰佹澘",
                approvedAt: new Date().toISOString(),
                notes: bill.notes
              });
              console.log(`鉁?搴旀敹娆捐处鍗?${billId} 瀹℃壒閫氳繃锛屽凡鍒涘缓寰呭叆璐︿换鍔★紙鎺ㄩ€佸埌寰呭叆璐﹀垪琛級`);
            } catch (e) {
              console.error(`鉂?鍒涘缓寰呭叆璐︿换鍔″け璐ワ細${billId}`, e);
              toast.error("鍒涘缓寰呭叆璐︿换鍔″け璐ワ紝璇锋墜鍔ㄥ鐞?);
            }
          } else {
            console.log(`鈿狅笍 搴旀敹娆捐处鍗?${billId} 鐨勫緟鍏ヨ处浠诲姟宸插瓨鍦紝璺宠繃鍒涘缓`);
          }
        } else if (bill.billCategory === "Payable") {
          // 搴斾粯娆撅細涓嶅垱寤哄緟鍏ヨ处浠诲姟锛屼細鑷姩鍑虹幇鍦ㄥ緟浠樻鍒楄〃涓紙閫氳繃 status === "Approved" 鍜?billCategory === "Payable" 绛涢€夛級
          console.log(`鉁?搴斾粯娆捐处鍗?${billId} 瀹℃壒閫氳繃锛屽凡鎺ㄩ€佸埌寰呬粯娆惧垪琛紙status: Approved, billCategory: Payable锛塦);
        } else {
          // 濡傛灉 billCategory 鏈缃垨涓哄叾浠栧€硷紝鏍规嵁璐﹀崟绫诲瀷鎺ㄦ柇
          console.warn(`鈿狅笍 璐﹀崟 ${billId} 鐨?billCategory 涓?${bill.billCategory || "undefined"}锛屾棤娉曠‘瀹氭帹閫佷綅缃甡);
        }
        
        setConfirmDialog(null);
        toast.success("宸叉壒鍑嗭紝宸叉帹閫佺粰璐㈠姟浜哄憳澶勭悊鍏ヨ处");
      }
    });
  };

  const handleReject = (billId: string) => {
    setRejectModal({ open: true, type: "bill", id: billId });
  };

  const handleConfirmReject = () => {
    if (!rejectModal.id || !rejectModal.type) return;
    if (!rejectReason.trim()) {
      toast.error("璇疯緭鍏ラ€€鍥炲師鍥?);
      return;
    }
    if (rejectSubmitting) return;
    setRejectSubmitting(true);

    if (rejectModal.type === "bill") {
      getMonthlyBills()
        .then(async (allBills) => {
          const updatedBills = allBills.map((b) =>
            b.id === rejectModal.id
              ? { ...b, status: "Draft" as BillStatus, rejectionReason: rejectReason.trim() }
              : b
          );
          await saveMonthlyBills(updatedBills);
          mutate("monthly-bills");
          mutate("pending-bills");
          toast.success("宸查€€鍥炰慨鏀?);
          setRejectModal({ open: false, type: null, id: null });
          setRejectReason("");
        })
        .catch((err: any) => {
          toast.error(err?.message || "閫€鍥炲け璐?);
        })
        .finally(() => setRejectSubmitting(false));
      return;
    }
    if (rejectModal.type === "expense") {
      const expenseId = rejectModal.id;
      updateExpenseRequest(expenseId, {
        status: "Rejected",
        rejectionReason: rejectReason.trim()
      })
        .then(async () => {
          mutate("pending-expense-requests", (current: unknown) => {
            if (!Array.isArray(current)) return current;
            return current.filter((r: { id?: string }) => r.id !== expenseId);
          }, false);
          mutate("expense-requests", undefined, { revalidate: true });
          mutate("pending-expense-requests", undefined, { revalidate: true });
          toast.success("宸查€€鍥炰慨鏀?);
          setRejectModal({ open: false, type: null, id: null });
          setRejectReason("");
        })
        .catch((error: any) => {
          toast.error(error.message || "閫€鍥炲け璐?);
        })
        .finally(() => setRejectSubmitting(false));
      return;
    }
    if (rejectModal.type === "income") {
      const incomeId = rejectModal.id;
      updateIncomeRequest(incomeId, {
        status: "Rejected",
        rejectionReason: rejectReason.trim()
      })
        .then(async () => {
          mutate("pending-income-requests", (current: unknown) => {
            if (!Array.isArray(current)) return current;
            return current.filter((r: { id?: string }) => r.id !== incomeId);
          }, false);
          mutate("income-requests", undefined, { revalidate: true });
          mutate("pending-income-requests", undefined, { revalidate: true });
          toast.success("宸查€€鍥炰慨鏀?);
          setRejectModal({ open: false, type: null, id: null });
          setRejectReason("");
        })
        .catch((error: any) => {
          toast.error(error.message || "閫€鍥炲け璐?);
        })
        .finally(() => setRejectSubmitting(false));
      return;
    }
    setRejectSubmitting(false);
  };

  // PaymentRequest 宸插悎骞跺埌 ExpenseRequest锛岀浉鍏冲嚱鏁板凡鍒犻櫎

  // 瀹℃壒鏀嚭鐢宠
  const handleApproveExpenseRequest = async (requestId: string) => {
    const allExpenseRequests = await getExpenseRequests();
    const request = allExpenseRequests.find((r) => r.id === requestId);
    if (!request) return;
    
    setConfirmDialog({
      open: true,
      title: "鎵瑰噯鏀嚭鐢宠",
      message: `纭畾瑕佹壒鍑嗚繖绗旀敮鍑虹敵璇峰悧锛熸壒鍑嗗悗璐㈠姟灏嗛€夋嫨璐︽埛骞跺畬鎴愬嚭璐︺€俓n\n鐢宠淇℃伅锛歕n- 鎽樿锛?{request.summary}\n- 鍒嗙被锛?{request.category}\n- 閲戦锛?{formatCurrencyString(request.amount, request.currency)}`,
      type: "info",
      onConfirm: async () => {
        try {
          await updateExpenseRequest(requestId, {
            status: "Approved",
            approvedBy: "鑰佹澘",
            approvedAt: new Date().toISOString()
          });
          // 涔愯鏇存柊锛氱珛鍗充粠寰呭鎵瑰垪琛ㄤ腑绉婚櫎璇ラ」锛岄伩鍏嶆壒鍑嗗悗浠嶆樉绀哄湪鍒楄〃
          mutate("pending-expense-requests", (current: unknown) => {
            if (!Array.isArray(current)) return current;
            return current.filter((r: { id?: string }) => r.id !== requestId);
          }, false);
          mutate("expense-requests", undefined, { revalidate: true });
          mutate("pending-expense-requests", undefined, { revalidate: true });
          window.dispatchEvent(new CustomEvent("approval-updated"));
          toast.success("宸叉壒鍑嗭紝宸叉帹閫佺粰璐㈠姟浜哄憳澶勭悊鍑鸿处");
          setConfirmDialog(null);
          if (selectedExpenseRequest?.id === requestId) {
            setSelectedExpenseRequest(null);
            setIsRequestDetailOpen(false);
          }
        } catch (error: any) {
          toast.error(error.message || "瀹℃壒澶辫触");
          setConfirmDialog(null);
        }
      }
    });
  };

  // 瀹℃壒鏀跺叆鐢宠
  const handleApproveIncomeRequest = async (requestId: string) => {
    const allIncomeRequests = await getIncomeRequests();
    const request = allIncomeRequests.find((r) => r.id === requestId);
    if (!request) return;
    
    setConfirmDialog({
      open: true,
      title: "鎵瑰噯鏀跺叆鐢宠",
      message: `纭畾瑕佹壒鍑嗚繖绗旀敹鍏ョ敵璇峰悧锛熸壒鍑嗗悗璐㈠姟灏嗛€夋嫨璐︽埛骞跺畬鎴愬叆璐︺€俓n\n鐢宠淇℃伅锛歕n- 鎽樿锛?{request.summary}\n- 鍒嗙被锛?{request.category}\n- 閲戦锛?{formatCurrencyString(request.amount, request.currency)}`,
      type: "info",
      onConfirm: async () => {
        try {
          await updateIncomeRequest(requestId, {
            status: "Approved",
            approvedBy: "鑰佹澘",
            approvedAt: new Date().toISOString()
          });
          mutate("pending-income-requests", (current: unknown) => {
            if (!Array.isArray(current)) return current;
            return current.filter((r: { id?: string }) => r.id !== requestId);
          }, false);
          mutate("income-requests", undefined, { revalidate: true });
          mutate("pending-income-requests", undefined, { revalidate: true });
          window.dispatchEvent(new CustomEvent("approval-updated"));
          toast.success("宸叉壒鍑嗭紝宸叉帹閫佺粰璐㈠姟浜哄憳澶勭悊鍏ヨ处");
          setConfirmDialog(null);
          if (selectedIncomeRequest?.id === requestId) {
            setSelectedIncomeRequest(null);
            setIsRequestDetailOpen(false);
          }
        } catch (error: any) {
          toast.error(error.message || "瀹℃壒澶辫触");
          setConfirmDialog(null);
        }
      }
    });
  };

  // 閫€鍥炴敮鍑虹敵璇?
  const handleRejectExpenseRequest = (requestId: string) => {
    setRejectModal({ open: true, type: "expense", id: requestId });
  };

  // 閫€鍥炴敹鍏ョ敵璇?
  const handleRejectIncomeRequest = (requestId: string) => {
    setRejectModal({ open: true, type: "income", id: requestId });
  };

  // 鏍规嵁绛涢€夋潯浠惰繃婊ゅ緟瀹℃壒璐﹀崟锛堟寜绫诲瀷绛涢€夛級
  const filteredPendingBills = billTypeFilter === "all"
    ? (Array.isArray(pendingBills) ? pendingBills : [])
    : (Array.isArray(pendingBills) ? pendingBills.filter((b) => b.billType === billTypeFilter) : []);

  // 鏍规嵁绛涢€夋潯浠惰繃婊ゅ巻鍙茶褰曪紙鎸夌姸鎬佸拰绫诲瀷绛涢€夛級
  const filteredHistoryBills = Array.isArray(historyBills) ? historyBills.filter((b) => {
    // 鐘舵€佺瓫閫?
    if (historyFilter !== "all") {
      if (historyFilter === "Draft" && b.rejectionReason) {
        // 濡傛灉鏈夐€€鍥炲師鍥狅紝鍗充娇鐘舵€佹槸鑽夌锛屼篃瑙嗕负閫€鍥炶褰?
        // 缁х画妫€鏌ョ被鍨嬬瓫閫?
      } else if (b.status !== historyFilter) {
        return false;
      }
    }
    // 绫诲瀷绛涢€?
    if (billTypeFilter !== "all" && b.billType !== billTypeFilter) {
      return false;
    }
    return true;
  }) : [];

  // 鍚堝苟鏀嚭鍜屾敹鍏ョ敵璇峰巻鍙茶褰?
  const allHistoryRequests = [
    ...(Array.isArray(historyExpenseRequests) ? historyExpenseRequests : []),
    ...(Array.isArray(historyIncomeRequests) ? historyIncomeRequests : [])
  ];
  
  const filteredHistoryRequests = historyFilter === "all"
    ? allHistoryRequests
    : (Array.isArray(allHistoryRequests) ? allHistoryRequests.filter((r) => {
        if (historyFilter === "Draft" && r.rejectionReason) {
          // 濡傛灉鏈夐€€鍥炲師鍥狅紝鍗充娇鐘舵€佹槸鑽夌锛屼篃瑙嗕负閫€鍥炶褰?
          return true;
        }
        return r.status === historyFilter;
      }) : []);

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === "history") {
      mutate("monthly-bills");
      mutate("expense-requests");
      mutate("income-requests");
    }
  }, []);

  const handleOpenRequestDetail = useCallback((request: ExpenseRequest | IncomeRequest) => {
    if ("approvalDocument" in request || "paymentReceipt" in request) {
      setSelectedExpenseRequest(request as ExpenseRequest);
      setSelectedIncomeRequest(null);
    } else {
      setSelectedIncomeRequest(request as IncomeRequest);
      setSelectedExpenseRequest(null);
    }
    setIsRequestDetailOpen(true);
  }, []);

  const pendingCount =
    pendingBills.length + pendingExpenseRequests.length + pendingIncomeRequests.length;
  const historyCount =
    historyBills.length + historyExpenseRequests.length + historyIncomeRequests.length;

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">瀹℃壒涓績</h1>
          <p className="text-sm text-slate-400 mt-1">
            {activeTab === "pending"
              ? `寰呭鎵癸細鏈堣处鍗?${pendingBills.length} 绗旓紝鏀嚭鐢宠 ${pendingExpenseRequests.length} 绗旓紝鏀跺叆鐢宠 ${pendingIncomeRequests.length} 绗擿
              : `鍘嗗彶璁板綍锛氭湀璐﹀崟 ${historyBills.length} 绗旓紝鏀嚭鐢宠 ${historyExpenseRequests.length} 绗旓紝鏀跺叆鐢宠 ${historyIncomeRequests.length} 绗擿}
          </p>
        </div>
      </div>

      <ApprovalStats
        pendingBills={pendingBills}
        pendingExpenseRequests={pendingExpenseRequests}
        pendingIncomeRequests={pendingIncomeRequests}
        historyBills={historyBills}
        historyExpenseRequests={historyExpenseRequests}
        historyIncomeRequests={historyIncomeRequests}
      />

      <ApprovalFilters
        activeTab={activeTab}
        onTabChange={handleTabChange}
        billTypeFilter={billTypeFilter}
        onBillTypeFilterChange={setBillTypeFilter}
        historyFilter={historyFilter}
        onHistoryFilterChange={setHistoryFilter}
        pendingCount={pendingCount}
        historyCount={historyCount}
      />

      <ApprovalList
        activeTab={activeTab}
        filteredPendingBills={filteredPendingBills}
        pendingExpenseRequests={pendingExpenseRequests}
        pendingIncomeRequests={pendingIncomeRequests}
        filteredHistoryBills={filteredHistoryBills}
        filteredHistoryRequests={filteredHistoryRequests}
        historyExpenseRequests={historyExpenseRequests}
        historyIncomeRequests={historyIncomeRequests}
        onViewBillDetail={handleViewDetail}
        onApproveBill={handleApprove}
        onRejectBill={handleReject}
        onApproveExpenseRequest={handleApproveExpenseRequest}
        onRejectExpenseRequest={handleRejectExpenseRequest}
        onApproveIncomeRequest={handleApproveIncomeRequest}
        onRejectIncomeRequest={handleRejectIncomeRequest}
        onOpenRequestDetail={handleOpenRequestDetail}
      />

      <ApprovalDetailDialog
        isDetailModalOpen={isDetailModalOpen}
        selectedBill={selectedBill}
        onCloseBillDetail={() => setIsDetailModalOpen(false)}
        isRequestDetailOpen={isRequestDetailOpen}
        selectedExpenseRequest={selectedExpenseRequest}
        selectedIncomeRequest={selectedIncomeRequest}
        onCloseRequestDetail={() => {
          setIsRequestDetailOpen(false);
          setSelectedExpenseRequest(null);
          setSelectedIncomeRequest(null);
        }}
        rejectModal={rejectModal}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        rejectSubmitting={rejectSubmitting}
        onConfirmReject={handleConfirmReject}
        onCloseReject={() => {
          setRejectModal({ open: false, type: null, id: null });
          setRejectReason("");
        }}
        voucherViewModal={voucherViewModal}
        onCloseVoucher={() => setVoucherViewModal(null)}
        recharges={recharges}
        consumptions={consumptions}
        rebateReceivables={rebateReceivables}
        onVoucherView={setVoucherViewModal}
      />

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

