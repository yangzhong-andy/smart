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

    if (session.user.role === "SUPER_ADMIN" || session.user.role === "ADMIN") {
      return NextResponse.json({ bypass: true, config: null });
    }

    const departmentId = session.user.departmentId;
    if (!departmentId) {
      return NextResponse.json({ bypass: false, config: null });
    }

    try {
      const row = await prisma.departmentAccessRule.findUnique({
        where: { departmentId },
      });
      const config = row ? parseDepartmentAccessRuleConfig(row.config) : null;
      return NextResponse.json({ bypass: false, config });
    } catch (dbErr: unknown) {
      const code =
        dbErr && typeof dbErr === "object" && "code" in dbErr
          ? String((dbErr as { code?: string }).code)
          : "";
      // 迁移未执行时勿 500，否则前端误以为需限制访问
      if (code === "P2021") {
        return NextResponse.json({ bypass: false, config: null });
      }
      throw dbErr;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
