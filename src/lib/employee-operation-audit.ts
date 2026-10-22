import { NextRequest } from "next/server";
import type { ApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const AUDITED_MODULES = {
  employees: "员工档案",
  payroll: "工资管理",
  accounts: "财务账户",
  cashFlow: "收支流水",
  expenseRequests: "支出申请",
  incomeRequests: "收入申请",
  products: "商品资料",
  users: "系统账号",
} as const;

export type AuditedModule = keyof typeof AUDITED_MODULES;
type WriteMethod = "POST" | "PUT" | "PATCH" | "DELETE";
type Handler = (...args: any[]) => Promise<Response>;

const ACTIONS: Record<WriteMethod, string> = {
  POST: "新增/执行",
  PUT: "修改",
  PATCH: "修改/状态变更",
  DELETE: "删除",
};

function targetId(context: unknown): string | null {
  if (!context || typeof context !== "object" || !("params" in context)) return null;
  const params = context.params;
  if (!params || typeof params !== "object") return null;
  for (const key of ["id", "skuId", "productId"]) {
    const value = (params as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value.slice(0, 120);
  }
  return null;
}

export type EmployeeAuditEntry = {
  user: ApiUser;
  module: AuditedModule;
  action: string;
  method: WriteMethod;
  path: string;
  targetId: string | null;
  httpStatus: number;
};

async function saveAudit(args: EmployeeAuditEntry) {
  try {
    await prisma.employeeOperationLog.create({
      data: {
        actorUserId: args.user.id,
        actorName: args.user.name,
        actorEmail: args.user.email,
        actorRole: args.user.role,
        departmentName: args.user.departmentName,
        module: args.module,
        action: args.action,
        method: args.method,
        path: args.path.slice(0, 300),
        targetId: args.targetId,
        status: args.httpStatus >= 500 ? "ERROR" : args.httpStatus >= 400 ? "REJECTED" : "SUCCESS",
        httpStatus: args.httpStatus,
      },
    });
  } catch (error) {
    // An audit outage cannot undo a completed business operation. Never log
    // request/response payloads or credentials while reporting this failure.
    console.error("[employee-operation-audit] write failed", error);
  }
}

/** Wrap selected authenticated write routes, without reading request bodies. */
export function withEmployeeOperationAudit<H extends Handler>(
  handler: H,
  module: AuditedModule,
  method: WriteMethod,
  action = ACTIONS[method],
  adapters?: {
    resolveActor?: (request: NextRequest) => Promise<ApiUser | null>;
    writeAudit?: (entry: EmployeeAuditEntry) => Promise<void>;
  },
): H {
  const wrapped = async (...args: Parameters<H>): Promise<Response> => {
    const request = args[0] as NextRequest;
    let user: ApiUser | null = null;
    try {
      if (adapters?.resolveActor) user = await adapters.resolveActor(request);
      else {
        // Lazy import keeps isolated route unit tests free of a live Next.js
        // server context; production still resolves the active database user.
        const { getApiUser } = await import("@/lib/api-auth");
        user = await getApiUser(request);
      }
    } catch (error) {
      console.error("[employee-operation-audit] actor resolution failed", error);
    }
    const path = new URL(request.url).pathname;
    const audit = async (httpStatus: number) => {
      if (!user) return;
      try {
        await (adapters?.writeAudit || saveAudit)({ user, module, action, method, path, targetId: targetId(args[1]), httpStatus });
      } catch (error) {
        console.error("[employee-operation-audit] write failed", error);
      }
    };
    try {
      const response = await handler(...args);
      await audit(response.status);
      return response;
    } catch (error) {
      await audit(500);
      throw error;
    }
  };
  return wrapped as H;
}
