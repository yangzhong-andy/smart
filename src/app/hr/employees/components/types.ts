import type { Employee, Department } from "@/lib/hr-store";

export type { Employee, Department };

export interface DepartmentFromAPI {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
}

export type FilterStatus = "all" | "在职" | "离职" | "试用期";
export type SortBy = "name" | "joinDate" | "none";
export type SortOrder = "asc" | "desc";

export interface EmployeeFormState {
  name: string;
  employeeNumber: string;
  department: Department | "";
  position: string;
  joinDate: string;
  phone: string;
  email: string;
  status: "在职" | "离职" | "试用期";
  notes: string;
}

export interface EmployeeStatsData {
  total: number;
  byDepartment: Record<string, number>;
  byStatus: {
    在职: number;
    离职: number;
    试用期: number;
  };
}
