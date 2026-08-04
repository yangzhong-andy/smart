"use client";

import { memo } from "react";
import {
  Users,
  Pencil,
  Building2,
  Shield,
  Power,
  Ban,
} from "lucide-react";
import type { User } from "./types";

interface UsersTableProps {
  users: User[];
  onEdit: (user: User) => void;
  onToggleActive: (user: User) => void;
}

function UsersTableComponent({ users, onEdit, onToggleActive }: UsersTableProps) {
  return (
    <div className="bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-white/5">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                姓名
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                邮箱
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                部门
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                角色
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                状态
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                最后登录
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-white/70 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-8 text-center text-white/70"
                >
                  暂无用户数据
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-white/5 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-white/50" />
                      <span className="text-white">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-white/80">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-white/50" />
                      <span className="text-white/80">
                        {user.departmentName || "未分配"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-white/50" />
                      <span className="text-white/80">
                        {user.role || "普通用户"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        user.isActive
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {user.isActive ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-white/60 text-sm">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString("zh-CN")
                      : "从未登录"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEdit(user)}
                        className="text-blue-400 hover:text-blue-300"
                        title="编辑"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onToggleActive(user)}
                        className={
                          user.isActive
                            ? "text-red-400 hover:text-red-300"
                            : "text-green-400 hover:text-green-300"
                        }
                        title={
                          user.isActive ? "禁用账号" : "启用账号"
                        }
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
  );
}

export const UsersTable = memo(UsersTableComponent);
