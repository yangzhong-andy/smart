"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader, ActionButton } from "@/components/ui";
import useSWR from "swr";
import {
  deleteEmployee,
  type Employee,
  type Department,
} from "@/lib/hr-store";
import { useSystemConfirm } from "@/hooks/use-system-confirm";
import { EmployeeStats } from "./components/EmployeeStats";
import { EmployeesFilters } from "./components/EmployeesFilters";
import { EmployeesTable } from "./components/EmployeesTable";
import { EmployeeFormDialog } from "./components/EmployeeFormDialog";
import { HrWorkflowNav } from "../components/HrWorkflowNav";
import { employeeStatusLabel, hasSalarySettings, parseSalarySettings, personnelSettings } from "@/lib/employee-profile";
import type {
  DepartmentFromAPI,
  EmployeeFormState,
  FilterStatus,
  SortBy,
  SortOrder,
  EmployeeStatsData,
} from "./components/types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

const initialForm: EmployeeFormState = {
  name: "",
  employeeNumber: "",
  department: "" as Department | "",
  position: "",
  joinDate: "",
  leaveDate: "",
  phone: "",
  email: "",
  status: "在职",
  notes: "",
  bankAccount: "",
  bankName: "",
  idNumber: "",
  baseSalary: "",
  positionSalary: "",
  fullAttendanceBonus: "",
  pensionInsurance: "",
  unemploymentInsurance: "",
  medicalInsurance: "",
  restDays: "7",
};

