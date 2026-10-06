#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const [serviceName, deliveryNumber, pickupDate, mode = "dry-run"] = process.argv.slice(2);

if (!serviceName || !deliveryNumber || !/^\d{4}-\d{2}-\d{2}$/.test(pickupDate || "")) {
  console.error(
    "Usage: update-delivery-order-business-date.cjs <pm2-service> <delivery-number> <YYYY-MM-DD> [dry-run|apply|sync]",
  );
  process.exit(2);
}
if (!new Set(["dry-run", "apply", "sync"]).has(mode)) {
  console.error("Mode must be dry-run, apply, or sync");
  process.exit(2);
}

const processes = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8" }));
const processInfo = processes.find((item) => item.name === serviceName);
const databaseUrl = processInfo?.pm2_env?.env?.DATABASE_URL || processInfo?.pm2_env?.DATABASE_URL;
if (!databaseUrl) {
  console.error(`DATABASE_URL not found for PM2 service ${serviceName}`);
  process.exit(3);
}
process.env.DATABASE_URL = databaseUrl;

const { PrismaClient } = require(
  path.join(process.cwd(), "node_modules", "@prisma", "client"),
);
const prisma = new PrismaClient();

const asDateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

async function main() {
  const order = await prisma.deliveryOrder.findUnique({
    where: { deliveryNumber },
    include: {
      contract: {
        select: {
          contractNumber: true,
          supplierId: true,
          supplierName: true,
          tailPeriodDays: true,
        },
      },
      pendingInbound: { select: { id: true, shippedDate: true } },
    },
  });
  if (!order) {
    console.error(`Delivery order not found: ${deliveryNumber}`);
    process.exitCode = 4;
    return;
  }

  const targetPickupDate = new Date(`${pickupDate}T00:00:00.000Z`);
  const targetDueDate = new Date(targetPickupDate);
  targetDueDate.setUTCDate(
    targetDueDate.getUTCDate() + Math.max(0, Math.trunc(order.contract.tailPeriodDays || 0)),
  );
  const currentMonth = asDateOnly(order.tailDueDate)?.slice(0, 7) || null;
  const targetMonth = asDateOnly(targetDueDate).slice(0, 7);

  const relatedBills = order.contract.supplierId
    ? await prisma.monthlyBill.findMany({
        where: {
          supplierId: order.contract.supplierId,
          billType: "工厂订单",
          month: { in: Array.from(new Set([currentMonth, targetMonth].filter(Boolean))) },
        },
        select: {
          id: true,
          month: true,
          status: true,
          totalAmount: true,
          currency: true,
          consumptionIds: true,
        },
        orderBy: [{ month: "asc" }, { createdAt: "asc" }],
      })
    : [];

  const audit = {
    mode,
    serviceName,
    order: {
      id: order.id,
      deliveryNumber: order.deliveryNumber,
      contractNumber: order.contractNumber,
      supplierName: order.contract.supplierName,
      tailPeriodDays: order.contract.tailPeriodDays,
      shippedDate: asDateOnly(order.shippedDate),
      tailDueDate: asDateOnly(order.tailDueDate),
      createdAt: order.createdAt.toISOString(),
      pendingInboundDate: asDateOnly(order.pendingInbound?.shippedDate),
    },
    target: {
      shippedDate: asDateOnly(targetPickupDate),
      tailDueDate: asDateOnly(targetDueDate),
      month: targetMonth,
    },
    relatedBills: relatedBills.map((bill) => ({
      ...bill,
      totalAmount: Number(bill.totalAmount),
      containsOrder: String(bill.consumptionIds || "")
        .split(",")
        .map((value) => value.trim())
        .includes(order.id),
    })),
  };

  if (mode === "dry-run") {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }

  if (mode === "sync") {
    const syncScript = [
      'import("./src/lib/monthly-bill-sync")',
      '.then(async (module) => console.log(JSON.stringify(await module.syncSupplierMonthlyBills())))',
      '.catch((error) => { console.error(error); process.exit(1); })',
    ].join("");
    const syncOutput = execFileSync(
      path.join(process.cwd(), "node_modules", ".bin", "tsx"),
      ["-e", syncScript],
      { encoding: "utf8", env: process.env },
    ).trim();
    console.log(JSON.stringify({ ...audit, syncResult: JSON.parse(syncOutput) }, null, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.deliveryOrder.update({
      where: { id: order.id },
      data: { shippedDate: targetPickupDate, tailDueDate: targetDueDate },
    });
    if (order.pendingInbound?.id) {
      await tx.pendingInbound.update({
        where: { id: order.pendingInbound.id },
        data: { shippedDate: targetPickupDate },
      });
    }
  });

  console.log(JSON.stringify({ ...audit, applied: true }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
