import { prisma } from "../src/lib/prisma";
import { syncShopeeOfficialWalletBusinessFlows } from "../src/lib/shopee-wallet-business-sync";
import { enableShopeeOfficialBalanceMode } from "../src/lib/shopee-wallet-official-ledger";
import { refreshShopeePendingSettlementBalances } from "../src/lib/shopee-wallet-settlement-sync";

function money(value: unknown) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function main() {
  const business = await syncShopeeOfficialWalletBusinessFlows();
  if (!business.success) {
    throw new Error(`官方业务流水补齐失败：${JSON.stringify(business.errors)}`);
  }

  const wallets = await prisma.shopeeWalletAccount.findMany({
    where: { walletType: "STORE", enabled: true },
    select: {
      id: true,
      name: true,
      balance: true,
      pendingBalance: true,
      officialBalanceMode: true,
      shopSetting: { select: { shopId: true, shopName: true } },
      officialTransactions: {
        where: { status: "COMPLETED", currentBalance: { not: null } },
        select: { transactionId: true, currentBalance: true, occurredAt: true },
        orderBy: [{ occurredAt: "desc" }, { transactionId: "desc" }],
        take: 1,
      },
    },
  });

  const enabled = [];
  const skipped = [];
  for (const wallet of wallets) {
    if (wallet.officialBalanceMode) {
      skipped.push({ shopId: wallet.shopSetting.shopId, reason: "already_enabled" });
      continue;
    }
    const latest = wallet.officialTransactions[0];
    if (!latest?.currentBalance) {
      skipped.push({ shopId: wallet.shopSetting.shopId, reason: "official_balance_missing" });
      continue;
    }
    const result = await enableShopeeOfficialBalanceMode(wallet.id, "Shopee 钱包 v9 安全校准");
    enabled.push({
      shopId: wallet.shopSetting.shopId,
      walletId: wallet.id,
      balanceBefore: result.balanceBefore,
      officialBalance: result.officialBalance,
      adjustment: result.adjustment,
      pending: result.pending,
      cursorTransactionId: result.cursorTransactionId,
    });
  }

  const pending = await refreshShopeePendingSettlementBalances();
  const audit = await prisma.shopeeWalletAccount.findMany({
    where: { enabled: true },
    select: {
      id: true,
      name: true,
      walletType: true,
      balance: true,
      pendingBalance: true,
      officialBalanceMode: true,
      shopSetting: { select: { shopId: true, shopName: true } },
      _count: { select: { entries: true, withdrawals: true } },
    },
    orderBy: [{ shopSettingId: "asc" }, { walletType: "asc" }, { createdAt: "asc" }],
  });

  console.log(JSON.stringify({
    business,
    enabled,
    skipped,
    pending,
    wallets: audit.map((wallet) => ({
      ...wallet,
      balance: money(wallet.balance),
      pendingBalance: money(wallet.pendingBalance),
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
