"use client";

import { memo } from "react";
import { Users, Pencil, Trash2, Wallet } from "lucide-react";
import { hasSalarySettings, hasProbationSalarySettings } from "@/lib/employee-profile";
import { ActionButton } from "@/components/ui";
import { EmptyState } from "@/components/ui";
import type { Employee } from "./types";

interface EmployeesTableProps {
  employees: Employee[];
  onEdit: (employee: Employee) => void;
  onSalary: (employee: Employee) => void;
  onDelete: (id: string) => void;
}

function EmployeesTableComponent({
  employees,
  onEdit,
  onSalary,
  onDelete,
}: EmployeesTableProps) {
  if (employees.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="暂无员工"
        description="点击右上角「员工入职」建立档案，再单独维护薪资设置"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {employees.map((employee) => (
        <div
          key={employee.id}
          className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-primary-500/50 transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-white text-lg">
                {employee.name}
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                {employee.department} · {employee.position}
              </p>
            </div>
            <span
              className={`px-2 py-1 rounded text-xs ${
                employee.status === "在职"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : employee.status === "试用期"
                    ? "bg-blue-500/20 text-blue-300"
                    : "bg-slate-700/50 text-slate-400"
              }`}
            >
              {employee.status}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            {employee.employeeNumber && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">工号：</span>
                <span className="text-slate-300">
                  {employee.employeeNumber}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">入职日期：</span>
              <span className="text-slate-300">{employee.joinDate.slice(0, 10)}</span>
            </div>
            {(employee.expectedConfirmationDate || employee.confirmationDate) && <div className="flex items-center justify-between">
              <span className="text-slate-400">{employee.confirmationDate ? "实际转正：" : "预计转正："}</span>
              <span className="text-slate-300">{employee.confirmationDate || employee.expectedConfirmationDate}</span>
            </div>}
            {employee.phone && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">手机：</span>
                <span className="text-slate-300">{employee.phone}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">薪资档案：</span>
              <span className={hasSalarySettings(employee) ? "text-emerald-300" : "text-amber-300"}>
                {hasSalarySettings(employee) ? "转正标准已设置" : "转正标准待设置"}
              </span>
            </div>
            {(employee.probationStartDate || employee.status === "试用期") && <div className="flex items-center justify-between">
              <span className="text-slate-400">试用期薪资：</span>
              <span className={hasProbationSalarySettings(employee) ? "text-emerald-300" : "text-amber-300"}>
                {hasProbationSalarySettings(employee) ? "已设置" : "待设置（试用期工资暂停生成）"}
              </span>
            </div>}
          </div>

          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-800">
            <ActionButton
              onClick={() => onEdit(employee)}
              variant="secondary"
              size="sm"
              icon={Pencil}
            >
              人员资料
            </ActionButton>
            <ActionButton onClick={() => onSalary(employee)} variant="secondary" size="sm" icon={Wallet}>
              薪资设置
            </ActionButton>
            <ActionButton
              onClick={() => onDelete(employee.id)}
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
  );
}

export const EmployeesTable = memo(EmployeesTableComponent);
