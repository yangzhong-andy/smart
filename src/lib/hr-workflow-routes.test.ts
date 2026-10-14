import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import * as profile from "./employee-profile";

// All persistence/auth/cache adapters are isolated. No database or external cache is contacted.
function loadRoute(file: string, prisma: unknown, extra: Record<string, unknown> = {}) {
  const source = readFileSync(resolve(process.cwd(), "src/app/api", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  const cleared: string[] = [];
  const dependencies: Record<string, unknown> = {
    "next/server": { NextRequest, NextResponse },
    "@/lib/prisma": { prisma }, "@prisma/client": {},
    "@/lib/employee-profile": profile,
    "@/lib/redis": { clearCacheByPrefix: async (prefix: string) => { cleared.push(prefix); } },
    "@/lib/api-auth": { requireApiUser: async () => ({ user: { id: "admin" }, response: null }) },
    "next-auth": { getServerSession: async () => ({ user: { role: "ADMIN" } }) },
    "@/lib/auth-options": { authOptions: {} }, ...extra,
  };
  runInNewContext(code, { exports, Date, URL, Set, console, require: (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  } });
  return { ...exports, cleared };
}
const request = (path: string, body: unknown, method = "POST") => new NextRequest(`http://localhost/api/${path}`, { method, body: JSON.stringify(body) });
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const stamp = new Date("2026-10-01T00:00:00Z");
const employee = { id: "emp", name: "员工", department: "采购部", position: "采购", status: "ACTIVE", joinDate: stamp,
  createdAt: stamp, updatedAt: stamp, baseSalary: 3000, positionSalary: 0, fullAttendanceBonus: 0,
  pensionInsurance: 0, unemploymentInsurance: 0, medicalInsurance: 0, restDays: 0 };

test("onboarding creates personnel only, stores unconfigured salary as null, and never posts payroll", async () => {
  let created: any;
  const route = loadRoute("employees/route.ts", { employee: { create: async ({ data }: any) => {
    created = data; return { ...employee, ...data };
  } } });
  const response = await route.POST(request("employees", { name: "新员工", department: "采购部", position: "采购", joinDate: "2026-10-14", status: "试用期" }));
  assert.equal(response.status, 200);
  assert.equal(created.status, "PROBATION");
  for (const field of profile.SALARY_MONEY_FIELDS) assert.equal(created[field], null);
  assert.deepEqual(route.cleared, ["employees"]);
});

test("onboarding requires allowed role and rejects invalid salary before persistence", async () => {
  const denied = loadRoute("employees/route.ts", {}, {
    "@/lib/api-auth": { requireApiUser: async () => ({ response: NextResponse.json({}, { status: 403 }) }) },
  });
  assert.equal((await denied.POST(request("employees", {}))).status, 403);
  const route = loadRoute("employees/route.ts", {});
  assert.equal((await route.POST(request("employees", { baseSalary: "" }))).status, 400);
});

test("personnel editing and salary editing update disjoint fields and invalidate employee cache", async () => {
  const writes: any[] = [];
  const route = loadRoute("employees/[id]/route.ts", { employee: { update: async ({ data }: any) => {
    writes.push(plain(data)); return { ...employee, ...data };
  } } });
  const personnel = profile.personnelSettings({ ...employee, name: "更新姓名", joinDate: "2026-10-01", status: "在职" });
  assert.equal((await route.PUT(request("employees/emp", personnel, "PUT"), { params: { id: "emp" } })).status, 200);
  assert.equal(writes[0].name, "更新姓名");
  assert.equal("baseSalary" in writes[0], false);
  assert.equal("bankAccount" in writes[0], false);
  const salary = profile.parseSalarySettings({ ...employee, baseSalary: 0, bankAccount: "123", bankName: "银行" });
  assert.equal((await route.PUT(request("employees/emp", salary, "PUT"), { params: { id: "emp" } })).status, 200);
  assert.equal(writes[1].baseSalary, 0);
  assert.equal(writes[1].restDays, 0);
  assert.equal("name" in writes[1], false);
  assert.equal("status" in writes[1], false);
  assert.deepEqual(route.cleared, ["employees", "employees"]);
});

test("payroll generation skips unconfigured staff, preserves existing wages and honors zero settings", async () => {
  const writes: any[] = [];
  const route = loadRoute("payroll/generate/route.ts", {
    employee: { findMany: async () => [employee, { ...employee, id: "new", name: "薪资未设置", baseSalary: null }, { ...employee, id: "existing" },
      { ...employee, id: "future", joinDate: new Date("2026-11-01") }, { ...employee, id: "left", leaveDate: new Date("2026-09-30") }] },
    payroll: { findMany: async () => [{ employeeId: "existing" }], create: async ({ data }: any) => {
      writes.push(plain(data)); return { id: "payroll", ...data };
    } }, commissionRecord: { findMany: async () => [] },
  });
  const response = await route.POST(request("payroll/generate", { month: "2026-10" }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 3);
  assert.equal(result.missingSalary[0].employeeId, "new");
  assert.equal(writes[0].restDays, 0);
  assert.equal(writes[0].fullAttendance, 0);
  assert.equal(writes[0].payableDays, 31);
  assert.equal(writes[0].netSalary, 3000);
  assert.equal(writes[0].status, "Draft");
  assert.deepEqual(route.cleared, ["payroll"]);
});

test("invalid month fails before querying staff; invalid rest days cannot create a default wage", async () => {
  const empty = loadRoute("payroll/generate/route.ts", {});
  for (const month of [null, "2026-13", "2026-00", {}, "bad", "0000-01"]) {
    assert.equal((await empty.POST(request("payroll/generate", { month }))).status, 400);
  }
  const route = loadRoute("payroll/generate/route.ts", {
    employee: { findMany: async () => [{ ...employee, restDays: 31 }] },
    payroll: { findMany: async () => [] }, commissionRecord: { findMany: async () => [] },
  });
  const response = await route.POST(request("payroll/generate", { month: "2026-10" }));
  const body = await response.json();
  assert.equal(body.created, 0);
  assert.match(body.missingSalary[0].reason, /休息天数/);
});
