export interface User {
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

export interface Department {
  id: string;
  name: string;
  code: string | null;
}

export interface EmployeeFromAPI {
  id: string;
  name: string;
  email?: string;
  department?: string;
  departmentId?: string;
  position?: string;
}

export interface UserFormState {
  email: string;
  password: string;
  name: string;
  role: string;
  departmentId: string;
  employeeId: string;
}
