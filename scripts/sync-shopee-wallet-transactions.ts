import { prisma } from "../src/lib/prisma";
import { syncShopeeOfficialWalletTransactions } from "../src/lib/shopee-wallet-transaction-sync";

async function main() {
  const days = Number(process.argv.find((arg) => arg.startsWith("--days="))?.split("=")[1] || 7);
  const shopId = process.argv.find((arg) => arg.startsWith("--shop="))?.split("=")[1];
  const result = await syncShopeeOfficialWalletTransactions({ days, shopId });
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
