const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");

async function main() {
  const port = Number(process.env.VERIFY_PORT);
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!port || !secret) throw new Error("VERIFY_PORT and an auth secret are required");
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true } });
    if (!user) throw new Error("No active verification user exists");
    const token = jwt.sign({ id: user.id, userId: user.id }, secret, { expiresIn: "5m" });
    const response = await fetch(
      `http://127.0.0.1:${port}/api/shopee/profit?startDate=2026-08-20&endDate=2026-08-30&groupBy=day&page=1&pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120_000) },
    );
    const body = await response.json();
    if (!response.ok) throw new Error(`profit endpoint ${response.status}: ${body.error || "unknown error"}`);
    const analyticsResponse = await fetch(
      `http://127.0.0.1:${port}/api/shopee/analytics?startDate=2026-08-20&endDate=2026-08-30`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120_000) },
    );
    const analytics = await analyticsResponse.json();
    if (!analyticsResponse.ok && (body.shops?.length || 0) > 0) {
      throw new Error(`analytics endpoint ${analyticsResponse.status}: ${analytics.error || "unknown error"}`);
    }
    console.log(JSON.stringify({
      port,
      shops: body.shops?.length || 0,
      orders: body.summary?.orders || 0,
      units: body.summary?.units || 0,
      advertisingCny: body.summary?.advertisingCny || 0,
      firstMileLogisticsCny: body.summary?.firstMileLogisticsCny || 0,
      advertisingOriginal: analytics.totals?.adExpense || 0,
      analyticsOrders: analytics.totals?.orders || 0,
      advertisingCoverage: body.coverage?.advertising || 0,
      firstMileCoverage: body.coverage?.firstMile || 0,
      adSource: body.advertising?.source || null,
      firstMileSource: body.firstMile?.source || null,
      warnings: body.warnings || [],
    }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
