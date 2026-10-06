const jwt = require("jsonwebtoken");

async function main() {
  const userId = process.env.VERIFY_USER_ID;
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!userId || !secret) throw new Error("Missing verification credentials");
  const token = jwt.sign({ userId }, secret, { algorithm: "HS256", expiresIn: 300 });
  const response = await fetch("http://127.0.0.1:3001/api/shopee/profit?startDate=2026-09-01&endDate=2026-09-01&groupBy=day&page=1&pageSize=100", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  console.log(JSON.stringify({
    status: response.status,
    summary: result.summary,
    coverage: result.coverage,
    rows: Array.isArray(result.rows) ? result.rows.length : null,
    warehouseRows: Array.isArray(result.rows) ? result.rows.slice(0, 5).map((row) => ({
      orderId: row.orderId,
      status: row.status,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      warehouseStatus: row.warehouseStatus,
      warehouseFeeBreakdown: row.warehouseFeeBreakdown,
    })) : [],
    error: result.error,
  }, null, 2));
  if (!response.ok) process.exitCode = 1;

  const ledgerResponse = await fetch("http://127.0.0.1:3001/api/warehouse-funds?platform=SHOPEE&page=1&pageSize=3", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ledger = await ledgerResponse.json();
  console.log(JSON.stringify({
    ledgerStatus: ledgerResponse.status,
    pagination: ledger.pagination,
    entries: Array.isArray(ledger.entries) ? ledger.entries.map((entry) => ({
      platform: entry.platform,
      shopId: entry.shopId,
      shopName: entry.shopName,
      countryCode: entry.countryCode,
      warehouseName: entry.warehouseName,
      orderId: entry.orderId,
      amount: entry.amount,
      billedUnits: entry.details?.billedUnits,
    })) : [],
    error: ledger.error,
  }, null, 2));
  if (!ledgerResponse.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
