import { confirmationSalaryRule, CONFIRMATION_RULE_LABELS, calendarDay } from "./employee-confirmation";
import { hasSalarySettings, PROBATION_SALARY_FIELDS } from "./employee-profile";

type SalaryEmployee = Parameters<typeof hasSalarySettings>[0] & Parameters<typeof confirmationSalaryRule>[1]
  & Partial<Record<typeof PROBATION_SALARY_FIELDS[number], number | null>>;
const money = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export function salaryForMonth(month: string, employee: SalaryEmployee) {
  const rule = confirmationSalaryRule(month, employee);
  const probation = {
    baseSalary: employee.probationBaseSalary,
    positionSalary: employee.probationPositionSalary,
    fullAttendanceBonus: employee.probationFullAttendanceBonus,
    pensionInsurance: employee.pensionInsurance,
    unemploymentInsurance: employee.unemploymentInsurance,
    medicalInsurance: employee.medicalInsurance,
    restDays: employee.restDays,
  };
  if (rule !== "PROBATION" && !hasSalarySettings(employee)) throw new Error("转正薪资档案未完整设置");
  if (rule !== "REGULAR" && !hasSalarySettings(probation)) throw new Error("试用期薪资档案未完整设置");
  const probationWeight = rule === "PROBATION" ? 1 : rule === "HALF" ? 0.5 : 0;
  const regularWeight = 1 - probationWeight;
  const blend = (trial: number | null | undefined, regular: number | null | undefined) => money((trial ?? 0) * probationWeight + (regular ?? 0) * regularWeight);
  const amounts = {
    baseSalary: blend(employee.probationBaseSalary, employee.baseSalary),
    positionSalary: blend(employee.probationPositionSalary, employee.positionSalary),
    fullAttendanceBonus: blend(employee.probationFullAttendanceBonus, employee.fullAttendanceBonus),
  };
  return {
    ...amounts, rule,
    snapshot: {
      version: "confirmation-half-month-v1", month, rule, label: CONFIRMATION_RULE_LABELS[rule],
      confirmationDate: calendarDay(employee.confirmationDate),
      expectedConfirmationDate: calendarDay(employee.expectedConfirmationDate),
      probationWeight, regularWeight,
      probation: { baseSalary: employee.probationBaseSalary ?? null, positionSalary: employee.probationPositionSalary ?? null,
        fullAttendanceBonus: employee.probationFullAttendanceBonus ?? null },
      regular: { baseSalary: employee.baseSalary ?? null, positionSalary: employee.positionSalary ?? null,
        fullAttendanceBonus: employee.fullAttendanceBonus ?? null },
      effective: amounts,
      insurancePolicy: "MONTHLY_UNCHANGED", // Social insurance is not a half-month wage component.
    },
  };
}
