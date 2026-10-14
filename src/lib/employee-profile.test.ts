import assert from "node:assert/strict";
import test from "node:test";
import { initialSalarySettings, parseSalarySettings, personnelSettings, hasSalarySettings, employeeStatusLabel } from "./employee-profile";

const salary = { baseSalary: 3000, positionSalary: 0, fullAttendanceBonus: 0,
  pensionInsurance: 0, unemploymentInsurance: 0, medicalInsurance: 0, restDays: 0 };

test("onboarding does not invent salary or carry payroll/bank fields into personnel updates", () => {
  const input = { name: " 小林 ", employeeNumber: "10001", department: "采购部", position: "采购",
    joinDate: "2026-10-14", status: "在职", phone: "", leaveDate: "", baseSalary: 9999,
    bankAccount: "private", actualAttendDays: 24, outFlowId: "flow" };
  const personnel = personnelSettings(input);
  assert.equal(personnel.name, "小林");
  assert.equal(personnel.phone, ""); // Explicit clearing must not silently preserve an old value.
  for (const field of ["baseSalary", "bankAccount", "actualAttendDays", "outFlowId"]) assert.equal(field in personnel, false);
  const initial = initialSalarySettings(personnel);
  assert.equal(initial.baseSalary, null);
  assert.equal(initial.fullAttendanceBonus, null);
  assert.equal(initial.medicalInsurance, null);
  assert.equal(hasSalarySettings({ ...initial, restDays: 7 }), false);
});

test("salary settings accept explicit zero, round money, and exclude employee/payroll fields", () => {
  const parsed = parseSalarySettings({ ...salary, baseSalary: "3000.126", bankAccount: " 123 ", bankName: "", name: "不应修改", netSalary: 9999 });
  assert.deepEqual(parsed, { ...salary, baseSalary: 3000.13, bankAccount: "123", bankName: null });
  assert.equal(hasSalarySettings(parsed), true);
  assert.equal(hasSalarySettings({ ...salary, baseSalary: 0 }), true);
  assert.deepEqual(parseSalarySettings({ name: "仅修改姓名" }), {});
});

test("missing or invalid salary is not treated as zero or silently defaulted", () => {
  for (const raw of [null, "", " ", "abc", true, [], -1, Infinity, NaN]) {
    assert.throws(() => parseSalarySettings({ baseSalary: raw }));
  }
  for (const restDays of [-1, 1.5, 32]) assert.throws(() => parseSalarySettings({ restDays }));
  assert.equal(hasSalarySettings({ ...salary, baseSalary: undefined }), false);
  assert.equal(hasSalarySettings({ ...salary, baseSalary: null }), false);
  assert.equal(hasSalarySettings({ ...salary, medicalInsurance: NaN }), false);
});

test("employment statuses from API render correctly in personnel forms", () => {
  assert.equal(employeeStatusLabel("ACTIVE"), "在职");
  assert.equal(employeeStatusLabel("PROBATION"), "试用期");
  assert.equal(employeeStatusLabel("INACTIVE"), "离职");
  assert.equal(employeeStatusLabel("在职"), "在职");
});
