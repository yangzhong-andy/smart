const jwt = require("jsonwebtoken");

const ranges = [
  ["2026-07-01", "2026-07-07"],
  ["2026-07-08", "2026-07-14"],
  ["2026-07-15", "2026-07-21"],
  ["2026-07-22", "2026-07-28"],
  ["2026-07-29", "2026-07-31"],
  ["2026-08-01", "2026-08-07"],
  ["2026-08-08", "2026-08-14"],
  ["2026-08-15", "2026-08-21"],
  ["2026-08-22", "2026-08-28"],
  ["2026-08-29", "2026-08-31"],
  ["2026-09-01", "2026-09-01"],
];

async function reconcile(token, startDate, endDate) {
  const response = await fetch("http://127.0.0.1:3001/api/warehouse-funds/reconcile", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ platform: "SHOPEE", startDate, endDate }),
  });
  const result = await response.json();
  console.log(JSON.stringify({ startDate, endDate, status: response.status, ...result }));
  if (!response.ok || result.errors > 0) {
    throw new Error(`${startDate}..${endDate} Shopee ledger reconciliation failed`);
  }
  return result;
}

async function main() {
  const userId = process.env.VERIFY_USER_ID;
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!userId || !secret) throw new Error("Missing verification credentials");
  const token = jwt.sign({ userId }, secret, { algorithm: "HS256", expiresIn: 1800 });
  const total = { orders: 0, deducted: 0, duplicate: 0, reversed: 0, skipped: 0, errors: 0 };
  for (const [startDate, endDate] of ranges) {
    const result = await reconcile(token, startDate, endDate);
    for (const key of Object.keys(total)) total[key] += Number(result[key] || 0);
  }
  const idempotency = await reconcile(token, "2026-09-01", "2026-09-01");
  console.log(JSON.stringify({ total, idempotency }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
