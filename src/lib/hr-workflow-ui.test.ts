import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function dialogMarkup(section: "personnel" | "salary") {
  const source = readFileSync(resolve(process.cwd(), "src/app/hr/employees/components/EmployeeFormDialog.tsx"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports: any = {};
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx, "lucide-react": { X: () => null },
    "@/components/ui": { ActionButton: ({ children, isLoading, variant, ...props }: any) => createElement("button", props, children) },
  };
  runInNewContext(code, { exports, require: (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected UI dependency: ${id}`);
    return dependencies[id];
  } });
  const form = { name: "测试员工", department: "采购部", position: "采购", employeeNumber: "10001", joinDate: "2026-10-14",
    leaveDate: "", status: "在职", phone: "", email: "", notes: "", baseSalary: "", positionSalary: "0",
    fullAttendanceBonus: "0", pensionInsurance: "0", unemploymentInsurance: "0", medicalInsurance: "0",
    bankAccount: "", bankName: "", idNumber: "", restDays: "7" };
  return renderToStaticMarkup(createElement(exports.EmployeeFormDialog, {
    isOpen: true, section, editingEmployee: section === "salary" ? { name: form.name } : null,
    form, setForm: () => {}, onClose: () => {}, departments: ["采购部"], isSubmitting: false, onSubmit: () => {},
  }));
}

test("onboarding dialog contains personnel fields but no required salary or bank inputs", () => {
  const html = dialogMarkup("personnel");
  assert.match(html, /办理员工入职/);
  assert.match(html, /入职日期/);
  assert.match(html, /确认入职/);
  assert.match(html, /type="email"/);
  assert.doesNotMatch(html, /基础薪资|岗位薪资|银行卡号|月休息天数/);
});

test("salary dialog contains only salary/recipient settings and explains no historical changes", () => {
  const html = dialogMarkup("salary");
  assert.match(html, /测试员工 · 薪资设置/);
  assert.match(html, /基础薪资/);
  assert.match(html, /银行卡号/);
  assert.match(html, /保存薪资设置/);
  assert.match(html, /不修改已生成的工资单/);
  assert.doesNotMatch(html, /入职日期|离职日期|type="email"|确认入职/);
});
