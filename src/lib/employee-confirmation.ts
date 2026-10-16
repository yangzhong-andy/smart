// Calendar dates are persisted at UTC midnight. Expected dates never confirm employment.
export const EMPLOYMENT_DATE_FIELDS = ["probationStartDate", "expectedConfirmationDate", "confirmationDate"] as const;
type CalendarDate = Date | string | null | undefined;
type EmploymentProfile = {
  joinDate?: CalendarDate; leaveDate?: CalendarDate; status?: string;
  probationStartDate?: CalendarDate; expectedConfirmationDate?: CalendarDate; confirmationDate?: CalendarDate;
};

export function calendarDay(value: CalendarDate): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) < 1900 || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date) throw new Error("请填写有效日期");
  return date;
}

export function parseEmploymentSettings(input: Record<string, unknown>, current: EmploymentProfile = {}, now = new Date()) {
  const result: Partial<Record<typeof EMPLOYMENT_DATE_FIELDS[number], Date | null>> & { status?: string } = {};
  for (const key of EMPLOYMENT_DATE_FIELDS) {
    if (input[key] === undefined) continue;
    if (input[key] !== null && typeof input[key] !== "string") throw new Error("请填写有效日期");
    const day = calendarDay(input[key] as string | null);
    result[key] = day ? new Date(`${day}T00:00:00Z`) : null;
  }
  const statusMap: Record<string, string> = { 在职: "ACTIVE", 试用期: "PROBATION", 离职: "INACTIVE" };
  const rawStatus = input.status ?? current.status ?? "ACTIVE";
  if (typeof rawStatus !== "string") throw new Error("员工状态不正确");
  let status = statusMap[rawStatus] || rawStatus;
  if (!["ACTIVE", "PROBATION", "INACTIVE"].includes(status)) throw new Error("员工状态不正确");
  const join = calendarDay((input.joinDate ?? current.joinDate) as CalendarDate);
  const leave = calendarDay((input.leaveDate === undefined ? current.leaveDate : input.leaveDate) as CalendarDate);
  if (!join) throw new Error("请填写入职日期");
  if (leave && leave < join) throw new Error("离职日期不能早于入职日期");
  const expected = calendarDay(result.expectedConfirmationDate === undefined ? current.expectedConfirmationDate : result.expectedConfirmationDate);
  const confirmed = calendarDay(result.confirmationDate === undefined ? current.confirmationDate : result.confirmationDate);
  let start = calendarDay(result.probationStartDate === undefined ? current.probationStartDate : result.probationStartDate);
  if ((status === "PROBATION" || expected || confirmed) && !start) {
    start = join;
    result.probationStartDate = new Date(`${join}T00:00:00Z`);
  }
  if (start && start < join) throw new Error("试用期开始日期不能早于入职日期");
  if (expected && (!start || expected < start)) throw new Error("预计转正日期不能早于试用期开始日期");
  if (confirmed) {
    if (!start || confirmed < start) throw new Error("实际转正日期不能早于试用期开始日期");
    const today = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
    if (confirmed > today) throw new Error("实际转正日期不能是未来日期，请填写预计转正日期");
    if (leave && confirmed > leave) throw new Error("实际转正日期不能晚于离职日期");
    if (status !== "INACTIVE") status = "ACTIVE";
  } else if (start && status === "ACTIVE") {
    throw new Error("试用期员工转正请填写实际转正日期，预计日期不会自动转正");
  }
  if (calendarDay(current.probationStartDate) && !start) throw new Error("已有试用期记录不能直接清空，请更正日期或填写实际转正日期");
  if (input.status !== undefined || input.confirmationDate !== undefined) result.status = status;
  return result;
}

export const CONFIRMATION_RULE_LABELS = {
  PROBATION: "整月按试用期工资",
  REGULAR: "整月按转正工资",
  HALF: "半个月试用期工资＋半个月转正工资",
} as const;
export type ConfirmationSalaryRule = keyof typeof CONFIRMATION_RULE_LABELS;

export function confirmationSalaryRule(month: string, profile: EmploymentProfile): ConfirmationSalaryRule {
  const confirmed = calendarDay(profile.confirmationDate);
  if (!confirmed) return profile.probationStartDate || ["PROBATION", "试用期"].includes(profile.status || "") ? "PROBATION" : "REGULAR";
  if (month < confirmed.slice(0, 7)) return "PROBATION";
  if (month > confirmed.slice(0, 7)) return "REGULAR";
  const day = Number(confirmed.slice(8, 10));
  return day <= 10 ? "REGULAR" : day <= 20 ? "HALF" : "PROBATION";
}
