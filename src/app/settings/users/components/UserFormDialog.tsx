"use client";

import { X } from "lucide-react";
import type { User, Department, EmployeeFromAPI, UserFormState } from "./types";

interface UserFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editingUser: User | null;
  form: UserFormState;
  setForm: React.Dispatch<React.SetStateAction<UserFormState>>;
  departments: Department[];
  employees: EmployeeFromAPI[];
  users: User[];
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onEmployeeSelect: (employeeId: string) => void;
}

export function UserFormDialog({
  isOpen,
  onClose,
  editingUser,
  form,
  setForm,
  departments,
  employees,
  users,
  isSubmitting,
  onSubmit,
  onEmployeeSelect,
}: UserFormDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">
            {editingUser ? "编辑员工" : "新增员工"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {!editingUser && (
            <div>
              <label className="block text-sm text-slate-300 mb-1">
                关联员工档案（可选）
              </label>
              <select
                value={form.employeeId}
                onChange={(e) => {
                  if (e.target.value) {
                    onEmployeeSelect(e.target.value);
                  } else {
                    setForm((f) => ({ ...f, employeeId: "" }));
                  }
                }}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
              >
                <option value="">不关联（手动填写）</option>
                {employees
                  .filter(
                    (emp: EmployeeFromAPI) =>
                      emp.email &&
                      !users.find((u) => u.email === emp.email)
                  )
                  .map((emp: EmployeeFromAPI) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.email}) - {emp.department || emp.position || ""}
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
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
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
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
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
              onChange={(e) =>
                setForm((f) => ({ ...f, departmentId: e.target.value }))
              }
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
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value }))
              }
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
              onClick={onClose}
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
  );
}
