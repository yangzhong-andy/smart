const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");

async function main() {
  const orderSn = process.argv[2];
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!orderSn || !secret) throw new Error("Order number and auth secret are required");

  const prisma = new PrismaClient();
  try {
    const order = await prisma.shopeeOrder.findFirst({
      where: { orderSn },
      include: { settlement: true },
    });
    if (!order) throw new Error(`Order ${orderSn} was not found`);

    const raw = order.settlement?.rawData || {};
    const buyerPayment = raw.buyer_payment_info || {};
    const income = raw.order_income || {};
    const productPrice = Number(buyerPayment.merchant_subtotal ?? income.order_selling_price ?? 0);
    const shopeeVoucher = Math.abs(Number(buyerPayment.shopee_voucher ?? income.voucher_from_shopee ?? 0));

    const user = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true } });
    if (!user) throw new Error("No active verification user exists");
    const token = jwt.sign({ userId: user.id }, secret, { algorithm: "HS256", expiresIn: 300 });
    const start = new Date(order.createTime);
    start.setUTCDate(start.getUTCDate() - 1);
    const end = new Date(order.createTime);
    end.setUTCDate(end.getUTCDate() + 1);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const response = await fetch(
      `http://127.0.0.1:3001/api/shopee/profit?startDate=${startDate}&endDate=${endDate}&keyword=${encodeURIComponent(orderSn)}&page=1&pageSize=25`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120_000) },
    );
    const body = await response.json();
    const row = Array.isArray(body.rows) ? body.rows.find((item) => item.orderId === orderSn) : null;
    const missingEligibleLast30Days = await prisma.shopeeOrder.count({
      where: {
        status: { in: ["READY_TO_SHIP", "PROCESSED", "SHIPPED", "TO_CONFIRM_RECEIVE", "COMPLETED"] },
        createTime: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        settlement: null,
      },
    });
    console.log(JSON.stringify({
      orderSn,
      status: order.status,
      settlementSaved: Boolean(order.settlement),
      productPrice,
      shopeeVoucher,
      expectedGmv: Math.round((productPrice - shopeeVoucher) * 100) / 100,
      apiStatus: response.status,
      apiGmv: row?.gmvOriginal ?? null,
      apiGmvSource: row?.gmvSource ?? null,
      missingEligibleLast30Days,
      error: body.error || null,
    }));
    if (!response.ok || !row || row.gmvOriginal !== Math.round((productPrice - shopeeVoucher) * 100) / 100 || missingEligibleLast30Days !== 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
