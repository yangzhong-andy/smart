import assert from "node:assert/strict";
import test from "node:test";
import { calendarDay, confirmationSalaryRule, parseEmploymentSettings } from "./employee-confirmation";
import { salaryForMonth } from "./employee-salary";
import { hasProbationSalarySettings, parseSalarySettings } from "./employee-profile";

const now = new Date("2026-10-15T11:00:00Z");
const trial = { status: "PROBATION", joinDate: "2026-01-01", probationStartDate: "2026-01-01" };
const wages = { ...trial, baseSalary: 4000, positionSalary: 500, fullAttendanceBonus: 200,
  probationBaseSalary: 3000, probationPositionSalary: 0, probationFullAttendanceBonus: 100,
  pensionInsurance: 300, unemploymentInsurance: 20, medicalInsurance: 80, restDays: 7 };

test("confirmation boundaries include 10/11, 20/21, day 31, February and next year", () => {
  for (let day = 1; day <= 31; day++) {
    const profile = { ...trial, confirmationDate: `2026-03-${String(day).padStart(2, "0")}` };
    assert.equal(confirmationSalaryRule("2026-03", profile), day <= 10 ? "REGULAR" : day <= 20 ? "HALF" : "PROBATION");
    assert.equal(confirmationSalaryRule("2026-02", profile), "PROBATION");
    assert.equal(confirmationSalaryRule("2026-04", profile), "REGULAR");
  }
  for (const date of ["2026-02-28", "2024-02-29", "2026-12-31"]) {
    assert.equal(confirmationSalaryRule(date.slice(0, 7), { ...trial, confirmationDate: date }), "PROBATION");
  }
  assert.equal(confirmationSalaryRule("2027-01", { ...trial, confirmationDate: "2026-12-31" }), "REGULAR");
});

test("expected confirmation never triggers salary/status conversion; legacy active staff retain salary", () => {
  assert.equal(confirmationSalaryRule("2026-10", { ...trial, expectedConfirmationDate: "2026-03-05" }), "PROBATION");
  assert.equal(confirmationSalaryRule("2026-10", { status: "ACTIVE" }), "REGULAR");
  assert.equal(confirmationSalaryRule("2026-10", { status: "INACTIVE", probationStartDate: "2026-01-01" }), "PROBATION");
  const saved = parseEmploymentSettings({ expectedConfirmationDate: "2026-03-05" }, trial, now);
  assert.equal(saved.confirmationDate, undefined);
  assert.equal(saved.status, undefined);
});

test("all mid-month confirmations use exactly 50/50, not calendar-day fractions", () => {
  for (const day of [11, 15, 20]) {
    const salary = salaryForMonth("2026-03", { ...wages, confirmationDate: `2026-03-${day}` });
    assert.equal(salary.baseSalary, 3500);
    assert.equal(salary.positionSalary, 250);
    assert.equal(salary.fullAttendanceBonus, 150);
    assert.equal(salary.snapshot.probationWeight, 0.5);
    assert.equal(salary.snapshot.regularWeight, 0.5);
    assert.equal(salary.snapshot.insurancePolicy, "MONTHLY_UNCHANGED");
  }
});

test("each used stage requires explicit salary including zero; no fallback from regular to probation", () => {
  assert.throws(() => salaryForMonth("2026-03", { ...wages, probationBaseSalary: null }), /试用期薪资/);
  assert.throws(() => salaryForMonth("2026-03", { ...wages, confirmationDate: "2026-03-15", baseSalary: null }), /转正薪资/);
  const zero = { ...wages, probationBaseSalary: 0, probationPositionSalary: 0, probationFullAttendanceBonus: 0 };
  assert.equal(hasProbationSalarySettings(zero), true);
  assert.equal(salaryForMonth("2026-03", zero).baseSalary, 0);
  assert.equal(salaryForMonth("2026-03", { ...wages, confirmationDate: "2026-02-25", probationBaseSalary: null }).baseSalary, 4000);
  assert.deepEqual(parseSalarySettings({ probationBaseSalary: "3000.126", probationPositionSalary: "0", probationFullAttendanceBonus: "" }),
    { probationBaseSalary: 3000.13, probationPositionSalary: 0, probationFullAttendanceBonus: null });
  for (const value of [-1, "bad", " ", true, [], Infinity]) assert.throws(() => parseSalarySettings({ probationBaseSalary: value }));
});

test("confirmation needs valid actual dates and is not a status-only toggle", () => {
  const saved = parseEmploymentSettings({ confirmationDate: "2026-03-15" }, trial, now);
  assert.equal(saved.status, "ACTIVE");
  assert.equal(saved.confirmationDate?.toISOString(), "2026-03-15T00:00:00.000Z");
  assert.throws(() => parseEmploymentSettings({ status: "ACTIVE" }, trial, now), /实际转正日期/);
  assert.throws(() => parseEmploymentSettings({ confirmationDate: "2026-10-16" }, trial, now), /未来/);
  assert.throws(() => parseEmploymentSettings({ confirmationDate: "2025-12-31" }, trial, now), /早于/);
  assert.throws(() => parseEmploymentSettings({ confirmationDate: "2026-03-15", leaveDate: "2026-03-10" }, trial, now), /晚于离职/);
  for (const date of ["bad", "2026-02-29", "2026-04-31", "2026-13-01"]) assert.throws(() => calendarDay(date));
  const started = parseEmploymentSettings({ joinDate: "2026-10-01", status: "试用期" }, {}, now);
  assert.equal(started.probationStartDate?.toISOString().slice(0, 10), "2026-10-01");
  const legacy = parseEmploymentSettings({ status: "ACTIVE", confirmationDate: "2026-03-15", probationStartDate: "" }, { status: "PROBATION", joinDate: "2026-01-01" }, now);
  assert.equal(legacy.probationStartDate?.toISOString().slice(0, 10), "2026-01-01");
  assert.equal(legacy.status, "ACTIVE");
});

test("calendar-day confirmation is timezone independent and snapshot values do not follow later edits", () => {
  const first = salaryForMonth("2026-03", { ...wages, confirmationDate: new Date("2026-03-15T00:00:00Z") });
  wages.baseSalary = 5000;
  assert.equal(first.snapshot.regular.baseSalary, 4000);
  wages.baseSalary = 4000;
  assert.equal(calendarDay(new Date("2026-03-15T00:00:00Z")), "2026-03-15");
  // Shanghai has reached Oct 16 even though UTC is still Oct 15.
  assert.equal(parseEmploymentSettings({ confirmationDate: "2026-10-16" }, trial, new Date("2026-10-15T16:00:00Z")).status, "ACTIVE");
});
