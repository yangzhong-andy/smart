import { prisma } from "../src/lib/prisma";
import { SHOPEE_OFFICIAL_AD_TOPUP_SOURCE, syncShopeeOfficialWalletBusinessFlows } from "../src/lib/shopee-wallet-business-sync";

async function main() {
  const sync = await syncShopeeOfficialWalletBusinessFlows();
  const [advertisingTopups, officialWithdrawals] = await Promise.all([
    prisma.shopeeWalletEntry.aggregate({
      where: { sourceType: SHOPEE_OFFICIAL_AD_TOPUP_SOURCE },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.shopeeWalletWithdrawal.findMany({
      where: { officialTransactionId: { not: null } },
      select: {
        id: true,
        amount: true,
        currency: true,
        payoutReference: true,
        officialTransactionId: true,
        officialWithdrawalId: true,
        platformCompletedAt: true,
        cashFlowId: true,
        status: true,
      },
      orderBy: { requestedAt: "asc" },
    }),
  ]);
  console.log(JSON.stringify({
    sync,
    advertisingTopups: {
      count: advertisingTopups._count.id,
      amount: Number(advertisingTopups._sum.amount || 0),
    },
    officialWithdrawals: officialWithdrawals.map((item) => ({
      ...item,
      amount: Number(item.amount),
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
