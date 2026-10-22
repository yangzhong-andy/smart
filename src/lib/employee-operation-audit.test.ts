import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { withEmployeeOperationAudit, type EmployeeAuditEntry } from "./employee-operation-audit";

const actor = {
  id: "user-1", name: "测试员工", email: "staff@example.com", role: "USER",
  departmentId: "dep-1", departmentName: "运营部", departmentCode: "OPS",
};

test("authenticated write audit records action, route target and status without reading the body", async () => {
  const entries: EmployeeAuditEntry[] = [];
  const handler = withEmployeeOperationAudit(
    async (request: NextRequest, context: { params: { id: string } }) => {
      assert.equal(context.params.id, "expense-123");
      assert.deepEqual(await request.json(), { password: "never-store", amount: 99 });
      return NextResponse.json({ ok: true });
    },
    "expenseRequests", "PUT", "修改支出申请",
    { resolveActor: async () => actor, writeAudit: async (entry) => { entries.push(entry); } },
  );
  const response = await handler(new NextRequest("http://localhost/api/expense-requests/expense-123?token=secret", {
    method: "PUT", body: JSON.stringify({ password: "never-store", amount: 99 }),
  }), { params: { id: "expense-123" } });
  assert.equal(response.status, 200);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].user.id, "user-1");
  assert.equal(entries[0].action, "修改支出申请");
  assert.equal(entries[0].targetId, "expense-123");
  assert.equal(entries[0].path, "/api/expense-requests/expense-123");
  assert.equal(entries[0].httpStatus, 200);
  assert.equal(JSON.stringify(entries[0]).includes("never-store"), false);
  assert.equal(JSON.stringify(entries[0]).includes("99"), false);
  assert.equal(JSON.stringify(entries[0]).includes("secret"), false);
});

test("rejected writes remain visible and unauthenticated calls create no employee log", async () => {
  const entries: EmployeeAuditEntry[] = [];
  const adapters = { resolveActor: async () => actor, writeAudit: async (entry: EmployeeAuditEntry) => { entries.push(entry); } };
  const rejected = withEmployeeOperationAudit(async (_request: NextRequest) => NextResponse.json({ error: "invalid" }, { status: 400 }), "payroll", "POST", undefined, adapters);
  assert.equal((await rejected(new NextRequest("http://localhost/api/payroll", { method: "POST" }))).status, 400);
  assert.equal(entries[0].httpStatus, 400);
  const unauthenticated = withEmployeeOperationAudit(async (_request: NextRequest) => NextResponse.json({ error: "unauthorized" }, { status: 401 }), "payroll", "POST", undefined, {
    resolveActor: async () => null, writeAudit: adapters.writeAudit,
  });
  assert.equal((await unauthenticated(new NextRequest("http://localhost/api/payroll", { method: "POST" }))).status, 401);
  assert.equal(entries.length, 1);
});
