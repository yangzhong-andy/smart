// Personnel records and salary settings are saved independently. Neither writes Payroll/CashFlow.
export const SALARY_MONEY_FIELDS = [
  "baseSalary", "positionSalary", "fullAttendanceBonus",
  "pensionInsurance", "unemploymentInsurance", "medicalInsurance",
] as const;

export const SALARY_TEXT_FIELDS = ["bankAccount", "bankName", "idNumber"] as const;
export const PROBATION_SALARY_FIELDS = ["probationBaseSalary", "probationPositionSalary", "probationFullAttendanceBonus"] as const;
export type SalaryMoneyField = typeof SALARY_MONEY_FIELDS[number];
type SalaryProfile = Partial<Record<SalaryMoneyField | "restDays", number | null>>;

export function parseSalarySettings(input: Record<string, unknown>) {
  const result: Partial<Record<SalaryMoneyField | "restDays", number> & Record<typeof SALARY_TEXT_FIELDS[number], string | null>
    & Record<typeof PROBATION_SALARY_FIELDS[number], number | null>> = {};
  for (const field of [...SALARY_MONEY_FIELDS, "restDays"] as const) {
    if (input[field] === undefined) continue;
    const raw = input[field];
    if ((typeof raw !== "number" && typeof raw !== "string") || String(raw).trim() === "") {
      throw new Error("薪资金额和休息天数不能为空，请明确填写，未发生项目可填 0");
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("薪资金额和休息天数必须是非负数字");
    if (field === "restDays" && (!Number.isInteger(amount) || amount > 31)) {
      throw new Error("月休息天数必须是 0 至 31 的整数");
    }
    result[field] = field === "restDays" ? amount : Math.round(amount * 100) / 100;
  }
  for (const field of PROBATION_SALARY_FIELDS) {
    if (input[field] === undefined) continue;
    const raw = input[field];
    if (raw === null || raw === "") { result[field] = null; continue; }
    if ((typeof raw !== "number" && typeof raw !== "string") || String(raw).trim() === ""
      || !Number.isFinite(Number(raw)) || Number(raw) < 0) throw new Error("试用期薪资必须是非负数字，未发生项目请填 0");
    result[field] = Math.round(Number(raw) * 100) / 100;
  }
  for (const field of SALARY_TEXT_FIELDS) {
    if (input[field] !== undefined) {
      if (input[field] !== null && typeof input[field] !== "string") throw new Error("收款资料格式不正确");
      result[field] = (input[field] as string | null)?.trim() || null;
    }
  }
  return result;
}

export function initialSalarySettings(input: Record<string, unknown>) {
  // Explicit null overrides old schema defaults, so onboarding alone cannot invent a salary.
  return {
    baseSalary: null, positionSalary: null, fullAttendanceBonus: null,
    pensionInsurance: null, unemploymentInsurance: null, medicalInsurance: null,
    probationBaseSalary: null, probationPositionSalary: null, probationFullAttendanceBonus: null,
    ...parseSalarySettings(input),
  };
}

export function hasSalarySettings(profile: SalaryProfile): boolean {
  return SALARY_MONEY_FIELDS.every((field) => {
    const value = profile[field];
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }) && typeof profile.restDays === "number" && Number.isInteger(profile.restDays)
    && profile.restDays >= 0 && profile.restDays <= 31;
}

export function hasProbationSalarySettings(profile: SalaryProfile & Partial<Record<typeof PROBATION_SALARY_FIELDS[number], number | null>>): boolean {
  return hasSalarySettings({ ...profile, baseSalary: profile.probationBaseSalary,
    positionSalary: profile.probationPositionSalary, fullAttendanceBonus: profile.probationFullAttendanceBonus });
}

export function personnelSettings(input: Record<string, unknown>) {
  // Do not send salary, bank details, associations or monthly payroll data when editing personnel.
  const fields = ["name", "employeeNumber", "department", "position", "joinDate", "leaveDate", "phone", "email", "status", "notes",
    "probationStartDate", "expectedConfirmationDate", "confirmationDate"] as const;
  return Object.fromEntries(fields.map((field) => [field, typeof input[field] === "string" ? input[field].trim() : ""]));
}

export function employeeStatusLabel(status: string): "在职" | "试用期" | "离职" {
  const labels: Record<string, string> = { ACTIVE: "在职", PROBATION: "试用期", INACTIVE: "离职" };
  return (labels[status] || status) as "在职" | "试用期" | "离职";
}
