"use client";

import { memo } from "react";
import { Users, Pencil, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui";
import { EmptyState } from "@/components/ui";
import type { Employee } from "./types";

interface EmployeesTableProps {
  employees: Employee[];
  onEdit: (employee: Employee) => void;
  onDelete: (id: string) => void;
}

function EmployeesTableComponent({
  employees,
  onEdit,
  onDelete,
}: EmployeesTableProps) {
  if (employees.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="暂无员工"
        description="点击右上角「新增员工」开始添加"
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
              onClick={() => onEdit(employee)}
              variant="secondary"
              size="sm"
              icon={Pencil}
            >
              编辑
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
