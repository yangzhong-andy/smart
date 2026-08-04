import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/apps
 * 获取所有 App 配置
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const apps = await prisma.tikTokAppConfig.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        appKey: true,
        appName: true,
        remark: true,
        status: true,
        createdAt: true,
        // 不返回 appSecret（安全）
      },
    });

    // 查每个 App 关联了多少店铺
    const appsWithShops = await Promise.all(
      apps.map(async (app) => {
        const shopCount = await prisma.tikTokShopSetting.count({
          where: { appKey: app.appKey, status: "active" },
        });
        return { ...app, shopCount };
      })
    );

    return NextResponse.json({ apps: appsWithShops });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/tiktok/apps
 * 添加新的 App 配置
 * Body: { appKey, appSecret, appName?, remark? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const { appKey, appSecret, appName, remark } = body;

    if (!appKey || !appSecret) {
      return NextResponse.json({ error: "缺少 appKey 或 appSecret" }, { status: 400 });
    }

    // 检查是否已存在
    const existing = await prisma.tikTokAppConfig.findUnique({ where: { appKey } });
    if (existing) {
      return NextResponse.json({ error: `App Key ${appKey} 已存在` }, { status: 400 });
    }

    const app = await prisma.tikTokAppConfig.create({
      data: { appKey, appSecret, appName: appName || null, remark: remark || null },
    });

    console.log("[TikTok] 新增 App 配置:", appKey, appName);
    return NextResponse.json({ success: true, id: app.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/tiktok/apps?id=xxx
 * 删除 App 配置
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

    // 检查是否有店铺在用
    const app = await prisma.tikTokAppConfig.findUnique({ where: { id } });
    if (app) {
      const shopCount = await prisma.tikTokShopSetting.count({
        where: { appKey: app.appKey, status: "active" },
      });
      if (shopCount > 0) {
        return NextResponse.json({ error: `有 ${shopCount} 个店铺正在使用此 App，请先断开` }, { status: 400 });
      }
    }

    await prisma.tikTokAppConfig.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
