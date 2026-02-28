"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";
import { UsersFilters } from "./components/UsersFilters";
import { UsersStats } from "./components/UsersStats";
import { UsersTable } from "./components/UsersTable";
import { UserFormDialog } from "./components/UserFormDialog";
import type { User, Department, EmployeeFromAPI, UserFormState } from "./components/types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

const initialForm: UserFormState = {
  email: "",
  password: "",
  name: "",
  role: "",
  departmentId: "",
  employeeId: "",
};

export default function UsersManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<UserFormState>(initialForm);
  const [searchKeyword, setSearchKeyword] = useState("");

  const { data: usersRaw, mutate: mutateUsers } = useSWR<any>(
    "/api/users?page=1&pageSize=500",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 600000,
    }
  );
  const { data: departmentsRaw } = useSWR<any>(
    "/api/departments?page=1&pageSize=500",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 600000,
    }
  );
  const { data: employeesRaw } = useSWR<any>(
    "/api/employees?page=1&pageSize=500",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 600000,
    }
  );

  const users = (Array.isArray(usersRaw) ? usersRaw : usersRaw?.data ?? []) as User[];
  const departments = (Array.isArray(departmentsRaw) ? departmentsRaw : departmentsRaw?.data ?? []) as Department[];
  const employees = (Array.isArray(employeesRaw) ? employeesRaw : employeesRaw?.data ?? []) as EmployeeFromAPI[];

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }
    if (session.user.role !== "SUPER_ADMIN") {
      toast.error("权限不足，仅管理员可访问此页面");
      router.push("/");
      return;
    }
  }, [session, status, router]);

  const filteredUsers = users.filter((user) => {
    if (!searchKeyword.trim()) return true;
    const keyword = searchKeyword.toLowerCase();
    return (
      user.name.toLowerCase().includes(keyword) ||
      user.email.toLowerCase().includes(keyword) ||
      user.departmentName?.toLowerCase().includes(keyword) ||
      user.role?.toLowerCase().includes(keyword)
    );
  });

  const resetForm = () => {
    setForm(initialForm);
    setEditingUser(null);
  };

  const handleEmployeeSelect = (employeeId: string) => {
    const employee = employees.find((e) => e.id === employeeId);
    if (employee) {
      setForm((prev) => ({
        ...prev,
        employeeId: employeeId,
        email: employee.email || prev.email,
        name: employee.name || prev.name,
        departmentId:
          employee.departmentId ||
          prev.departmentId ||
          departments.find((d) => d.name === employee.department)?.id ||
          "",
      }));
    }
  };

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setForm({
        email: user.email,
        password: "",
        name: user.name,
        role: user.role || "",
        departmentId: user.departmentId || "",
        employeeId: "",
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

  const handleToggleActive = async (user: User) => {
    const action = user.isActive ? "禁用" : "启用";
    if (
      !confirm(
        `确定要${action}用户 "${user.name}" 吗？${user.isActive ? "\n禁用后该用户将无法登录系统。" : ""}`
      )
    ) {
      return;
    }
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user.name,
          role: user.role,
          departmentId: user.departmentId,
          isActive: !user.isActive,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败");
      toast.success(`用户已${action}`);
      mutateUsers();
    } catch (error: unknown) {
      console.error("切换用户状态失败:", error);
      toast.error((error as Error).message || "操作失败，请重试");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击");
      return;
    }
    if (!form.email.trim() || !form.name.trim()) {
      toast.error("请填写邮箱和姓名");
      return;
    }
    if (!editingUser && !form.password.trim()) {
      toast.error("请填写密码");
      return;
    }
    setIsSubmitting(true);
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
      const method = editingUser ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        email: form.email.trim(),
        name: form.name.trim(),
        role: form.role || null,
        departmentId: form.departmentId || null,
      };
      if (!editingUser || form.password.trim()) {
        body.password = form.password;
      }
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败");
      toast.success(editingUser ? "用户信息已更新" : "用户已创建");
      mutateUsers();
      resetForm();
      setIsModalOpen(false);
    } catch (error: unknown) {
      console.error("保存用户失败:", error);
      toast.error((error as Error).message || "保存失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-white text-xl">加载中...</div>
      </div>
    );
  }

  if (!session || session.user.role !== "SUPER_ADMIN") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">员工档案管理</h1>
            <p className="text-white/70">管理系统用户账号和权限</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus className="h-5 w-5" />
            新增员工
          </button>
        </div>

        <UsersStats users={filteredUsers} />
        <UsersFilters
          searchKeyword={searchKeyword}
          onSearchChange={setSearchKeyword}
        />
        <UsersTable
          users={filteredUsers}
          onEdit={handleOpenModal}
          onToggleActive={handleToggleActive}
        />

        <UserFormDialog
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          editingUser={editingUser}
          form={form}
          setForm={setForm}
          departments={departments}
          employees={employees}
          users={users}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onEmployeeSelect={handleEmployeeSelect}
        />
      </div>
    </div>
  );
}
