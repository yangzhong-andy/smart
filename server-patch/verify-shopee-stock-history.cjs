const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");

async function main() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("Auth secret is unavailable");
  const prisma = new PrismaClient();
  try {
    const [activation, deductionAggregate, deductionOrders, stockLogAggregate, negativeStocks, user] = await Promise.all([
      prisma.platformStockActivation.findUnique({
        where: { platform_shopId: { platform: "SHOPEE", shopId: "1842551792" } },
      }),
      prisma.platformStockDeduction.aggregate({
        where: { platform: "SHOPEE", status: "deducted" },
        _count: true,
        _sum: { qty: true },
      }),
      prisma.platformStockDeduction.findMany({
        where: { platform: "SHOPEE", status: "deducted" },
        distinct: ["orderId"],
        select: { orderId: true },
      }),
      prisma.stockLog.aggregate({
        where: { relatedOrderType: "SHOPEE_ORDER" },
        _count: true,
        _sum: { qty: true },
      }),
      prisma.stock.count({ where: { OR: [{ qty: { lt: 0 } }, { availableQty: { lt: 0 } }] } }),
      prisma.user.findFirst({ where: { isActive: true }, select: { id: true } }),
    ]);
    if (!user) throw new Error("No active verification user exists");
    const token = jwt.sign({ userId: user.id }, secret, { algorithm: "HS256", expiresIn: 300 });
    const response = await fetch("http://127.0.0.1:3001/api/inventory/platform-outbound", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json();
    const shopee = body.platforms?.find((row) => row.platform === "SHOPEE");
    const result = {
      activationEnabled: activation?.enabled || false,
      activeFrom: activation?.activeFrom?.toISOString() || null,
      deductionRows: deductionAggregate._count,
      deductionOrders: deductionOrders.length,
      deductedUnits: deductionAggregate._sum.qty || 0,
      stockLogRows: stockLogAggregate._count,
      stockLogUnits: Math.abs(stockLogAggregate._sum.qty || 0),
      negativeStocks,
      apiStatus: response.status,
      apiShopee: shopee || null,
    };
    console.log(JSON.stringify(result));
    if (
      !activation?.enabled
      || deductionAggregate._count !== 917
      || deductionOrders.length !== 916
      || deductionAggregate._sum.qty !== 1238
      || stockLogAggregate._count !== 917
      || stockLogAggregate._sum.qty !== -1238
      || negativeStocks !== 0
      || !response.ok
      || shopee?.salesUnits !== 1238
      || shopee?.orderCount !== 916
    ) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
