import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { normalizeAccountLayout, validateAccountLayoutPatch } from "@/lib/account-groups";

export const dynamic = "force-dynamic";

const CONFIG_ID = "default";
const EDIT_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGER"];

function canEdit(role: string) {
  return EDIT_ROLES.includes(role);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const record = await prisma.accountGroupConfig.findUnique({ where: { id: CONFIG_ID } });
    const state = normalizeAccountLayout(record);
    return NextResponse.json({ success: true, state, exists: Boolean(record), canEdit: canEdit(auth.user.role) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "读取账户分组失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: EDIT_ROLES });
  if (auth.response) return auth.response;
  try {
    const body = await request.json().catch(() => null);
    const validationError = validateAccountLayoutPatch(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const existing = await prisma.accountGroupConfig.findUnique({ where: { id: CONFIG_ID } });
    const current = normalizeAccountLayout(existing);
    const next = normalizeAccountLayout({
      groups: body && Object.prototype.hasOwnProperty.call(body, "groups") ? body.groups : current.groups,
      assignments: body && Object.prototype.hasOwnProperty.call(body, "assignments") ? body.assignments : current.assignments,
      accountOrder: body && Object.prototype.hasOwnProperty.call(body, "accountOrder") ? body.accountOrder : current.accountOrder,
    });
    const saved = await prisma.accountGroupConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        groups: next.groups,
        assignments: next.assignments,
        accountOrder: next.accountOrder,
        updatedById: auth.user.id,
        updatedByName: auth.user.name,
      },
      update: {
        groups: next.groups,
        assignments: next.assignments,
        accountOrder: next.accountOrder,
        updatedById: auth.user.id,
        updatedByName: auth.user.name,
      },
    });
    return NextResponse.json({ success: true, state: normalizeAccountLayout(saved), canEdit: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "保存账户分组失败" }, { status: 500 });
  }
}
