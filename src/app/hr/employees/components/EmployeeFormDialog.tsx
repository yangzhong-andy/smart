"use client";

import { X } from "lucide-react";
import { ActionButton } from "@/components/ui";
import type { Employee, Department } from "./types";
import type { EmployeeFormState } from "./types";

interface EmployeeFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editingEmployee: Employee | null;
  form: EmployeeFormState;
  setForm: React.Dispatch<React.SetStateAction<EmployeeFormState>>;
  departments: string[];
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function EmployeeFormDialog({
  isOpen,
  onClose,
  editingEmployee,
  form,
  setForm,
  departments,
  isSubmitting,
  onSubmit,
}: EmployeeFormDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-100">
            {editingEmployee ? "编辑员工" : "新增员工"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm text-slate-300">姓名 *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">工号</span>
              <input
                type="text"
                value={form.employeeNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, employeeNumber: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">部门 *</span>
              <select
                value={form.department}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    department: e.target.value as Department,
                  }))
                }
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, position: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">入职日期</span>
              <input
                type="date"
                value={form.joinDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, joinDate: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">状态</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as EmployeeFormState["status"],
                  }))
                }
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">邮箱</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-sm text-slate-300">备注</span>
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={3}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
            />
          </label>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <ActionButton type="button" onClick={onClose} variant="secondary">
              取消
            </ActionButton>
            <ActionButton
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? editingEmployee
                  ? "更新中..."
                  : "创建中..."
                : editingEmployee
                  ? "更新"
                  : "创建"}
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}
