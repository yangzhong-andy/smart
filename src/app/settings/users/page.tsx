"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Users, Plus, Pencil, Trash2, Search, X, Shield, Building2, Power, Ban } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";

// SWR fetcher
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

interface User {
  id: string;
  email: string;
  name: string;
  role: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Department {
  id: string;
  name: string;
  code: string | null;
}

export default function UsersManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 获取用户列表
  const { data: users = [], mutate: mutateUsers } = useSWR<User[]>('/api/users', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000, // 10分钟内去重
  });
  
  // 获取部门列表
  const { data: departments = [] } = useSWR<Department[]>('/api/departments', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000, // 10分钟内去重
  });
  
  // 获取员工列表（用于关联员工档案）
  const { data: employees = [] } = useSWR<any[]>('/api/employees', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000, // 10分钟内去重
  });
  
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "",
    departmentId: "",
    employeeId: "" // 关联的员工档案ID
  });

  const [searchKeyword, setSearchKeyword] = useState("");

  // 检查权限
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

  // 筛选用户
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
    setForm({
      email: "",
      password: "",
      name: "",
      role: "",
      departmentId: "",
      employeeId: ""
    });
    setEditingUser(null);
  };
  
  // 当选择员工档案时，自动填充信息
  const handleEmployeeSelect = (employeeId: string) => {
    const employee = employees.find((e: any) => e.id === employeeId);
    if (employee) {
      setForm((prev) => ({
        ...prev,
        employeeId: employeeId,
        email: employee.email || prev.email,
        name: employee.name || prev.name,
        // 根据员工的部门名称找到对应的部门ID
        departmentId: employee.departmentId || prev.departmentId || 
          (departments.find((d) => d.name === employee.department)?.id || "")
      }));
    }
  };

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setForm({
        email: user.email,
        password: "", // 编辑时不显示密码
        name: user.name,
        role: user.role || "",
        departmentId: user.departmentId || "",
        employeeId: ""
      });
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  // 切换用户启用/禁用状态
  const handleToggleActive = async (user: User) => {
    const action = user.isActive ? "禁用" : "启用";
    if (!confirm(`确定要${action}用户 "${user.name}" 吗？${user.isActive ? "\n禁用后该用户将无法登录系统。" : ""}`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: user.name,
          role: user.role,
          departmentId: user.departmentId,
          isActive: !user.isActive
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '操作失败');
      }

      toast.success(`用户已${action}`);
      mutateUsers();
    } catch (error: any) {
      console.error("切换用户状态失败:", error);
      toast.error(error.message || "操作失败，请重试");
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
    
    // 创建用户时必须填写密码
    if (!editingUser && !form.password.trim()) {
      toast.error("请填写密码");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';
      
      // 构建请求体（编辑时如果没有填写密码，则不包含密码字段）
      const body: any = {
        email: form.email.trim(),
        name: form.name.trim(),
        role: form.role || null,
        departmentId: form.departmentId || null
      };
      
      // 只有创建用户或编辑时填写了新密码才包含密码
      if (!editingUser || form.password.trim()) {
        body.password = form.password;
      }
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '操作失败');
      }
      
      toast.success(editingUser ? "用户信息已更新" : "用户已创建");
      mutateUsers();
      resetForm();
      setIsModalOpen(false);
    } catch (error: any) {
      console.error("保存用户失败:", error);
      toast.error(error.message || "保存失败，请重试");
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
        {/* 页面标题 */}
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

        {/* 搜索栏 */}
        <div className="bg-white/10 backdrop-blur-xl rounded-xl p-4 border border-white/20">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-white/70" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索姓名、邮箱、部门..."
              className="flex-1 bg-transparent text-white placeholder-white/50 outline-none"
            />
          </div>
        </div>

        {/* 用户列表 */}
        <div className="bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">姓名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">邮箱</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">部门</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">角色</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">最后登录</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-white/70 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-white/70">
                      暂无用户数据
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-white/50" />
                          <span className="text-white">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-white/80">{user.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-white/50" />
                          <span className="text-white/80">{user.departmentName || "未分配"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-white/50" />
                          <span className="text-white/80">{user.role || "普通用户"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          user.isActive 
                            ? "bg-green-500/20 text-green-400" 
                            : "bg-red-500/20 text-red-400"
                        }`}>
                          {user.isActive ? "启用" : "禁用"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-white/60 text-sm">
                        {user.lastLoginAt 
                          ? new Date(user.lastLoginAt).toLocaleString("zh-CN")
                          : "从未登录"
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenModal(user)}
                            className="text-blue-400 hover:text-blue-300"
                            title="编辑"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(user)}
                            className={user.isActive 
                              ? "text-red-400 hover:text-red-300" 
                              : "text-green-400 hover:text-green-300"
                            }
                            title={user.isActive ? "禁用账号" : "启用账号"}
                          >
                            {user.isActive ? (
                              <Ban className="h-4 w-4" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 新增/编辑用户模态框 */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
            <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">
                  {editingUser ? "编辑员工" : "新增员工"}
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
                {/* 关联员工档案（仅创建时显示） */}
                {!editingUser && (
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">
                      关联员工档案（可选）
                    </label>
                    <select
                      value={form.employeeId}
                      onChange={(e) => {
                        if (e.target.value) {
                          handleEmployeeSelect(e.target.value);
                        } else {
                          setForm((f) => ({ ...f, employeeId: "" }));
                        }
                      }}
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="">不关联（手动填写）</option>
                      {employees
                        .filter((emp: any) => emp.email && !users.find((u) => u.email === emp.email))
                        .map((emp: any) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({emp.email}) - {emp.department || emp.position})
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      选择已存在的员工档案，将自动填充邮箱、姓名和部门
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-slate-300 mb-1">邮箱 *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
                    required
                    disabled={!!editingUser}
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">
                    密码 {editingUser ? "(留空则不修改)" : "*"}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
                    required={!editingUser}
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">姓名 *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">部门</label>
                  <select
                    value={form.departmentId}
                    onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
                  >
                    <option value="">请选择部门</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">角色</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
                  >
                    <option value="">普通用户</option>
                    <option value="SUPER_ADMIN">超级管理员</option>
                    <option value="ADMIN">管理员</option>
                    <option value="MANAGER">经理</option>
                    <option value="EMPLOYEE">员工</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setIsModalOpen(false);
                    }}
                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? "提交中..." : editingUser ? "更新" : "创建"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