export default function EmployeesPage() {
  const { confirm, confirmDialog } = useSystemConfirm();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formSection, setFormSection] = useState<"personnel" | "salary">("personnel");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterDepartment, setFilterDepartment] = useState<
    Department | "all"
  >("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<SortBy>("none");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [form, setForm] = useState<EmployeeFormState>(initialForm);

  const { data: employeesDataRaw, error: employeesError, isLoading: employeesLoading, mutate: mutateEmployees } = useSWR<any>(
    "/api/employees?page=1&pageSize=500",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );
  const employees = useMemo<Employee[]>(() => (Array.isArray(employeesDataRaw)
    ? employeesDataRaw
    : employeesDataRaw?.data ?? []).map((employee: Employee) => ({
      ...employee, status: employeeStatusLabel(employee.status),
    })) as Employee[], [employeesDataRaw]);

  const { data: departmentsDataRaw } = useSWR<any>(
    "/api/departments?page=1&pageSize=500",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 600000,
    }
  );
  const departmentsData = useMemo<DepartmentFromAPI[]>(() => (Array.isArray(departmentsDataRaw)
    ? departmentsDataRaw
    : departmentsDataRaw?.data ?? []) as DepartmentFromAPI[], [departmentsDataRaw]);

  const departments = useMemo(
    () => departmentsData.map((dept) => dept.name),
    [departmentsData]
  );

  const stats = useMemo<EmployeeStatsData>(() => {
    const total = employees.length;
    const byDepartment: Record<string, number> = {};
    departments.forEach((dept) => {
      byDepartment[dept] = employees.filter((e) => e.department === dept).length;
    });
    const byStatus = {
      在职: employees.filter((e) => e.status === "在职").length,
      离职: employees.filter((e) => e.status === "离职").length,
      试用期: employees.filter((e) => e.status === "试用期").length,
    };
    return { total, byDepartment, byStatus };
  }, [employees, departments]);

  const filteredEmployees = useMemo(() => {
    let result = [...employees];

    if (filterDepartment !== "all") {
      result = result.filter((e) => e.department === filterDepartment);
    }
    if (filterStatus !== "all") {
      result = result.filter((e) => e.status === filterStatus);
    }
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(keyword) ||
          e.employeeNumber?.toLowerCase().includes(keyword) ||
          e.position.toLowerCase().includes(keyword) ||
          e.phone?.toLowerCase().includes(keyword) ||
          e.email?.toLowerCase().includes(keyword)
      );
    }
    if (sortBy !== "none") {
      result.sort((a, b) => {
        let aVal: string;
        let bVal: string;
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
  }, [
    employees,
    filterDepartment,
    filterStatus,
    searchKeyword,
    sortBy,
    sortOrder,
  ]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingEmployee(null);
  };

  const handleOpenModal = (employee?: Employee, section: "personnel" | "salary" = "personnel") => {
    setFormSection(section);
    if (employee) {
      setEditingEmployee(employee);
      setForm({
        name: employee.name,
        employeeNumber: employee.employeeNumber || "",
        department: employee.department,
        position: employee.position,
        joinDate: employee.joinDate.slice(0, 10),
        leaveDate: employee.leaveDate || "",
        phone: employee.phone || "",
        email: employee.email || "",
        status: employee.status,
        notes: employee.notes || "",
        bankAccount: employee.bankAccount || "",
        bankName: employee.bankName || "",
        idNumber: employee.idNumber || "",
        baseSalary: employee.baseSalary == null ? "" : String(employee.baseSalary),
        positionSalary: employee.positionSalary == null ? "" : String(employee.positionSalary),
        fullAttendanceBonus: employee.fullAttendanceBonus == null ? "" : String(employee.fullAttendanceBonus),
        pensionInsurance: employee.pensionInsurance == null ? "" : String(employee.pensionInsurance),
        unemploymentInsurance: employee.unemploymentInsurance == null ? "" : String(employee.unemploymentInsurance),
        medicalInsurance: employee.medicalInsurance == null ? "" : String(employee.medicalInsurance),
        restDays: String(employee.restDays ?? 7),
      });
    } else {
      resetForm();
      // 自动生成下一个工号：取现有最大数字工号 +1，从 10001 开始
      const existingNums = employees
        .map((e) => parseInt(e.employeeNumber || "0", 10))
        .filter((n) => !isNaN(n) && n > 0);
      const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 10000;
      const nextNum = maxNum + 1;
      setForm((f) => ({ ...f, employeeNumber: String(nextNum) }));
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    resetForm();
    setIsModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击");
      return;
    }
    if (formSection === "personnel" && !form.name.trim()) {
      toast.error("请填写员工姓名");
      return;
    }
    if (formSection === "personnel" && !form.department) {
      toast.error("请选择部门");
      return;
    }
    if (formSection === "personnel" && !form.position.trim()) {
      toast.error("请填写岗位");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = formSection === "salary" ? parseSalarySettings({ ...form }) : personnelSettings({ ...form });
      if (formSection === "salary" && !hasSalarySettings(payload)) throw new Error("请完整填写薪资项目，未发生项目请填 0");
      if (formSection === "personnel" && !form.joinDate) throw new Error("请填写入职日期");
      if (formSection === "personnel" && form.leaveDate && form.leaveDate < form.joinDate) throw new Error("离职日期不能早于入职日期");
      const res = await fetch(editingEmployee ? `/api/employees/${editingEmployee.id}` : "/api/employees", {
        method: editingEmployee ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "保存失败，请重试");
      await mutateEmployees();
      toast.success(formSection === "salary" ? "薪资设置已保存，不影响已生成的工资单" : editingEmployee ? "人员资料已更新，薪资未改动" : "入职档案已建立，请单独维护薪资设置");
      resetForm();
      setIsModalOpen(false);
    } catch (error) {
      console.error("保存员工失败:", error);
      toast.error(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: "删除确认", message: "确定要删除这个员工吗？", type: "danger" }))) return;
    try {
      const ok = await deleteEmployee(id);
      if (ok) {
        mutateEmployees();
        toast.success("员工已删除");
      } else {
        toast.error("删除失败");
      }
    } catch (e) {
      console.error("删除员工失败", e);
      toast.error("删除失败，请重试");
    }
  };

  const handleSortName = () => {
    if (sortBy === "name") {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy("name");
      setSortOrder("asc");
    }
  };

  const handleSortJoinDate = () => {
    if (sortBy === "joinDate") {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy("joinDate");
      setSortOrder("desc");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <HrWorkflowNav active="employees" />
      <PageHeader
        title="员工入职与档案"
        description="入职、岗位及离职资料与薪资设置分别维护；这里不生成工资或支出流水"
        actions={
          <ActionButton
            onClick={() => handleOpenModal()}
            variant="primary"
            icon={Plus}
          >
            员工入职
          </ActionButton>
        }
      />

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-slate-300">
        先办理入职，再通过员工卡片的「薪资设置」维护工资标准和收款资料。每月到「每月发工资」核算、审批和登记发放；薪资设置不会回改已生成的工资单。
      </div>

      <EmployeeStats stats={stats} departments={departments} />

      <EmployeesFilters
        searchKeyword={searchKeyword}
        onSearchChange={setSearchKeyword}
        filterDepartment={filterDepartment}
        onFilterDepartmentChange={setFilterDepartment}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortName={handleSortName}
        onSortJoinDate={handleSortJoinDate}
        departments={departments}
      />

      {employeesLoading ? <p role="status" className="text-slate-400">正在加载员工档案…</p> : employeesError ? (
        <div role="alert" className="text-rose-300">员工档案加载失败，请重试。<button onClick={() => mutateEmployees()} className="ml-3 underline">重新加载</button></div>
      ) : <EmployeesTable
        employees={filteredEmployees}
        onEdit={handleOpenModal}
        onSalary={(employee) => handleOpenModal(employee, "salary")}
        onDelete={handleDelete}
      />}

      <EmployeeFormDialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        editingEmployee={editingEmployee}
        section={formSection}
        form={form}
        setForm={setForm}
        departments={departments}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      />
      {confirmDialog}
    </div>
  );
}
