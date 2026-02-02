"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { DollarSign, RefreshCw, Download, Search, X, CheckCircle2, XCircle, Clock } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import {
  getCommissionRecords,
  getCommissionRecordsFromAPI,
  saveCommissionRecords,
  upsertCommissionRecord,
  getEmployees,
  getEmployeesFromAPI,
  getCommissionRules,
  getCommissionRulesFromAPI,
  calculateCommission,
  type CommissionRecord,
  type Department
} from "@/lib/hr-store";

export default function CommissionsPage() {
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [employees, setEmployees] = useState(getEmployees());
  const [rules, setRules] = useState(getCommissionRules());
  const [initialized, setInitialized] = useState(false);
  
  // 搜索、筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterDepartment, setFilterDepartment] = useState<Department | "all">("all");
  const [filterStatus, setFilterStatus] = useState<CommissionRecord["status"] | "all">("all");
  const [filterPeriod, setFilterPeriod] = useState<string>("");
  
  // 计算提成状态
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    Promise.all([
      getCommissionRecordsFromAPI(),
      getEmployeesFromAPI(),
      getCommissionRulesFromAPI()
    ]).then(([recordsData, employeesData, rulesData]) => {
      setRecords(recordsData);
      setEmployees(employeesData);
      setRules(rulesData);
      saveCommissionRecords(recordsData);
      setInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!initialized) return;
    saveCommissionRecords(records);
  }, [records, initialized]);

  // 统计摘要
  const stats = useMemo(() => {
    const total = records.length;
    const totalAmount = records.reduce((sum, r) => sum + r.commissionAmount, 0);
    const pending = records.filter((r) => r.status === "pending").length;
    const approved = records.filter((r) => r.status === "approved").length;
    const paid = records.filter((r) => r.status === "paid").length;
    const pendingAmount = records
      .filter((r) => r.status === "pending")
      .reduce((sum, r) => sum + r.commissionAmount, 0);
    const approvedAmount = records
      .filter((r) => r.status === "approved")
      .reduce((sum, r) => sum + r.commissionAmount, 0);
    const paidAmount = records
      .filter((r) => r.status === "paid")
      .reduce((sum, r) => sum + r.commissionAmount, 0);
    
    return {
      total,
      totalAmount,
      pending,
      approved,
      paid,
      pendingAmount,
      approvedAmount,
      paidAmount
    };
  }, [records]);

  // 筛选
  const filteredRecords = useMemo(() => {
    let result = [...records];
    
    if (filterDepartment !== "all") {
      const employeeIds = employees
        .filter((e) => e.department === filterDepartment)
        .map((e) => e.id);
      result = result.filter((r) => employeeIds.includes(r.employeeId));
    }
    
    if (filterStatus !== "all") {
      result = result.filter((r) => r.status === filterStatus);
    }
    
    if (filterPeriod) {
      result = result.filter((r) => r.period === filterPeriod);
    }
    
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((r) =>
        r.employeeName.toLowerCase().includes(keyword) ||
        r.ruleName.toLowerCase().includes(keyword) ||
        r.period.includes(keyword)
      );
    }
    
    // 按周期和员工排序
    result.sort((a, b) => {
      if (a.period !== b.period) return b.period.localeCompare(a.period);
      return a.employeeName.localeCompare(b.employeeName);
    });
    
    return result;
  }, [records, employees, filterDepartment, filterStatus, filterPeriod, searchKeyword]);

  // 自动计算提成
  const handleCalculateCommissions = async () => {
    setCalculating(true);
    try {
      const [employeesList, rulesList] = await Promise.all([getEmployeesFromAPI(), getCommissionRulesFromAPI()]);
      const allEmployees = employeesList.filter((e) => e.status === "在职");
      const allRules = rulesList.filter((r) => r.enabled);
      const newRecords: CommissionRecord[] = [];
      
      // 获取当前月份
      const now = new Date();
      const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      
      // TODO: 根据规则从业务模块提取数据并计算
      // 这里先创建一个示例记录，后续完善具体计算逻辑
      
      toast.success("提成计算完成（当前为框架版本，具体计算逻辑待完善）");
      
      // 保存新记录
      if (newRecords.length > 0) {
        const existingRecords = getCommissionRecords();
        const updatedRecords = [...existingRecords, ...newRecords];
        saveCommissionRecords(updatedRecords);
        setRecords(updatedRecords);
      }
    } catch (error) {
      console.error("计算提成失败:", error);
      toast.error("计算提成失败");
    } finally {
      setCalculating(false);
    }
  };

  const handleApprove = (id: string) => {
    const record = records.find((r) => r.id === id);
    if (record) {
      upsertCommissionRecord({
        ...record,
        status: "approved",
        approvedBy: "当前用户", // TODO: 从用户上下文获取
        approvedAt: new Date().toISOString()
      });
      setRecords(getCommissionRecords());
      toast.success("已批准");
    }
  };

  const handleReject = (id: string) => {
    const record = records.find((r) => r.id === id);
    if (record) {
      upsertCommissionRecord({
        ...record,
        status: "rejected",
        approvedBy: "当前用户",
        approvedAt: new Date().toISOString()
      });
      setRecords(getCommissionRecords());
      toast.success("已拒绝");
    }
  };

  const handlePay = (id: string) => {
    const record = records.find((r) => r.id === id);
    if (record && record.status === "approved") {
      upsertCommissionRecord({
        ...record,
        status: "paid"
      });
      setRecords(getCommissionRecords());
      toast.success("已标记为已发放");
    }
  };

  const departments: Department[] = ["财务", "采购", "物流", "BD", "运营", "剪辑"];

  // 生成周期选项（最近12个月）
  const periodOptions = useMemo(() => {
    const options: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      options.push(period);
    }
    return options;
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="提成管理"
        description="查看和管理员工提成记录，支持自动计算和审批"
        actions={
          <ActionButton
            onClick={handleCalculateCommissions}
            variant="primary"
            icon={RefreshCw}
            disabled={calculating}
          >
            {calculating ? "计算中..." : "自动计算提成"}
          </ActionButton>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard title="记录总数" value={stats.total} icon={DollarSign} />
        <StatCard title="总金额" value={formatCurrency(stats.totalAmount)} icon={DollarSign} />
        <StatCard title="待审批" value={stats.pending} icon={Clock} />
        <StatCard title="待审批金额" value={formatCurrency(stats.pendingAmount)} icon={Clock} />
        <StatCard title="已批准" value={stats.approved} icon={CheckCircle2} />
        <StatCard title="已批准金额" value={formatCurrency(stats.approvedAmount)} icon={CheckCircle2} />
        <StatCard title="已发放" value={stats.paid} icon={DollarSign} />
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索员工姓名、规则名称、周期..."
        />
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">部门：</span>
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value as Department | "all")}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">状态：</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            <option value="pending">待审批</option>
            <option value="approved">已批准</option>
            <option value="rejected">已拒绝</option>
            <option value="paid">已发放</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">周期：</span>
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="">全部</option>
            {periodOptions.map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 提成记录列表 */}
      {filteredRecords.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="暂无提成记录"
          description="点击右上角「自动计算提成」开始生成"
        />
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">周期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">员工</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">规则</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">基础值</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">提成金额</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">状态</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredRecords.map((record) => (
                <tr key={record.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-300">{record.period}</td>
                  <td className="px-4 py-3 text-sm text-white font-medium">{record.employeeName}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{record.ruleName}</td>
                  <td className="px-4 py-3 text-sm text-slate-300 text-right">{record.baseValue}</td>
                  <td className="px-4 py-3 text-sm text-emerald-300 font-semibold text-right">
                    {formatCurrency(record.commissionAmount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${
                      record.status === "pending"
                        ? "bg-yellow-500/20 text-yellow-300"
                        : record.status === "approved"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : record.status === "rejected"
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-blue-500/20 text-blue-300"
                    }`}>
                      {record.status === "pending" ? "待审批" :
                       record.status === "approved" ? "已批准" :
                       record.status === "rejected" ? "已拒绝" : "已发放"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {record.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleApprove(record.id)}
                            className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                          >
                            批准
                          </button>
                          <button
                            onClick={() => handleReject(record.id)}
                            className="px-2 py-1 rounded text-xs bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors"
                          >
                            拒绝
                          </button>
                        </>
                      )}
                      {record.status === "approved" && (
                        <button
                          onClick={() => handlePay(record.id)}
                          className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
                        >
                          标记已发放
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
