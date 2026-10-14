"use client";

import { X } from "lucide-react";
import { ActionButton } from "@/components/ui";
import type { Employee, Department } from "./types";
import type { EmployeeFormState } from "./types";

interface EmployeeFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editingEmployee: Employee | null;
  section: "personnel" | "salary";
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
  section,
  form,
  setForm,
  departments,
  isSubmitting,
  onSubmit,
}: EmployeeFormDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div role="dialog" aria-modal="true" aria-labelledby="employee-dialog-title" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 id="employee-dialog-title" className="text-xl font-semibold text-slate-100">
            {section === "salary" ? `${editingEmployee?.name} · 薪资设置` : editingEmployee ? "编辑人员资料" : "办理员工入职"}
          </h2>
          <button onClick={onClose} disabled={isSubmitting} aria-label="关闭" className="text-slate-400 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-slate-400">
            {section === "salary" ? "只保存薪资标准和收款资料，不生成工资、不记账，也不修改已生成的工资单。薪资项目需明确填写，没有的请填 0。" : "这里只保存人员资料，不要求填写工资。入职后可通过「薪资设置」单独维护。"}
          </p>
          <fieldset disabled={isSubmitting} className="space-y-4">
          {/* 基本信息 */}
          {section === "personnel" && <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm text-slate-300">姓名 *</span>
              <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400" required />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">工号</span>
              <input type="text" value={form.employeeNumber} onChange={(e) => setForm((f) => ({ ...f, employeeNumber: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400" />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">部门 *</span>
              <select value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value as Department }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400" required>
                <option value="">请选择</option>
                {departments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">岗位 *</span>
              <input type="text" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400" required />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">入职日期 *</span>
              <input type="date" required value={form.joinDate} onChange={(e) => setForm((f) => ({ ...f, joinDate: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400" style={{ colorScheme: "dark" }} />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">离职日期</span>
              <input type="date" value={form.leaveDate} onChange={(e) => setForm((f) => ({ ...f, leaveDate: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400" style={{ colorScheme: "dark" }} />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">状态</span>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as EmployeeFormState["status"] }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400">
                <option value="在职">在职</option>
                <option value="试用期">试用期</option>
                <option value="离职">离职</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">手机号</span>
              <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400" />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-sm text-slate-300">邮箱</span>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400" />
            </label>
          </div>}

          {/* 薪资档案 */}
          {section === "salary" && <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4 space-y-3">
            <div className="text-sm font-medium text-slate-300">薪资档案 · 人民币 <span className="text-xs text-slate-500">（新生成的工资草稿带入此标准）</span></div>
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-400">基础薪资</span>
                <input type="number" step="0.01" value={form.baseSalary} onChange={(e) => setForm((f) => ({ ...f, baseSalary: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">岗位薪资</span>
                <input type="number" step="0.01" value={form.positionSalary} onChange={(e) => setForm((f) => ({ ...f, positionSalary: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">满勤奖</span>
                <input type="number" step="0.01" value={form.fullAttendanceBonus} onChange={(e) => setForm((f) => ({ ...f, fullAttendanceBonus: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">养老(个人)</span>
                <input type="number" step="0.01" value={form.pensionInsurance} onChange={(e) => setForm((f) => ({ ...f, pensionInsurance: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">失业(个人)</span>
                <input type="number" step="0.01" value={form.unemploymentInsurance} onChange={(e) => setForm((f) => ({ ...f, unemploymentInsurance: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">医疗(个人)</span>
                <input type="number" step="0.01" value={form.medicalInsurance} onChange={(e) => setForm((f) => ({ ...f, medicalInsurance: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-400">银行卡号</span>
                <input type="text" value={form.bankAccount} onChange={(e) => setForm((f) => ({ ...f, bankAccount: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">开户行</span>
                <input type="text" value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} placeholder="如：中国银行福州埔顶支行" className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400" />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">身份证号</span>
              <input type="text" value={form.idNumber} onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">月休息天数 *</span>
              <input type="number" required min="0" max="31" step="1" value={form.restDays} onChange={(e) => setForm((f) => ({ ...f, restDays: e.target.value }))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400" />
            </label>
          </div>}

          {section === "personnel" && <label className="block space-y-1">
            <span className="text-sm text-slate-300">备注</span>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400" />
          </label>}
          </fieldset>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <ActionButton type="button" onClick={onClose} disabled={isSubmitting} variant="secondary">取消</ActionButton>
            <ActionButton type="submit" variant="primary" isLoading={isSubmitting} disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : section === "salary" ? "保存薪资设置" : editingEmployee ? "保存人员资料" : "确认入职"}
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}
