import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { parseDepartmentAccessRuleConfig } from "@/lib/department-access-config";

export const dynamic = "force-dynamic";

/**
 * GET：当前登录用户所属部门的访问规则（供侧栏与路由守卫使用）。
 * SUPER_ADMIN 返回 bypass，不应用部门限制。
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    if (session.user.role === "SUPER_ADMIN") {
      return NextResponse.json({ bypass: true, config: null });
    }

    const departmentId = session.user.departmentId;
    if (!departmentId) {
      return NextResponse.json({ bypass: false, config: null });
    }

    const row = await prisma.departmentAccessRule.findUnique({
      where: { departmentId },
    });

    const config = row ? parseDepartmentAccessRuleConfig(row.config) : null;
    return NextResponse.json({ bypass: false, config });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
