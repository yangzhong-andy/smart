import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getQianchuanConfigurationStatus } from "@/lib/qianchuan-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  const config = getQianchuanConfigurationStatus();
  const [connectionCount, enabledCount, dailyRows, latest] = await Promise.all([
    prisma.qianchuanConnection.count(),
    prisma.qianchuanConnection.count({ where: { enabled: true } }),
    prisma.qianchuanDailyMetric.count(),
    prisma.qianchuanConnection.findFirst({
      where: { lastSyncAt: { not: null } },
      orderBy: { lastSyncAt: "desc" },
      select: { lastSyncAt: true, lastSyncError: true },
    }),
  ]);
  let serviceHost: string | null = null;
  if (config.baseUrlValid && config.baseUrl) {
    try { serviceHost = new URL(config.baseUrl).host; } catch { serviceHost = null; }
  }
  return NextResponse.json({
    configured: config.configured,
    baseUrlConfigured: config.baseUrlConfigured,
    baseUrlValid: config.baseUrlValid,
    tokenConfigured: config.tokenConfigured,
    serviceHost,
    connectionCount,
    enabledCount,
    dailyRows,
    lastSyncAt: latest?.lastSyncAt?.toISOString() || null,
    lastSyncError: latest?.lastSyncError || null,
  });
}
