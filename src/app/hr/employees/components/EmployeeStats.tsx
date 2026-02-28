"use client";

import { Users } from "lucide-react";
import { StatCard } from "@/components/ui";
import type { EmployeeStatsData } from "./types";

interface EmployeeStatsProps {
  stats: EmployeeStatsData;
  departments: string[];
}

export function EmployeeStats({ stats, departments }: EmployeeStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      <StatCard
        title="员工总数"
        value={stats.total}
        icon={Users}
      />
      {departments.map((dept) => (
        <StatCard
          key={dept}
          title={dept}
          value={stats.byDepartment[dept]}
          icon={Users}
        />
      ))}
    </div>
  );
}
