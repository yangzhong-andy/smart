"use client";

import { Users, UserCheck } from "lucide-react";
import type { User } from "./types";

interface UsersStatsProps {
  users: User[];
}

export function UsersStats({ users }: UsersStatsProps) {
  const total = users.length;
  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
      <div className="bg-white/10 backdrop-blur-xl rounded-xl p-4 border border-white/20 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-white/10">
          <Users className="h-6 w-6 text-white/80" />
        </div>
        <div>
          <p className="text-sm text-white/70">总用户数</p>
          <p className="text-2xl font-bold text-white">{total}</p>
        </div>
      </div>
      <div className="bg-white/10 backdrop-blur-xl rounded-xl p-4 border border-white/20 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-green-500/20">
          <UserCheck className="h-6 w-6 text-green-400" />
        </div>
        <div>
          <p className="text-sm text-white/70">已启用</p>
          <p className="text-2xl font-bold text-white">{activeCount}</p>
        </div>
      </div>
    </div>
  );
}
