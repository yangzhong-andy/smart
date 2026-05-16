import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import {
  normalizeRuleConfigForSave,
  parseDepartmentAccessRuleConfig,
  type DepartmentAccessRuleConfig,
} from "@/lib/department-access-config";

export const dynamic = "force-dynamic";

function requireSuperAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }
  return null;
}

/** GET：列出所有已配置的部门规则（含部门信息） */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    const rows = await prisma.departmentAccessRule.findMany({
      include: {
        department: { select: { id: true, name: true, code: true, isActive: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      data: rows.map((r) => ({
        id: r.id,
        departmentId: r.departmentId,
        config: parseDepartmentAccessRuleConfig(r.config) ?? {},
        updatedAt: r.updatedAt.toISOString(),
        department: r.department,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT：按部门 upsert 规则 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    const body = await request.json();
    const departmentId = typeof body.departmentId === "string" ? body.departmentId.trim() : "";
    if (!departmentId) {
      return NextResponse.json({ error: "缺少 departmentId" }, { status: 400 });
    }

    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) {
      return NextResponse.json({ error: "部门不存在" }, { status: 400 });
    }

    const rawConfig = body.config as DepartmentAccessRuleConfig | undefined;
    if (!rawConfig || typeof rawConfig !== "object") {
      return NextResponse.json({ error: "缺少 config" }, { status: 400 });
    }

    const config = normalizeRuleConfigForSave(rawConfig);

    if (config.menuMode === "whitelist" && (!config.menuLabels || config.menuLabels.length === 0)) {
      return NextResponse.json(
        { error: "一级菜单为「白名单」时，请至少勾选一个菜单" },
        { status: 400 }
      );
    }
    if (config.pathMode === "whitelist" && (!config.pathPrefixes || config.pathPrefixes.length === 0)) {
      return NextResponse.json(
        { error: "路径为「白名单」时，请至少填写一个允许访问的路径前缀" },
        { status: 400 }
      );
    }

    const row = await prisma.departmentAccessRule.upsert({
      where: { departmentId },
      create: { departmentId, config: config as object },
      update: { config: config as object },
      include: {
        department: { select: { id: true, name: true, code: true, isActive: true } },
      },
    });

    return NextResponse.json({
      id: row.id,
      departmentId: row.departmentId,
      config: parseDepartmentAccessRuleConfig(row.config),
      updatedAt: row.updatedAt.toISOString(),
      department: row.department,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE：删除某部门的自定义规则（恢复为代码内默认逻辑） */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireSuperAdmin(session);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const departmentId = (searchParams.get("departmentId") || "").trim();
    if (!departmentId) {
      return NextResponse.json({ error: "缺少 departmentId" }, { status: 400 });
    }

    await prisma.departmentAccessRule.deleteMany({ where: { departmentId } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "删除失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
