import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/me/preferences
 * 获取当前用户的偏好设置
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { preferences: true },
    });

    return NextResponse.json({
      success: true,
      preferences: userRecord?.preferences || {},
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "获取偏好设置失败" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/me/preferences
 * 更新当前用户的偏好设置（局部合并）
 * body: { accounts: { statsCardsVisible: {...}, hiddenCurrencies: [...] } }
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();

    // 先读取现有 preferences，再深层合并
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { preferences: true },
    });

    const existing = (userRecord?.preferences as Record<string, any>) || {};
    // 按模块合并（如 accounts 模块整体替换）
    const merged = { ...existing };
    for (const [key, value] of Object.entries(body)) {
      merged[key] = value;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { preferences: merged as any },
    });

    return NextResponse.json({
      success: true,
      preferences: merged,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "保存偏好设置失败" },
      { status: 500 }
    );
  }
}
