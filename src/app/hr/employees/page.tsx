"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader, ActionButton } from "@/components/ui";
import useSWR from "swr";
import {
  upsertEmployee,
  deleteEmployee,
  type Employee,
  type Department,
} from "@/lib/hr-store";
import { EmployeeStats } from "./components/EmployeeStats";
import { EmployeesFilters } from "./components/EmployeesFilters";
import { EmployeesTable } from "./components/EmployeesTable";
import { EmployeeFormDialog } from "./components/EmployeeFormDialog";
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
  phone: "",
  email: "",
  status: "在职",
  notes: "",
};

export default function EmployeesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterDepartment, setFilterDepartment] = useState<
    Department | "all"
  >("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<SortBy>("none");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [form, setForm] = useState<EmployeeFormState>(initialForm);

  const { data: employeesDataRaw, mutate: mutateEmployees } = useSWR<any>(
    "/api/employees?page=1&pageSize=500",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );
  const employees = (Array.isArray(employeesDataRaw)
    ? employeesDataRaw
    : employeesDataRaw?.data ?? []) as Employee[];

  const { data: departmentsDataRaw } = useSWR<any>(
    "/api/departments?page=1&pageSize=500",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 600000,
    }
  );
  const departmentsData = (Array.isArray(departmentsDataRaw)
    ? departmentsDataRaw
    : departmentsDataRaw?.data ?? []) as DepartmentFromAPI[];

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
        notes: employee.notes || "",
      });
    } else {
      resetForm();
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
      updatedAt: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      await upsertEmployee(employeeData);
      mutateEmployees();
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

      <EmployeesTable
        employees={filteredEmployees}
        onEdit={handleOpenModal}
        onDelete={handleDelete}
      />

      <EmployeeFormDialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        editingEmployee={editingEmployee}
        form={form}
        setForm={setForm}
        departments={departments}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
