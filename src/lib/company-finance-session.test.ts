import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { canReadCompanyReports } from "./company-reports";

function fixture(user: unknown) {
  const code = ts.transpileModule(readFileSync(resolve("src/app/api/integrations/company-finance/session/route.ts"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  const deps: Record<string, unknown> = {
    "next/server": { NextRequest, NextResponse },
    "@/lib/company-reports": { canReadCompanyReports },
    "@/lib/api-auth": { requireApiUser: async () => user ? { user, response: null } : { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } },
  };
  runInNewContext(code, { exports, require: (id: string) => { assert.ok(deps[id], `Unexpected dependency ${id}`); return deps[id]; } });
  return () => exports.GET(new NextRequest("http://localhost/api/integrations/company-finance/session"));
}

test("finance SSO uses current API user/policy, returns minimal identity and never loads business data", async () => {
  assert.equal((await fixture(null)()).status, 401);
  assert.equal((await fixture({ id: "one", role: "USER" })()).status, 403);
  assert.equal((await fixture({ id: "one", role: "FINANCE", departmentCode: "OPS" })()).status, 403);
  for (const user of [{ id: "one", role: "ADMIN" }, { id: "two", role: "SUPER_ADMIN" }, { id: "three", role: "USER", departmentCode: "FINANCE_CENTER" }]) {
    const response = await fixture(user)();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), { user: { id: `erp:${user.id}`, canReadCompanyReports: true } });
  }
});
