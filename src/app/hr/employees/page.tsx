"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { Users, Plus, Pencil, Trash2, Search, X, SortAsc, SortDesc, Download } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import useSWR from "swr";
import {
  getEmployees,
  getEmployeesFromAPI,
  saveEmployees,
  upsertEmployee,
  deleteEmployee,
  type Employee,
  type Department
} from "@/lib/hr-store";

// SWR fetcher
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

interface DepartmentFromAPI {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  // 搜索、筛选、排序状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterDepartment, setFilterDepartment] = useState<Department | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "在职" | "离职" | "试用期">("all");
  const [sortBy, setSortBy] = useState<"name" | "joinDate" | "none">("none");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  
  const [form, setForm] = useState({
    name: "",
    employeeNumber: "",
    department: "" as Department | "",
    position: "",
    joinDate: "",
    phone: "",
    email: "",
    status: "在职" as "在职" | "离职" | "试用期",
    notes: ""
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loaded = getEmployees();
    setEmployees(loaded);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!initialized) return;
    saveEmployees(employees);
  }, [employees, initialized]);

  // 从 API 获取部门列表
  const { data: departmentsData = [] } = useSWR<DepartmentFromAPI[]>('/api/departments', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000, // 10分钟内去重
  });
  
  // 将 API 返回的部门数据转换为页面需要的格式
  const departments = useMemo(() => {
    return departmentsData.map(dept => dept.name);
  }, [departmentsData]);

  // 统计摘要
  const stats = useMemo(() => {
    const total = employees.length;
    // 动态计算各部门的员工数量
    const byDepartment: Record<string, number> = {};
    departments.forEach((dept) => {
      byDepartment[dept] = employees.filter((e) => e.department === dept).length;
    });
    const byStatus = {
      在职: employees.filter((e) => e.status === "在职").length,
      离职: employees.filter((e) => e.status === "离职").length,
      试用期: employees.filter((e) => e.status === "试用期").length
    };
    return { total, byDepartment, byStatus };
  }, [employees, departments]);

  // 筛选和排序
  const filteredEmployees = useMemo(() => {
    let result = [...employees];
    
    // 部门筛选
    if (filterDepartment !== "all") {
      result = result.filter((e) => e.department === filterDepartment);
    }
    
    // 状态筛选
    if (filterStatus !== "all") {
      result = result.filter((e) => e.status === filterStatus);
    }
    
    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((e) =>
        e.name.toLowerCase().includes(keyword) ||
        e.employeeNumber?.toLowerCase().includes(keyword) ||
        e.position.toLowerCase().includes(keyword) ||
        e.phone?.toLowerCase().includes(keyword) ||
        e.email?.toLowerCase().includes(keyword)
      );
    }
    
    // 排序
    if (sortBy !== "none") {
      result.sort((a, b) => {
        let aVal: any;
        let bVal: any;
        
        switch (sortBy) {
          case "name":
            aVal = a.name;
            bVal = b.name;
            break;
          case "joinDate":
            aVal = a.joinDate;
            bVal = b.joinDate;
            break;
          default:
            return 0;
        }
        
        if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
        if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }
    
    return result;
  }, [employees, filterDepartment, filterStatus, searchKeyword, sortBy, sortOrder]);

  const resetForm = () => {
    setForm({
      name: "",
      employeeNumber: "",
      department: "" as Department | "",
      position: "",
      joinDate: "",
      phone: "",
      email: "",
      status: "在职",
      notes: ""
    });
    setEditingEmployee(null);
  };

  const handleOpenModal = (employee?: Employee) => {
    if (employee) {
      setEditingEmployee(employee);
      setForm({
        name: employee.name,
        employeeNumber: employee.employeeNumber || "",
        department: employee.department,
        position: employee.position,
        joinDate: employee.joinDate,
        phone: employee.phone || "",
        email: employee.email || "",
        status: employee.status,
        notes: employee.notes || ""
      });
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // 防止重复提交
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击");
      return;
    }
    
    if (!form.name.trim()) {
      toast.error("请填写员工姓名");
      return;
    }
    
    if (!form.department) {
      toast.error("请选择部门");
      return;
    }
    
    if (!form.position.trim()) {
      toast.error("请填写岗位");
      return;
    }
    
    const employeeData: Employee = {
      id: editingEmployee?.id || crypto.randomUUID(),
      name: form.name.trim(),
      employeeNumber: form.employeeNumber.trim() || undefined,
      department: form.department as Department,
      position: form.position.trim(),
      joinDate: form.joinDate || new Date().toISOString().split("T")[0],
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      status: form.status,
      notes: form.notes.trim() || undefined,
      createdAt: editingEmployee?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    setIsSubmitting(true);
    try {
      upsertEmployee(employeeData);
      const updatedEmployees = getEmployees();
      setEmployees(updatedEmployees);
      toast.success(editingEmployee ? "员工信息已更新" : "员工已添加");
      resetForm();
      setIsModalOpen(false);
    } catch (error) {
      console.error("保存员工失败:", error);
      toast.error("保存失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个员工吗？")) return;
    try {
      const ok = await deleteEmployee(id);
      if (ok) {
        const updated = await getEmployeesFromAPI();
        setEmployees(updated);
        toast.success("员工已删除");
      } else {
        toast.error("删除失败");
      }
    } catch (e) {
      console.error("删除员工失败", e);
      toast.error("删除失败，请重试");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="员工档案"
        description="管理员工基本信息、岗位等"
        actions={
          <ActionButton
            onClick={() => handleOpenModal()}
            variant="primary"
            icon={Plus}
          >
            新增员工
          </ActionButton>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard
          title="员工总数"
          value={stats.total}
          icon={Users}
        />
        {departments.map((dept) => (
          <StatCard
            key={dept}
            title={dept}
            value={stats.byDepartment[dept]}
            icon={Users}
          />
        ))}
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索员工姓名、工号、岗位..."
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
            <option value="在职">在职</option>
            <option value="试用期">试用期</option>
            <option value="离职">离职</option>
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-slate-400">排序：</span>
          <div className="flex gap-1">
            <button
              onClick={() => {
                if (sortBy === "name") {
                  setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                } else {
                  setSortBy("name");
                  setSortOrder("asc");
                }
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sortBy === "name"
                  ? "bg-primary-500 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              姓名
              {sortBy === "name" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
            </button>
            <button
              onClick={() => {
                if (sortBy === "joinDate") {
                  setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                } else {
                  setSortBy("joinDate");
                  setSortOrder("desc");
                }
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sortBy === "joinDate"
                  ? "bg-primary-500 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              入职日期
              {sortBy === "joinDate" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
            </button>
          </div>
        </div>
      </div>

      {/* 员工列表 */}
      {filteredEmployees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="暂无员工"
          description="点击右上角「新增员工」开始添加"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.map((employee) => (
            <div
              key={employee.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-primary-500/50 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-white text-lg">{employee.name}</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {employee.department} · {employee.position}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${
                  employee.status === "在职"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : employee.status === "试用期"
                    ? "bg-blue-500/20 text-blue-300"
                    : "bg-slate-700/50 text-slate-400"
                }`}>
                  {employee.status}
                </span>
              </div>
              
              <div className="space-y-2 text-sm">
                {employee.employeeNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">工号：</span>
                    <span className="text-slate-300">{employee.employeeNumber}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">入职日期：</span>
                  <span className="text-slate-300">{employee.joinDate}</span>
                </div>
                {employee.phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">手机：</span>
                    <span className="text-slate-300">{employee.phone}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-800">
                <ActionButton
                  onClick={() => handleOpenModal(employee)}
                  variant="secondary"
                  size="sm"
                  icon={Pencil}
                >
                  编辑
                </ActionButton>
                <ActionButton
                  onClick={() => handleDelete(employee.id)}
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                >
                  删除
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑员工模态框 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-100">
                {editingEmployee ? "编辑员工" : "新增员工"}
              </h2>
              <button
                onClick={() => {
                  resetForm();
                  setIsModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">姓名 *</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">工号</span>
                  <input
                    type="text"
                    value={form.employeeNumber}
                    onChange={(e) => setForm((f) => ({ ...f, employeeNumber: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">部门 *</span>
                  <select
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value as Department }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  >
                    <option value="">请选择</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">岗位 *</span>
                  <input
                    type="text"
                    value={form.position}
                    onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">入职日期</span>
                  <input
                    type="date"
                    value={form.joinDate}
                    onChange={(e) => setForm((f) => ({ ...f, joinDate: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">状态</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as typeof form.status }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  >
                    <option value="在职">在职</option>
                    <option value="试用期">试用期</option>
                    <option value="离职">离职</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">手机号</span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">邮箱</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">备注</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                />
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <ActionButton
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(false);
                  }}
                  variant="secondary"
                >
                  取消
                </ActionButton>
                <ActionButton type="submit" variant="primary" isLoading={isSubmitting} disabled={isSubmitting}>
                  {isSubmitting ? (editingEmployee ? "更新中..." : "创建中...") : (editingEmployee ? "更新" : "创建")}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
