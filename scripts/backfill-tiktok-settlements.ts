import { config as loadEnv } from "dotenv";

function argument(name: string, fallback?: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const envFile = argument("--env-file", process.env.ENV_FILE || ".env.local");
  if (envFile) loadEnv({ path: envFile });
  loadEnv();

  const shopId = argument("--shop-id");
  if (!shopId) throw new Error("缺少 --shop-id");
  const batchSize = Math.max(1, Math.min(100, Number(argument("--batch-size", "20")) || 20));
  const refreshDays = Math.max(1, Math.min(366, Number(argument("--refresh-days", "45")) || 45));
  const { prisma } = await import("../src/lib/prisma");
  const {
    refreshTikTokStatementsForShop,
    syncTikTokProfitFinancials,
  } = await import("../src/lib/tiktok-profit-financial-sync");

  const refreshed = await refreshTikTokStatementsForShop(shopId, refreshDays);
  console.log(`[settlement-backfill] refreshed statements: ${refreshed.saved}`);

  let batch = 0;
  while (true) {
    batch += 1;
    const result = await syncTikTokProfitFinancials(shopId, {
      allStatements: true,
      maxStatements: batchSize,
      includeUnsettled: false,
    });
    console.log(JSON.stringify({ batch, ...result }));
    if (result.pendingStatements === 0) break;
    if (result.processedStatements === 0) throw new Error("仍有待同步结算单，但本批未处理任何数据");
  }

  const retry = await syncTikTokProfitFinancials(shopId, {
    allStatements: true,
    maxStatements: batchSize,
    retryFailed: true,
    includeUnsettled: false,
  });
  console.log(JSON.stringify({ retry: true, ...retry }));

  const final = await syncTikTokProfitFinancials(shopId, {
    allStatements: true,
    maxStatements: 0,
    includeUnsettled: true,
  });
  console.log(JSON.stringify({ final: true, ...final }));
  await prisma.$disconnect();
  if (final.failedStatements > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
